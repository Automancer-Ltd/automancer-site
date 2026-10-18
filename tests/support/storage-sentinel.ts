/**
 * Runs a built page for real in happy-dom and reports every browser-storage
 * API it actually touches while loading.
 *
 * WHY THIS EXISTS, on top of the static grep in no-browser-storage.test.ts:
 * a static scan matches source text, so it only proves the LITERAL strings
 * `sessionStorage`, `document.cookie`, etc. are absent. Adversarial review
 * (AUT-6705) demonstrated that is not the same as proving the APIs are never
 * called — `window[["session", "Storage"].join("")].setItem(...)`,
 * `document["cookie"] = ...`, and `globalThis[["indexed", "DB"].join("")]`
 * all reach the real objects at runtime while evading a literal-string grep.
 *
 * This sentinel patches the real storage objects/accessors before any page
 * script runs, so a touch is caught by WHAT THE CODE DOES, not by how it
 * spelled the reference to get there.
 */
import { Window } from 'happy-dom';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DIST } from './dist';

/** Script `type` values that are actual executable JavaScript. */
const JS_SCRIPT_TYPES = new Set(['', 'text/javascript', 'module']);

export interface PageRunResult {
  /** One entry per storage-API touch, in the order they happened. */
  touches: string[];
  /**
   * One entry per script that could not be evaluated. A page with errors
   * cannot be trusted to have exercised its full code path, so callers
   * should treat this as a failure in its own right, not swallow it.
   */
  errors: string[];
}

/**
 * Patches `window` so any use of a browser-storage API — however the
 * reference to it was obtained — is recorded instead of (only) performed
 * silently. Storage still works underneath, so scripts that legitimately
 * inspect it after writing do not themselves throw.
 */
function instrument(window: Window, touches: string[], instrumentedWindows: WeakSet<Window>): void {
  if (instrumentedWindows.has(window)) return;
  instrumentedWindows.add(window);

  const record = (message: string) => touches.push(message);

  // Patch the shared Storage prototype, not only each instance. An own-property
  // patch can be bypassed with
  // `Object.getPrototypeOf(localStorage).setItem.call(localStorage, ...)`.
  // Instrumenting the prototype means computed access, a descriptor lookup, and
  // an explicit `.call()` all run through the same wrapper.
  const localStorage = window.localStorage;
  const sessionStorage = window.sessionStorage;
  const storagePrototype = Object.getPrototypeOf(localStorage) as Record<string, unknown>;
  for (const method of ['setItem', 'getItem', 'removeItem', 'clear', 'key'] as const) {
    const original = storagePrototype[method];
    if (typeof original !== 'function') continue;

    Object.defineProperty(storagePrototype, method, {
      value: function (this: unknown, ...args: unknown[]) {
        const storageName = this === localStorage ? 'localStorage' : this === sessionStorage ? 'sessionStorage' : 'Storage';
        record(`${storageName}.${method}(${args.map(String).join(', ')})`);
        return (original as (...a: unknown[]) => unknown).apply(this, args);
      },
      configurable: true,
      writable: true,
    });
  }

  // `cookie` is an accessor on Document.prototype; shadowing it on the
  // instance intercepts every read/write regardless of the property-name
  // spelling used to reach it (`document.cookie` and `document["cookie"]`
  // are the same property lookup at the engine level).
  let cookieJar = '';
  Object.defineProperty(window.document, 'cookie', {
    get() {
      record('document.cookie (read)');
      return cookieJar;
    },
    set(value: string) {
      record(`document.cookie = ${value}`);
      cookieJar = value;
    },
    configurable: true,
  });

  // happy-dom does not implement these, so a real script referencing them
  // would just throw "undefined is not a function" — which would hide a
  // genuine storage attempt behind a generic execution error. Stub them so
  // the reference itself, and any call on it, is recorded instead.
  for (const name of ['indexedDB', 'caches', 'openDatabase'] as const) {
    Object.defineProperty(window, name, {
      get() {
        record(`${name} (referenced)`);
        return new Proxy(
          {},
          {
            get: (_target, prop) =>
              (...args: unknown[]) => record(`${name}.${String(prop)}(${args.join(', ')})`),
          }
        );
      },
      configurable: true,
    });
  }
  Object.defineProperty(window.navigator, 'storage', {
    get() {
      record('navigator.storage (referenced)');
      return new Proxy(
        {},
        {
          get: (_target, prop) =>
            (...args: unknown[]) => record(`navigator.storage.${String(prop)}(${args.join(', ')})`),
        }
      );
    },
    configurable: true,
  });

  // A same-origin child frame has its own Window and Storage. Instrument it
  // lazily when page code first obtains `contentWindow`, which catches
  // `iframe.contentWindow.localStorage` without changing iframe creation or
  // application behaviour. happy-dom 21 only materialises `contentWindow` for a
  // frame that carries a document (`srcdoc`); an empty about:blank frame is left
  // null (a browser gives one), and page code that reaches for storage through
  // it raises an execution error the caller's `errors` assertion already fails
  // on, so the gap fails closed rather than silently passing.
  const iframePrototype = Object.getPrototypeOf(window.document.createElement('iframe'));
  const contentWindow = Object.getOwnPropertyDescriptor(iframePrototype, 'contentWindow');
  if (contentWindow?.get) {
    Object.defineProperty(iframePrototype, 'contentWindow', {
      get() {
        const frameWindow = contentWindow.get?.call(this) as Window | null;
        if (frameWindow) instrument(frameWindow, touches, instrumentedWindows);
        return frameWindow;
      },
      configurable: true,
    });
  }
}

/**
 * Loads one built page into happy-dom, runs its top-level inline and
 * same-origin external scripts, fires `DOMContentLoaded`, and reports any
 * browser-storage touch.
 *
 * Deliberately out of scope, same as the static test: cross-origin scripts
 * (the Cloudflare Turnstile widget) run in their own iframe/origin and are
 * not evaluated here — checked by observation instead, see /privacy. Also
 * out of scope: behaviour that only runs after a user interaction (a click
 * handler, a form submit), dynamic imports, and scripts inside an iframe
 * document. A page script's direct access to a same-origin iframe's storage
 * is instrumented, but the iframe document is not executed. This sentinel
 * proves the top-level load path, not every path.
 */
export function runPage(html: string): PageRunResult {
  const window = new Window({ url: 'https://automancer.uk/' });
  const touches: string[] = [];
  instrument(window, touches, new WeakSet());
  const errors: string[] = [];

  window.document.write(html);

  for (const script of Array.from(window.document.querySelectorAll('script'))) {
    const type = script.getAttribute('type');
    if (type !== null && !JS_SCRIPT_TYPES.has(type)) continue; // e.g. application/ld+json

    const src = script.getAttribute('src');
    let source: string;
    if (src) {
      if (/^https?:\/\//.test(src)) continue; // cross-origin, out of scope (see docstring)
      const distPath = join(DIST, src.replace(/^\//, ''));
      if (!existsSync(distPath)) {
        errors.push(`script src="${src}" does not exist in ${DIST}`);
        continue;
      }
      source = readFileSync(distPath, 'utf8');
    } else {
      source = script.textContent;
    }

    try {
      window.eval(source);
    } catch (error) {
      errors.push(`${src ?? 'inline script'}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  try {
    window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true, cancelable: true }));
  } catch (error) {
    errors.push(`DOMContentLoaded dispatch: ${error instanceof Error ? error.message : String(error)}`);
  }

  void window.happyDOM.close();

  return { touches, errors };
}
