/**
 * /privacy makes a FALSIFIABLE FACTUAL CLAIM about this site's behaviour:
 *
 *   outside the contact-page security check, loading the site "sets no
 *   cookies and stores nothing in your browser"
 *
 * That is not marketing copy — it is the stated reason there is no cookie
 * banner. If any code starts writing to the browser, the notice becomes a
 * false statement to visitors and to a regulator, and the missing banner
 * stops being defensible.
 *
 * It has already gone wrong once. A UTM-capture snippet wrote `aut-utm` to
 * sessionStorage on any URL carrying utm_* params, which contradicted the
 * claim for months before the 2026-08-22 audit (AUT-6414) found it. It was
 * found by loading the live site, not by reading code — nothing in the repo
 * connected the snippet to the sentence it falsified. This test is that
 * connection, so the next one fails in CI instead of shipping.
 *
 * Scope and honesty about it:
 *   - This greps the BUILT OUTPUT — inline scripts and every emitted JS
 *     asset, not just our own source. The test build has no Sentry DSN, so
 *     the lazily loaded Sentry chunk is not emitted here (a DSN build of
 *     @sentry/browser 11 references no storage API: checked 2026-10-22).
 *   - This is a STATIC scan of source text, not proof the APIs are never
 *     called. Adversarial review (AUT-6705, 2026-08-22) demonstrated that a
 *     computed reference — `window[["session", "Storage"].join("")]`,
 *     `document["cookie"]` — reaches the real API while evading a literal
 *     grep. This file exists because a static scan is fast, greppable, and
 *     names the exact offending line, which is worth keeping for the common
 *     case; the property this suite actually needs — proof the APIs are
 *     never CALLED, however they were referenced — is enforced by the
 *     behaviour-level check in tests/support/storage-sentinel.ts below,
 *     which actually executes the built page and cannot be evaded by
 *     spelling a reference differently.
 *   - Neither check can see storage written by a cross-origin iframe
 *     (Cloudflare Turnstile). That was checked by observation in the same
 *     audit and is disclosed in the notice as cf.turnstile.u in localStorage
 *     on challenges.cloudflare.com; it is out of scope here by necessity,
 *     not by oversight.
 *   - Comments count as references in the static scan. That is deliberate:
 *     a server-side comment costs nothing, and an HTML comment explaining
 *     why we do not use sessionStorage would otherwise sit in the shipped
 *     output where it defeats exactly this kind of grep audit — which is
 *     what happened to the first draft of the removal.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DIST, allHtmlFiles } from './support/dist';
import { runPage } from './support/storage-sentinel';

/**
 * Browser-storage APIs that would each falsify the notice if used by our own
 * site code. Word-boundary matched so unrelated identifiers do not trip them.
 */
const STORAGE_APIS = [
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'openDatabase',
  'document.cookie',
  'navigator.storage',
  'caches.open',
];

// Deliberately NOT global: this regex is shared across every line of every
// file and `.test()` on a /g regex advances lastIndex between calls, which
// silently returns false on alternating matches. A storage-detection test
// that misses every other hit is worse than no test.
const PATTERN = new RegExp(STORAGE_APIS.map((api) => api.replace(/\./g, '\\.')).join('|'));

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** Every emitted JavaScript asset, dist-relative. */
function allJsFiles(): { file: string; source: string }[] {
  return walk(DIST)
    .filter((f) => f.endsWith('.js'))
    .map((f) => ({
      file: f.slice(DIST.length + 1).split(/[\\/]/).join('/'),
      source: readFileSync(f, 'utf8'),
    }));
}

/** Context around each hit, so a failure names the offending line. */
function hits(source: string): string[] {
  return source
    .split('\n')
    .flatMap((line, i) =>
      PATTERN.test(line) ? [`line ${i + 1}: ${line.trim().slice(0, 200)}`] : []
    );
}

const REMEDY =
  '\n\nIf this write is genuinely necessary, it must be either strictly ' +
  'necessary under PECR or placed behind consent — AND /privacy must be ' +
  'updated, because it currently tells visitors we store nothing. Do not ' +
  'silence this test to make a build pass: the test is downstream of a ' +
  'published legal claim, not a style rule.';

describe('same-origin site code writes nothing to the browser', () => {
  it('no emitted JS asset touches browser storage', () => {
    const js = allJsFiles();

    // Without this, a build emitting no JS would pass vacuously.
    expect(
      js.length,
      `No .js assets found in ${DIST}. This test would pass without examining ` +
        'anything. Run `pnpm run build` and check it succeeded.'
    ).toBeGreaterThan(0);

    const offenders = js
      .map(({ file, source }) => ({ file, found: hits(source) }))
      .filter((o) => o.found.length > 0);

    expect(
      offenders.map((o) => `${o.file}\n  ${o.found.join('\n  ')}`).join('\n\n'),
      'A JS asset references browser storage, which falsifies the claim on ' +
        `/privacy that this site stores nothing in your browser.${REMEDY}`
    ).toBe('');
  });

  it('no inline script in any page touches browser storage', () => {
    const offenders = allHtmlFiles()
      .map((page) => {
        const inline = page.html.match(/<script[\s\S]*?<\/script>/gi) ?? [];
        return { route: page.route, found: inline.flatMap(hits) };
      })
      .filter((o) => o.found.length > 0);

    expect(
      offenders.map((o) => `${o.route}\n  ${o.found.join('\n  ')}`).join('\n\n'),
      'An inline script references browser storage, which falsifies the ' +
        `claim on /privacy that this site stores nothing in your browser.${REMEDY}`
    ).toBe('');
  });

  it('the removed UTM capture has not returned anywhere in the output', () => {
    // Named separately from the API scan because this one has history: it is
    // the specific regression this suite exists to catch, and naming it makes
    // a reintroduction obvious in the test report rather than generic.
    const offenders = [
      ...allJsFiles().map((j) => ({ where: j.file, source: j.source })),
      ...allHtmlFiles().map((p) => ({ where: p.route, source: p.html })),
    ].filter((o) => o.source.includes('aut-utm'));

    expect(
      offenders.map((o) => o.where).join(', '),
      'The `aut-utm` UTM capture was removed on 2026-08-22 (AUT-6414) by the ' +
        "data controller's decision, to keep /privacy's \"stores nothing in " +
        'your browser" claim literally true. It is back in the build output.' +
        REMEDY
    ).toBe('');
  });
});

describe('running the site touches nothing in the browser (behaviour-level)', () => {
  // One shared instrumented run per page, computed once and reused by both
  // assertions below — running the page twice would double the (already
  // real) cost of spinning up a happy-dom window per page.
  const runs = allHtmlFiles().map((page) => ({ page, result: runPage(page.html) }));

  it('every same-origin script executed cleanly', () => {
    // If a script throws, everything after the throw never ran — including
    // any storage write it contains. A page we could not fully execute is
    // not a page we can vouch for, so this is its own failure, not a
    // silently-ignored warning.
    const offenders = runs
      .filter(({ result }) => result.errors.length > 0)
      .map(({ page, result }) => `${page.route}\n  ${result.errors.join('\n  ')}`);

    expect(
      offenders.join('\n\n'),
      'A page script threw while executing in the behaviour-level sentinel ' +
        '(tests/support/storage-sentinel.ts), so it cannot vouch for the ' +
        'assertion below — the throw may have skipped a real storage write. ' +
        'Fix the script (or the sentinel, if the failure is an environment ' +
        'limitation) rather than ignoring this.'
    ).toBe('');
  });

  it('no page touches a browser-storage API at runtime, however it was referenced', () => {
    const offenders = runs
      .filter(({ result }) => result.touches.length > 0)
      .map(({ page, result }) => `${page.route}\n  ${result.touches.join('\n  ')}`);

    expect(
      offenders.join('\n\n'),
      'A page called a browser-storage API while actually running, which ' +
        'falsifies the claim on /privacy that this site stores nothing in ' +
        `your browser — regardless of how the API was referenced.${REMEDY}`
    ).toBe('');
  });
});
