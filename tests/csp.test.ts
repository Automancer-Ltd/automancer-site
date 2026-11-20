/**
 * The page Content Security Policy is how a visitor's own browser enforces the
 * no-tracking promise in VISION.md: a page may load and send only what this
 * build lists, starting from nothing (`default-src 'none'`). This reads the
 * policy every built page ships and fails when:
 *
 *   - a page has no policy, or its policy does not start from nothing;
 *   - a page may send data (connect-src) anywhere except this site, the
 *     error-report origin of the DSN this very build bundles and, on
 *     /contact/ only, the enquiry API;
 *   - the bundled DSN's origin is missing from a page's connect-src, which
 *     would make the browser silently refuse every error report;
 *   - any page but /contact/ may frame or script Turnstile;
 *   - a page lets plain strings into HTML or script sinks (Trusted Types), or
 *     may create a Trusted Types policy (only /contact/'s Turnstile loader);
 *   - any source is a wildcard, plain http, or allows eval.
 *
 * The browser-level proof (a refused request actually being refused) is in
 * tests/journey/security.spec.ts.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENDPOINT_URL } from '../src/config/site';
import { DIST, allHtmlFiles } from './support/dist';

const TURNSTILE = 'https://challenges.cloudflare.com';
const ENQUIRY_API = new URL(ENDPOINT_URL).origin;

function policyOf(html: string): Map<string, string[]> | null {
  const meta = /<meta http-equiv="content-security-policy" content="([^"]*)"/i.exec(html);
  if (!meta) return null;
  const policy = new Map<string, string[]>();
  for (const part of meta[1].split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/).filter(Boolean);
    if (name) policy.set(name.toLowerCase(), sources);
  }
  return policy;
}

/** Origin of the Sentry DSN the build bundled into the page-load bootstrap, or null. */
function bundledReportOrigin(): string | null {
  const dir = join(DIST, '_astro');
  const found = new Set<string>();
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    const text = readFileSync(join(dir, name), 'utf8');
    for (const m of text.matchAll(/["'`](https:\/\/[A-Za-z0-9]+@[^"'`/\s]+\/\d+)["'`]/g)) found.add(new URL(m[1]).origin);
  }
  expect(found.size, `more than one DSN origin bundled: ${[...found].join(', ')}`).toBeLessThanOrEqual(1);
  return [...found][0] ?? null;
}

const pages = allHtmlFiles().filter((p) => !p.isRedirectStub);

describe('page Content Security Policy', () => {
  const reportOrigin = bundledReportOrigin();

  it('the test build bundles a DSN, so connect-src is checked against a real origin', () => {
    expect(reportOrigin).not.toBeNull();
  });

  it.each(pages.map((p) => [p.route, p] as const))('%s starts from nothing and sends only where it must', (route, page) => {
    const policy = policyOf(page.html);
    expect(policy, `${route} ships no CSP meta tag`).not.toBeNull();
    if (!policy) return;
    const isContact = route === '/contact/';

    expect(policy.get('default-src')).toEqual(["'none'"]);
    expect(policy.get('base-uri')).toEqual(["'self'"]);
    expect(policy.get('form-action')).toEqual(["'self'"]);
    expect(policy.get('img-src')).toEqual(["'self'", 'data:']);
    expect(policy.get('font-src')).toEqual(["'self'"]);
    expect(policy.get('script-src-attr')).toEqual(["'none'"]);
    // Trusted Types: no string reaches an HTML or script sink; only /contact/
    // may create one policy, its Turnstile loader.
    expect(policy.get('require-trusted-types-for')).toEqual(["'script'"]);
    expect(policy.get('trusted-types')).toEqual(isContact ? ['turnstile'] : ["'none'"]);

    const connect = new Set(policy.get('connect-src'));
    const expected = new Set(["'self'", reportOrigin, ...(isContact ? [ENQUIRY_API] : [])]);
    expect(connect).toEqual(expected);

    expect(policy.get('frame-src') ?? null).toEqual(isContact ? [TURNSTILE] : null);
    expect(policy.get('script-src')?.includes(TURNSTILE)).toBe(isContact);

    for (const [name, sources] of policy) {
      for (const source of sources) {
        expect(source, `${route} ${name}`).not.toMatch(/^\*|^https?:\/\/\*|^http:|unsafe-eval|^https?:$/);
      }
    }
  });
});
