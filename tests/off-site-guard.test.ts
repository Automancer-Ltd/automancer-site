/**
 * The GitHub Pages copy sends its readers to automancer.uk (t23224).
 *
 * The edge Worker reads every file from automancer-ltd.github.io/automancer-site, so that address
 * serves the whole site too, without the Worker's frame-ancestors, COOP or nosniff: any site could
 * frame it. BaseLayout's first script replaces a *.github.io page with the same path on
 * automancer.uk. These tests run the exact bytes each built page ships against every kind of
 * address the site is read from, so a guard that would send production, the preview target or a
 * local run elsewhere fails here, not in front of a visitor.
 */
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { pageCheckPages } from './support/dist';

const GUARD = /<script>(if\(location\.hostname\.endsWith\('\.github\.io'\)\)[^<]*)<\/script>/;

/** Run a guard body as if loaded at `href`; the address it sends the reader to, or null. */
function sentTo(body: string, href: string): string | null {
  const url = new URL(href);
  let target: string | null = null;
  const location = {
    hostname: url.hostname,
    pathname: url.pathname,
    search: url.search,
    hash: url.hash,
    replace: (to: string) => { target = to; },
  };
  runInNewContext(body, { location });
  return target;
}

describe('the GitHub Pages copy', () => {
  const pages = pageCheckPages();

  it('is guarded on every page, first thing after the page policy and before anything is fetched', () => {
    const missing = pages.filter(({ html }) => {
      const head = html.slice(0, html.indexOf('</head>'));
      const guard = GUARD.exec(head);
      if (!guard) return true;
      const firstScript = head.indexOf('<script');
      const firstLink = head.search(/<link\b|<style\b/);
      const policy = head.indexOf('http-equiv="content-security-policy"');
      return firstScript !== guard.index || (firstLink !== -1 && firstLink < guard.index) || policy === -1 || policy > guard.index;
    }).map((p) => p.route);
    expect(missing, 'BaseLayout: the github.io guard must be the first script, after the CSP meta and before any <link> or <style>').toEqual([]);
  });

  it('is allowed by each page policy, so the browser runs it', () => {
    const blocked = pages.filter(({ html }) => {
      const body = GUARD.exec(html)?.[1];
      const policy = /http-equiv="content-security-policy" content="([^"]*)"/.exec(html)?.[1] ?? '';
      return !body || !policy.includes(`'sha256-${createHash('sha256').update(body).digest('base64')}'`);
    }).map((p) => p.route);
    expect(blocked).toEqual([]);
  });

  it('sends a reader of the GitHub Pages copy to the same page on automancer.uk', () => {
    const body = GUARD.exec(pages[0]!.html)![1]!;
    const pages_ = 'https://automancer-ltd.github.io/automancer-site';
    expect(sentTo(body, `${pages_}/services/?service=workflow-sprint#offers`)).toBe('https://automancer.uk/services/?service=workflow-sprint#offers');
    expect(sentTo(body, `${pages_}/`)).toBe('https://automancer.uk/');
    expect(sentTo(body, `${pages_}/field-notes/what-an-ai-agent-costs/`)).toBe('https://automancer.uk/field-notes/what-an-ai-agent-costs/');
    // A fork's or anyone else's Pages copy goes to automancer.uk too, never to their site.
    expect(sentTo(body, 'https://someone.github.io/automancer-site/contact/')).toBe('https://automancer.uk/contact/');
    expect(sentTo(body, 'https://someone.github.io/')).toBe('https://automancer.uk/');
  });

  it('leaves every other address alone: production, the preview target, local runs and translation proxies', () => {
    const body = GUARD.exec(pages[0]!.html)![1]!;
    for (const href of [
      'https://automancer.uk/services/',
      'https://www.automancer.uk/',
      'https://automancer-vps.taild6c90e.ts.net:4174/',
      'http://127.0.0.1:4399/contact/',
      'http://localhost:4321/',
      'https://automancer-uk.translate.goog/services/',
      'https://notgithub.io/',
    ]) expect(sentTo(body, href), href).toBeNull();
  });
});
