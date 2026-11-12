/**
 * Speculation Rules (BaseLayout.astro; decision in docs/PERFORMANCE.md) make the browser fetch and
 * render a page before the click. That is only acceptable while it never requests anything a click
 * would not, so this evaluates the shipped rules against every link the build emits:
 *
 *   - every link a rule matches is on this origin;
 *   - a prerendered link is an HTML page, never a file, and never /contact/: prerendering the
 *     contact page would load the third-party security check before the visitor chose the form,
 *     which the privacy notice discloses only for the contact page itself.
 *
 * `selector_matches` is treated as never matching, the strict direction: it only ever narrows
 * what a `not` clause lets through.
 */
import { describe, expect, it } from 'vitest';
import { SITE_URL, allHtmlFiles, distHasFile } from './support/dist';

interface Predicate {
  and?: Predicate[];
  or?: Predicate[];
  not?: Predicate;
  href_matches?: string | string[];
  selector_matches?: string | string[];
}
interface Rule {
  where: Predicate;
  eagerness?: string;
}
interface Rules {
  prerender?: Rule[];
  prefetch?: Rule[];
}

function holds(p: Predicate, url: string): boolean {
  if (p.and) return p.and.every((q) => holds(q, url));
  if (p.or) return p.or.some((q) => holds(q, url));
  if (p.not) return !holds(p.not, url);
  if (p.href_matches !== undefined) {
    const patterns = Array.isArray(p.href_matches) ? p.href_matches : [p.href_matches];
    return patterns.some((pattern) => new URLPattern(pattern, SITE_URL).test(url));
  }
  if (p.selector_matches !== undefined) return false;
  throw new Error(`unknown speculation-rules predicate: ${JSON.stringify(p)}`);
}

const pages = allHtmlFiles().filter((p) => !p.isRedirectStub);

function rulesOf(route: string): Rules {
  const page = pages.find((p) => p.route === route);
  const scripts = page?.doc.querySelectorAll('script[type="speculationrules"]') ?? [];
  expect(scripts.length, `${route}: expected exactly one speculationrules script`).toBe(1);
  return JSON.parse(scripts[0]!.textContent) as Rules;
}

describe('speculation rules', () => {
  it('ship once, as valid JSON, on every layout page', () => {
    for (const page of pages) rulesOf(page.route);
  });

  it('only ever speculate same-origin links, and prerender only HTML pages other than /contact/', () => {
    const wrong: string[] = [];
    for (const page of pages) {
      const rules = rulesOf(page.route);
      for (const a of page.doc.querySelectorAll('a[href]')) {
        const href = a.getAttribute('href') ?? '';
        if (/^(mailto|tel|javascript|data):/i.test(href) || href.startsWith('#')) continue;
        const url = new URL(href, SITE_URL + page.route);
        const prerender = (rules.prerender ?? []).some((r) => holds(r.where, url.href));
        const prefetch = (rules.prefetch ?? []).some((r) => holds(r.where, url.href));
        if ((prerender || prefetch) && url.origin !== SITE_URL) wrong.push(`${page.route}: speculates off-site ${href}`);
        if (!prerender) continue;
        if (url.pathname === '/contact/') wrong.push(`${page.route}: prerenders /contact/`);
        const file = url.pathname.endsWith('/') ? `${url.pathname.slice(1)}index.html` : '';
        if (!file || !distHasFile(file)) wrong.push(`${page.route}: prerenders ${href}, which is not an HTML page`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('do something: the nav pages are prerendered and /contact/ is fetched', () => {
    const rules = rulesOf('/');
    const at = (path: string, kind: keyof Rules) => (rules[kind] ?? []).some((r) => holds(r.where, `${SITE_URL}${path}`));
    for (const path of ['/', '/services/', '/work/', '/field-notes/', '/about/']) expect(at(path, 'prerender'), path).toBe(true);
    expect(at('/contact/', 'prefetch')).toBe(true);
    expect(at('/llms.txt', 'prefetch') || at('/llms.txt', 'prerender')).toBe(false);
  });
});
