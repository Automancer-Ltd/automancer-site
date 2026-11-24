/**
 * The built contact page must never show a visitor a raw machine code from
 * the lead API.
 *
 * On 2026-08-22 a live defect rendered the intake endpoint's error field
 * verbatim, and a visitor who failed the security check read
 * "turnstile_failed" on screen. It was fixed in 84fc512 + 9ac5d96
 * (LEAD_ERROR_COPY, LEAD_ERROR_FALLBACK, and every error branch routed
 * through copyFor()), but none of the suite's assertions covered it: this
 * file exists so that defect cannot come back green.
 *
 * HOW IT ASSERTS: behaviourally, not textually. The contact page's form
 * script (src/scripts/contact-form.ts, which Astro bundles into the page) is
 * lifted byte-for-byte out of dist/contact/index.html — the bytes GitHub
 * Pages serves — and run in that built page in happy-dom, with the intake
 * API stubbed. Send is pressed exactly as a visitor's browser would press
 * it. What lands in #form-error is the assertion surface:
 *   - every allowlisted code must produce ITS OWN human sentence;
 *   - an unknown or malformed payload must produce honest human copy and
 *     never echo an identifier back;
 *   - machine codes (lowercase_with_underscores, no spaces) and human
 *     sentences have different shapes, and both shapes are asserted.
 *
 * THE NEGATIVE CONTROL is the shipped defect: make copyFor() in
 * src/scripts/contact-form.ts return the API's own `error` string when it
 * has one (as the page did before 9ac5d96), rebuild and run this file. The
 * code-mapping tests below must go red, each failure naming the code a
 * visitor would have seen. If they stay green, this file is wrong, not the fix.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Window, type HTMLButtonElement, type HTMLElement, type HTMLInputElement } from 'happy-dom';
import { readDistFile } from './support/dist';
import { LEAD_ERROR_COPY } from '../src/config/site';

const PAGE = 'contact/index.html';

/**
 * The exact bytes of the contact page's form script as served: Astro bundles
 * src/scripts/contact-form.ts into the page itself, as one inline module.
 */
function builtContactScript(): string {
  const html = readDistFile(PAGE);
  expect(html, `${PAGE} missing from dist/ — the production build did not emit it`).toBeTruthy();

  const tags = html!.match(/<script\b[^>]*>[\s\S]*?<\/script>/g) ?? [];
  const candidates = tags.filter((t) => t.includes('contact-form'));
  expect(
    candidates,
    `expected exactly one inline script wiring up #contact-form in ${PAGE}, found ${candidates.length}. ` +
      'Extraction failed, so everything below would prove nothing.'
  ).toHaveLength(1);
  // It runs as a classic script here: it must import and export nothing.
  expect(candidates[0], 'the form script imports or exports, so it no longer stands alone in the page').not.toMatch(
    /\b(?:import|export)\s*[{*"'`\w]/,
  );

  return candidates[0].replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
}

interface StubResponse {
  status?: number;
  /** JSON the stubbed lead API answers with. */
  body?: unknown;
  /** Error thrown by fetch (e.g. AbortError / TimeoutError on network timeout). */
  reject?: Error;
}

type FieldName = 'name' | 'email' | 'company' | 'time_sink' | 'team_size' | 'extra' | 'website';

interface ContactPage {
  window: Window;
  field(name: FieldName): HTMLInputElement;
  /** Press Send and wait until the form has finished with the submission. */
  submit(): Promise<void>;
  /** What #form-error shows. */
  readonly shown: string;
  readonly recoveryVisible: boolean;
  readonly submitBtn: HTMLButtonElement;
  /** The enquiry bodies the page posted to the intake API. */
  readonly requests: string[];
  readonly lastFetchInit: RequestInit | undefined;
}

const pages: Window[] = [];
afterEach(async () => {
  await Promise.all(pages.splice(0).map((w) => w.happyDOM.close()));
});

/**
 * The built /contact/ page in a DOM, its served form script running, the
 * security check already passed (Turnstile answers with a token) and the
 * intake API stubbed with `response`. Each call is a fresh visit.
 */
function openContactPage(
  scriptText: string,
  response: StubResponse,
  values?: Partial<Record<FieldName, string>>,
): ContactPage {
  const window = new Window({
    url: 'https://automancer.uk/contact/',
    settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true, disableIframePageLoading: true },
  });
  pages.push(window);
  window.document.write(readDistFile(PAGE)!.replace(/<script\b[\s\S]*?<\/script>/gi, ''));
  const form = window.document.querySelector<HTMLElement>('form#contact-form')!;
  const field = (name: FieldName) => form.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
  const filled: Record<FieldName, string> = {
    name: 'Test Visitor',
    email: 'visitor@example.com',
    company: '',
    time_sink: 'We retype the same numbers into three systems.',
    team_size: '',
    extra: '',
    website: '',
    ...values,
  };
  for (const [name, value] of Object.entries(filled)) field(name as FieldName).value = value;

  const requests: string[] = [];
  let lastFetchInit: RequestInit | undefined;
  window.fetch = async (_url, init) => {
    if (init?.method === 'OPTIONS') return new window.Response(null, { status: 204 });
    if (typeof init?.body !== 'string') throw new Error('Expected a JSON enquiry body');
    requests.push(init.body);
    lastFetchInit = init as RequestInit;
    if (response.reject) throw response.reject;
    return new window.Response(JSON.stringify(response.body ?? null), { status: response.status ?? 200 });
  };
  window.eval(scriptText);
  // Turnstile has loaded (its api.js calls onTurnstileLoad) and the visitor passed it.
  const turnstile = { getResponse: () => 'test-token', reset() {}, render() {} };
  Object.assign(window, { turnstile });
  (window as unknown as { onTurnstileLoad(): void }).onTurnstileLoad();

  const submitBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  expect(form.hidden, 'the served script never took over the form (it is still hidden)').toBe(false);
  return {
    window,
    field,
    async submit() {
      form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
      // Send is disabled from the moment an enquiry leaves until the page has its answer.
      await vi.waitFor(() => expect(submitBtn.disabled).toBe(false));
    },
    get shown() {
      return window.document.querySelector('#form-error')!.textContent;
    },
    get recoveryVisible() {
      return !window.document.querySelector<HTMLElement>('#form-recovery')!.hidden;
    },
    submitBtn,
    requests,
    get lastFetchInit() {
      return lastFetchInit;
    },
  };
}

/** Submit once (or `submissions` times) and return what #form-error shows. */
async function driveForm(scriptText: string, response: StubResponse, submissions = 1): Promise<string> {
  return (await driveFormState(scriptText, response, submissions)).shown;
}

async function driveFormState(
  scriptText: string,
  response: StubResponse,
  submissions = 1,
  values?: Partial<Record<FieldName, string>>,
): Promise<ContactPage> {
  const page = openContactPage(scriptText, response, values);
  for (let i = 0; i < submissions; i++) await page.submit();
  return page;
}

/** Whole-string shape of an API error code: lowercase snake_case, no spaces. */
const MACHINE_CODE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;

/** A machine-code token anywhere inside otherwise-sentence copy. */
const MACHINE_CODE_TOKEN = /[a-z]{2,}_[a-z]{2,}/;

/**
 * Whatever the form displays must read as a sentence a human wrote — which
 * machine codes cannot accidentally satisfy: they are lowercase with
 * underscores and carry no spaces.
 */
function assertHumanCopy(shown: string, context: string): void {
  const text = shown.trim();
  expect(
    text.length,
    `${context}: #form-error stayed empty — this branch was never exercised`
  ).toBeGreaterThan(0);
  expect(
    text,
    `${context}: visitor was shown "${shown}" — a bare machine code, not copy`
  ).not.toMatch(MACHINE_CODE);
  expect(
    text,
    `${context}: visitor was shown "${shown}" — it contains a machine-code token`
  ).not.toMatch(MACHINE_CODE_TOKEN);
  expect(/\s/.test(text), `${context}: "${shown}" has no spaces — not a sentence`).toBe(true);
  expect(
    /^[A-Z"'“‘]/.test(text),
    `${context}: "${shown}" does not start like a sentence`
  ).toBe(true);
  expect(
    /[.!?]["”’)]?$/.test(text),
    `${context}: "${shown}" does not end like a finished sentence`
  ).toBe(true);
}

describe('the built contact page never shows a lead-API machine code', () => {
  const script = builtContactScript();

  it('replays the shipped incident: a failed security check shows the human sentence, never "turnstile_failed"', async () => {
    const shown = await driveForm(script, { status: 403, body: { error: 'turnstile_failed' } });
    expect(
      shown,
      `a visitor failing the security check was shown "${shown}" — the raw machine code ` +
        '"turnstile_failed" reached the screen again'
    ).not.toContain('turnstile_failed');
    expect(shown).toBe(LEAD_ERROR_COPY.turnstile_failed);
  });

  it('maps every allowlisted code to its own human sentence on every error branch that carries one', async () => {
    expect(
      Object.keys(LEAD_ERROR_COPY).length,
      'LEAD_ERROR_COPY is empty in src/config/site.ts — the loop below audited nothing'
    ).toBeGreaterThan(0);

    for (const [code, sentence] of Object.entries(LEAD_ERROR_COPY)) {
      for (const status of [400, 403, 429]) {
        const shown = await driveForm(script, { status, body: { error: code } });
        expect(
          shown,
          `HTTP ${status} carrying "${code}": the visitor saw "${shown}" instead of the map's sentence`
        ).toBe(sentence);
      }
    }
  });

  it('an UNKNOWN backend code gets honest human copy, and the identifier never reaches the screen', async () => {
    for (const status of [400, 403, 429]) {
      const shown = await driveForm(script, { status, body: { error: 'some_new_backend_code' } });
      expect(
        shown,
        `HTTP ${status}: an unknown backend code was echoed back verbatim ("${shown}")`
      ).not.toContain('some_new_backend_code');
      assertHumanCopy(shown, `HTTP ${status} with unknown code`);
    }
  });

  it('a malformed or absent error payload still produces human copy', async () => {
    const payloads: unknown[] = [
      {},
      { error: '' },
      { error: null },
      { error: { leak: 'internal_detail' } },
    ];
    for (const status of [400, 403]) {
      for (const body of payloads) {
        const shown = await driveForm(script, { status, body });
        assertHumanCopy(shown, `HTTP ${status}, payload ${JSON.stringify(body)}`);
        expect(shown, `HTTP ${status}, payload ${JSON.stringify(body)}: JS artefact shown`).not.toContain(
          '[object Object]'
        );
        expect(shown, `HTTP ${status}, payload ${JSON.stringify(body)}: "undefined" shown`).not.toContain(
          'undefined'
        );
      }
    }
  });

  it('even a REPEATED security-check failure — the our-fault case — names no code and offers the email route', async () => {
    for (const code of ['turnstile_failed', 'some_new_backend_code']) {
      const { shown, recoveryVisible } = await driveFormState(script, { status: 403, body: { error: code } }, 2);
      expect(
        shown,
        `second consecutive 403 carrying "${code}": visitor saw "${shown}" — the code leaked through ` +
          'the repeated-failure branch'
      ).not.toContain(code);
      assertHumanCopy(shown, `repeated 403 with "${code}"`);
      expect(recoveryVisible).toBe(true);
    }
  });
});

describe('client-side validation moves focus to the first invalid field', () => {
  const script = builtContactScript();

  it('keeps malformed reply addresses out of intake and allows a corrected address', async () => {
    const page = openContactPage(script, { status: 200, body: { ok: true } });
    const email = page.field('email');
    for (const address of ['visitor@', 'visitor@@example.test', 'visitor name@example.test']) {
      email.value = address;
      await page.submit();
      expect(page.requests, `${address} must be corrected before using an intake request`).toHaveLength(0);
      expect(page.window.document.activeElement).toBe(email);
      expect(email.getAttribute('aria-invalid')).toBe('true');
    }

    email.value = 'visitor+enquiry@example.test';
    await page.submit();
    expect(page.window.document.querySelector<HTMLElement>('#form-confirm')!.style.display).toBe('block');
    expect(page.requests).toHaveLength(1);
    expect(JSON.parse(page.requests[0]).email).toBe('visitor+enquiry@example.test');
    expect(email.hasAttribute('aria-invalid')).toBe(false);
  });

  it('empty name: focuses #name, scrolls it into view, and associates the message', async () => {
    const page = openContactPage(script, { status: 200 }, { name: '' });
    const name = page.field('name');
    const scrolled = vi.spyOn(name, 'scrollIntoView');
    await page.submit();
    expect(page.shown).toBe('Please add your name.');
    expect(page.requests, 'empty-name submit must not hit the intake endpoint').toHaveLength(0);
    expect(page.window.document.activeElement, 'validation failed on name but name was not focused').toBe(name);
    expect(scrolled, 'validation failed on name but scrollIntoView() was never called').toHaveBeenCalled();
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(name.getAttribute('aria-describedby')).toBe('form-error');
  });

  it('missing email with a name present focuses email, not name', async () => {
    const page = openContactPage(script, { status: 200 }, { email: '' });
    const email = page.field('email');
    const scrolled = vi.spyOn(email, 'scrollIntoView');
    await page.submit();
    expect(page.shown).toMatch(/valid email/i);
    expect(page.requests).toHaveLength(0);
    expect(page.window.document.activeElement).toBe(email);
    expect(scrolled).toHaveBeenCalled();
    expect(email.getAttribute('aria-invalid')).toBe('true');
    expect(email.getAttribute('aria-describedby')).toBe('form-error');
    expect(page.field('name').getAttribute('aria-invalid')).toBeNull();
  });
});

describe('the published message limit', () => {
  const script = builtContactScript();
  const limit = (JSON.parse(readDistFile('api/enquiry.json')!) as { combinedMessage: { maxLength: number } })
    .combinedMessage.maxLength;

  it('refuses a message over /api/enquiry.json\'s combined limit before sending, and sends one at it', async () => {
    const over = openContactPage(script, { status: 200, body: { ok: true } }, { time_sink: 'x'.repeat(limit + 1) });
    await over.submit();
    expect(over.shown).toContain(`${limit}-character limit`);
    expect(over.requests).toHaveLength(0);

    const at = openContactPage(script, { status: 200, body: { ok: true } }, { time_sink: 'x'.repeat(limit) });
    await at.submit();
    expect(at.requests).toHaveLength(1);
    expect((JSON.parse(at.requests[0]) as { message: string }).message).toHaveLength(limit);
  });
});

describe('aborted or timed-out submission', () => {
  const script = builtContactScript();

  it('passes an AbortSignal timeout to fetch and restores form with direct email fallback on abort', async () => {
    const abortError = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    const result = await driveFormState(script, { reject: abortError });

    expect(result.lastFetchInit?.signal, 'fetch call must receive an AbortSignal').toBeInstanceOf(result.window.AbortSignal);
    expect(result.shown).toContain('Couldn’t reach us just now.');
    expect(result.recoveryVisible).toBe(true);
    assertHumanCopy(result.shown, 'aborted fetch error');
    expect(result.submitBtn.disabled).toBe(false);
    expect(result.submitBtn.textContent).toBe('Send it to Waseem');
  });
});


describe('Turnstile widget execution errors', () => {
  const script = builtContactScript();

  it('handles 600010, gives the visitor an email fallback, and does not leak an error code', () => {
    const html = readDistFile(PAGE)!;
    expect(html).toContain('data-error-callback="onTurnstileError"');

    const page = openContactPage(script, { status: 200 });
    const onError = (page.window as unknown as { onTurnstileError?: () => boolean }).onTurnstileError;
    expect(onError, 'the widget error callback was not installed globally').toBeTypeOf('function');
    expect(onError!()).toBe(true);
    expect(page.shown).toMatch(/security check could not load/i);
    expect(page.recoveryVisible).toBe(true);
    expect(page.shown).not.toContain('600010');
    expect(page.shown).not.toContain('TurnstileError');
  });
});
