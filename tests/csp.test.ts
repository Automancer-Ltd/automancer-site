/**
 * The page Content Security Policy is how a visitor's own browser enforces the
 * no-tracking promise in VISION.md: a page may load and send only what this
 * build lists, starting from nothing (`default-src 'none'`). This reads the
 * policy every built page ships and fails when:
 *
 *   - a page has no policy, or its policy does not start from nothing;
 *   - a page may send data (connect-src) anywhere except this site and, on
 *     /contact/ only, the enquiry API. Error reports go to this site too: the
 *     SDK posts them to the edge Worker's ERROR_TUNNEL (t24432), so the
 *     bundled DSN's own origin, Sentry's, must never be in connect-src;
 *   - the bundled SDK does not post to ERROR_TUNNEL, so the browser would
 *     refuse every error report;
 *   - any page runs a script from another origin: Turnstile runs only in the
 *     security check frame on its own host, which /contact/ alone may frame
 *     (t27305), so Cloudflare's script never shares a page with the form;
 *   - a page lets plain strings into HTML or script sinks or creates a
 *     Trusted Types policy;
 *   - inline styles are blocked or allowed without a hash;
 *   - any source is a wildcard, plain http, or allows eval.
 *
 * The browser-level proof (a refused request actually being refused) is in
 * tests/journey/security.spec.ts.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENDPOINT_URL, SECURITY_CHECK_URL } from '../src/config/site';
import { ERROR_TUNNEL } from '../ops/edge/worker.js';
import { DIST, allHtmlFiles } from './support/dist';

const SECURITY_CHECK = new URL(SECURITY_CHECK_URL).origin;
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

const pages = allHtmlFiles();

describe('page Content Security Policy', () => {
  const reportOrigin = bundledReportOrigin();

  it('the test build bundles a DSN, so connect-src is checked against a real origin', () => {
    expect(reportOrigin).not.toBeNull();
  });

  it('the bundled SDK posts its reports to the edge Worker on this site', () => {
    const bootstrap = readdirSync(join(DIST, '_astro'))
      .filter((n) => n.endsWith('.js'))
      .map((n) => readFileSync(join(DIST, '_astro', n), 'utf8'))
      .filter((text) => /["'`]https:\/\/[A-Za-z0-9]+@[^"'`/\s]+\/\d+["'`]/.test(text));
    expect(bootstrap.length).toBeGreaterThan(0);
    for (const text of bootstrap) expect(text).toMatch(new RegExp(`tunnel:["'\`]${ERROR_TUNNEL}["'\`]`));
  });

  it.each(pages.map((p) => [p.route, p] as const))('%s starts from nothing and sends only where it must', (route, page) => {
    const policy = policyOf(page.html);
    expect(policy, `${route} ships no CSP meta tag`).not.toBeNull();
    if (!policy) return;

    expect(policy.get('default-src')).toEqual(["'none'"]);
    expect(policy.get('base-uri')).toEqual(["'self'"]);
    expect(policy.get('script-src-attr')).toEqual(["'none'"]);
    // Trusted Types: no page can create a policy or write strings to script sinks.
    expect(policy.get('require-trusted-types-for')).toEqual(["'script'"]);
    expect(policy.get('trusted-types')).toEqual(["'none'"]);

    if (page.isRedirectStub) {
      expect(policy.get('form-action')).toEqual(["'none'"]);
      expect(policy.get('connect-src') ?? null).toBeNull();
      expect(policy.get('frame-src') ?? null).toBeNull();
      expect(policy.get('script-src') ?? null).toBeNull();
    } else {
      const isContact = route === '/contact/';
      expect(policy.get('form-action')).toEqual(["'self'"]);
      expect(policy.get('img-src')).toEqual(["'self'", 'data:']);
      expect(policy.get('font-src')).toEqual(["'self'"]);

      const connect = new Set(policy.get('connect-src'));
      const expected = new Set(["'self'", ...(isContact ? [ENQUIRY_API] : [])]);
      expect(connect).toEqual(expected);
      expect(connect.has(reportOrigin ?? ""), `${route} lets the browser post to Sentry itself`).toBe(false);

      expect(policy.get('frame-src') ?? null).toEqual(isContact ? [SECURITY_CHECK] : null);
      // Only this site's own scripts, on every page: no origin, host or scheme source at all.
      expect(policy.get('script-src')?.filter((source) => !source.startsWith("'"))).toEqual([]);

      const styleSources = policy.get('style-src-elem') ?? policy.get('style-src') ?? [];
      expect(styleSources).not.toContain("'unsafe-inline'");
      for (const style of page.doc.querySelectorAll('style')) {
        const hash = createHash('sha256').update(style.rawText).digest('base64');
        expect(styleSources, `${route} has a stylesheet the browser would block`).toContain(`'sha256-${hash}'`);
      }
    }

    for (const [name, sources] of policy) {
      for (const source of sources) {
        expect(source, `${route} ${name}`).not.toMatch(/^\*|^https?:\/\/\*|^http:|unsafe-eval|^https?:$/);
      }
    }
  });
});
