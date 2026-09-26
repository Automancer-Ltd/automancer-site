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
 * HOW IT ASSERTS: behaviourally, not textually. The contact page's inline
 * script is lifted byte-for-byte out of dist/contact/index.html — the bytes
 * GitHub Pages serves — and executed against a stub DOM and a stubbed fetch;
 * the captured submit handler is then driven exactly as a visitor's browser
 * would drive it. What lands in #form-error is the assertion surface:
 *   - every allowlisted code must produce ITS OWN human sentence;
 *   - an unknown or malformed payload must produce honest human copy and
 *     never echo an identifier back;
 *   - machine codes (lowercase_with_underscores, no spaces) and human
 *     sentences have different shapes, and both shapes are asserted.
 *
 * THE NEGATIVE CONTROL is git history, not imagination:
 *   git show 9ac5d96^:src/pages/contact.astro > src/pages/contact.astro
 * rebuild and run this file — every behavioural test below must go red,
 * each failure naming the code a visitor would have seen. If it stays green
 * against that file, this file is wrong, not the fix.
 */
import { describe, expect, it } from 'vitest';
import { readDistFile } from './support/dist';
import { LEAD_ERROR_COPY, LEAD_ERROR_FALLBACK } from '../src/config/site';

const PAGE = 'contact/index.html';

/**
 * The exact bytes of the contact page's inline logic script as served,
 * including the define:vars preamble Astro injects (endpoint, limits, email,
 * errorCopy, errorFallback as leading const declarations inside the same
 * <script> tag).
 */
function builtContactScript(): string {
  const html = readDistFile(PAGE);
  expect(html, `${PAGE} missing from dist/ — the production build did not emit it`).toBeTruthy();

  const tags = html!.match(/<script\b[^>]*>[\s\S]*?<\/script>/g) ?? [];
  const candidates = tags.filter((t) => t.includes("getElementById('contact-form')"));
  expect(
    candidates,
    `expected exactly one inline script wiring up #contact-form in ${PAGE}, found ${candidates.length}. ` +
      'Extraction failed, so everything below would prove nothing.'
  ).toHaveLength(1);

  return candidates[0].replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
}

interface StubResponse {
  status?: number;
  /** JSON the stubbed lead API answers with. */
  body?: unknown;
  /** Error thrown by fetch (e.g. AbortError / TimeoutError on network timeout). */
  reject?: Error;
}

interface FieldStub {
  value: string;
  focusCalls: number;
  scrollCalls: unknown[];
  attrs: Record<string, string>;
  focus(): void;
  scrollIntoView(opts?: unknown): void;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  removeAttribute(name: string): void;
}

interface DriveResult {
  shown: string;
  fields: Record<string, FieldStub>;
  fetchCalls: number;
  lastFetchInit?: RequestInit;
  submitBtn: { disabled: boolean; textContent: string };
}

/**
 * Execute the served script against browser-shaped stubs, press the form's
 * submit button `submissions` times, and return whatever text ended up in
 * #form-error plus the field stubs (focus / aria). Each call gets a fresh
 * page state, matching a fresh visit.
 */
async function driveForm(
  scriptText: string,
  response: StubResponse,
  submissions = 1,
  values?: Partial<Record<'name' | 'email' | 'company' | 'time_sink' | 'team_size' | 'extra' | 'website', string>>,
): Promise<string> {
  return (await driveFormState(scriptText, response, submissions, values)).shown;
}

async function driveFormState(
  scriptText: string,
  response: StubResponse,
  submissions = 1,
  values?: Partial<Record<'name' | 'email' | 'company' | 'time_sink' | 'team_size' | 'extra' | 'website', string>>,
): Promise<DriveResult> {
  // textContent coerces on assignment in a real DOM (an object becomes
  // "[object Object]" on screen); mirror that so leaks fail as named
  // strings rather than as harness TypeErrors.
  const errEl = {
    style: {} as Record<string, string>,
    _text: '',
    get textContent(): string {
      return this._text;
    },
    set textContent(value: unknown) {
      this._text = value === null ? '' : String(value);
    },
  };
  const confirmEl = { style: {} as Record<string, string>, scrollIntoView() {} };
  const btnLabel = { textContent: '' };
  const submitBtn = { disabled: false, querySelector: () => btnLabel };

  type SubmitHandler = (event: { preventDefault(): void }) => Promise<void>;
  let onSubmit: SubmitHandler | null = null;
  let fetchCalls = 0;
  let capturedFetchInit: RequestInit | undefined;

  const field = (value: string): FieldStub => {
    const attrs: Record<string, string> = {};
    return {
      value,
      focusCalls: 0,
      scrollCalls: [],
      attrs,
      focus() {
        this.focusCalls += 1;
      },
      scrollIntoView(opts?: unknown) {
        this.scrollCalls.push(opts ?? null);
      },
      setAttribute(name: string, value: string) {
        attrs[name] = value;
      },
      getAttribute(name: string) {
        return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
      },
      removeAttribute(name: string) {
        delete attrs[name];
      },
    };
  };

  const fields = {
    name: field(values?.name ?? 'Test Visitor'),
    company: field(values?.company ?? ''),
    email: field(values?.email ?? 'visitor@example.com'),
    time_sink: field(values?.time_sink ?? 'We retype the same numbers into three systems.'),
    team_size: field(values?.team_size ?? ''),
    extra: field(values?.extra ?? ''),
    website: field(values?.website ?? ''),
  };

  const form = {
    name: fields.name,
    company: fields.company,
    email: fields.email,
    time_sink: fields.time_sink,
    team_size: fields.team_size,
    extra: fields.extra,
    website: fields.website,
    style: {} as Record<string, string>,
    addEventListener(type: string, handler: SubmitHandler): void {
      if (type === 'submit') onSubmit = handler;
    },
    querySelector(selector: string): unknown {
      if (selector === 'button[type="submit"]') return submitBtn;
      // No Turnstile widget object -> the script falls back to this input.
      if (selector === '[name="cf-turnstile-response"]') return field('test-token');
      return null;
    },
  };

  const documentStub = {
    getElementById(id: string): unknown {
      if (id === 'contact-form') return form;
      if (id === 'form-error') return errEl;
      if (id === 'form-confirm') return confirmEl;
      return null;
    },
  };

  // Named parameters shadow Node globals, so the served bytes see exactly
  // what a browser hands a page: no Turnstile yet, no stored utm state, and
  // a fetch that answers with the stubbed response.
  new Function(
    'document',
    'window',
    'fetch',
    'sessionStorage',
    'location',
    'URLSearchParams',
    scriptText,
  )(
    documentStub,
    {},
    async (_url: string, init?: RequestInit) => {
      fetchCalls += 1;
      capturedFetchInit = init;
      if (response.reject) throw response.reject;
      return { status: response.status ?? 200, json: async () => response.body };
    },
    { getItem: () => null },
    { search: '' },
    URLSearchParams,
  );

  expect(
    onSubmit,
    'the built page registered no submit handler — nothing was exercised'
  ).toBeTypeOf('function');

  for (let i = 0; i < submissions; i++) {
    await onSubmit!({ preventDefault() {} });
  }
  return {
    shown: errEl.textContent,
    fields,
    fetchCalls,
    lastFetchInit: capturedFetchInit,
    submitBtn: {
      disabled: submitBtn.disabled,
      textContent: btnLabel.textContent,
    },
  };
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
      const shown = await driveForm(script, { status: 403, body: { error: code } }, 2);
      expect(
        shown,
        `second consecutive 403 carrying "${code}": visitor saw "${shown}" — the code leaked through ` +
          'the repeated-failure branch'
      ).not.toContain(code);
      assertHumanCopy(shown, `repeated 403 with "${code}"`);
      expect(
        shown,
        'the repeated-failure copy must offer the direct email route'
      ).toMatch(/email\s+\S+@automancer\.uk/);
    }
  });
});

describe('LEAD_ERROR_COPY and LEAD_ERROR_FALLBACK are wired into the built page', () => {
  /**
   * The map being DEFINED in src/config/site.ts proves nothing — the shape
   * that shipped was a map nobody consulted. These checks pin the served
   * bytes; the behavioural describe above pins their use (shown text equal
   * to a map entry is only possible if the served script consults the map
   * it carries).
   */
  const html = readDistFile(PAGE) ?? '';

  it('ships every allowlist sentence in the served bytes', () => {
    expect(Object.keys(LEAD_ERROR_COPY).length, 'allowlist empty — nothing checked').toBeGreaterThan(0);
    for (const [code, sentence] of Object.entries(LEAD_ERROR_COPY)) {
      expect(
        html.includes(sentence),
        `"${code}" copy is absent from ${PAGE} — the map exists in src but never reached the build`
      ).toBe(true);
      assertHumanCopy(sentence, `LEAD_ERROR_COPY["${code}"] itself`);
    }
  });

  it('ships the fallback alongside it, and the script binds both names', () => {
    expect(
      html.includes(LEAD_ERROR_FALLBACK),
      `LEAD_ERROR_FALLBACK is absent from ${PAGE}`
    ).toBe(true);
    expect(/\berrorCopy\b/.test(html), 'the built page never binds errorCopy').toBe(true);
    expect(/\berrorFallback\b/.test(html), 'the built page never binds errorFallback').toBe(true);
  });

  it('guards the guards: the shape detector really recognises machine codes', () => {
    expect(MACHINE_CODE.test('turnstile_failed')).toBe(true);
    expect(MACHINE_CODE_TOKEN.test('we render turnstile_failed here')).toBe(true);
    expect(MACHINE_CODE.test(LEAD_ERROR_FALLBACK)).toBe(false);
    expect(MACHINE_CODE_TOKEN.test(LEAD_ERROR_FALLBACK)).toBe(false);
    expect(MACHINE_CODE_TOKEN.test('The security check did not go through.')).toBe(false);
  });
});

describe('client-side validation moves focus to the first invalid field', () => {
  const script = builtContactScript();

  it('empty name: focuses #name, scrolls it into view, and associates the message', async () => {
    const result = await driveFormState(script, { status: 200 }, 1, { name: '' });
    expect(result.shown).toBe('Please add your name.');
    expect(result.fetchCalls, 'empty-name submit must not hit the intake endpoint').toBe(0);
    expect(
      result.fields.name.focusCalls,
      'validation failed on name but focus() was never called'
    ).toBeGreaterThan(0);
    expect(
      result.fields.name.scrollCalls.length,
      'validation failed on name but scrollIntoView() was never called'
    ).toBeGreaterThan(0);
    expect(result.fields.name.getAttribute('aria-invalid')).toBe('true');
    expect(result.fields.name.getAttribute('aria-describedby')).toBe('form-error');
    expect(result.fields.email.focusCalls, 'focused email instead of the first invalid field').toBe(0);
  });

  it('missing email with a name present focuses email, not name', async () => {
    const result = await driveFormState(script, { status: 200 }, 1, { email: '' });
    expect(result.shown).toMatch(/valid email/i);
    expect(result.fetchCalls).toBe(0);
    expect(result.fields.email.focusCalls).toBeGreaterThan(0);
    expect(result.fields.email.scrollCalls.length).toBeGreaterThan(0);
    expect(result.fields.email.getAttribute('aria-invalid')).toBe('true');
    expect(result.fields.email.getAttribute('aria-describedby')).toBe('form-error');
    expect(result.fields.name.focusCalls).toBe(0);
    expect(result.fields.name.getAttribute('aria-invalid')).toBeNull();
  });
});

describe('aborted or timed-out submission', () => {
  const script = builtContactScript();

  it('passes an AbortSignal timeout to fetch and restores form with direct email fallback on abort', async () => {
    const abortError = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    const result = await driveFormState(script, { reject: abortError });

    expect(result.lastFetchInit?.signal, 'fetch call must receive an AbortSignal').toBeInstanceOf(AbortSignal);
    expect(result.shown).toContain('Couldn’t reach us just now.');
    expect(result.shown).toMatch(/email\s+\S+@automancer\.uk/);
    assertHumanCopy(result.shown, 'aborted fetch error');
    expect(result.submitBtn.disabled).toBe(false);
    expect(result.submitBtn.textContent).toBe('Send it to Waseem');
  });
});

