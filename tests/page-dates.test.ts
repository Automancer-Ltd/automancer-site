/**
 * Page dates (src/integrations/page-dates.ts): lastModified in /api/pages.json
 * and the sitemap is when a page's words last changed on the live site.
 *
 * Until t19631 every deploy dated every static page to the build, telling
 * agents and search engines that unchanged pages had changed. These tests
 * hold the rule that stops that: a deploy that changes no words changes no
 * date, and the sitemap publishes the same dates as the page index.
 */
import { describe, expect, it } from 'vitest';
import { readDistFile } from './support/dist';
import { datePages, pageWords, sha256, type IndexedPage } from '../src/integrations/page-dates';

const BUILD = '2026-11-12T09:00:00.000Z';
const html = (main: string) => `<html><body><header>nav</header><main>${main}</main><footer>deployed 2 min ago</footer></body></html>`;
const page = (url: string, lastModified: string, main: string) => ({
  page: { url, title: url, description: 'd', lastModified } as IndexedPage,
  html: html(main),
});

describe('dating pages against what production serves', () => {
  const home = page('https://automancer.uk/', BUILD, '<h1>Hello</h1><p>From £450</p>');
  const services = page('https://automancer.uk/services/', BUILD, '<h1>Services</h1><p>From £495</p>');
  const note = page('https://automancer.uk/field-notes/new/', '2026-11-10T00:00:00.000Z', '<p>New note</p>');
  const all = [home, services, note];
  const wordsOf = (p: IndexedPage) => pageWords(p, all.find((x) => x.page.url === p.url)!.html);
  const hashOf = (x: (typeof all)[number]) => sha256(pageWords(x.page, x.html));

  it('keeps the served date for unchanged words, dates changed words to this build, and leaves new pages their own date', () => {
    const served = new Map([
      [home.page.url, { contentSha256: hashOf(home), lastModified: '2026-11-01T08:00:00.000Z' }],
      [services.page.url, { contentSha256: 'f'.repeat(64), lastModified: '2026-11-01T08:00:00.000Z' }],
    ]);
    const dated = datePages(all.map((x) => x.page), wordsOf, served, BUILD);
    expect(dated.map((p) => p.lastModified)).toEqual([
      '2026-11-01T08:00:00.000Z', // same words as production
      BUILD, // production serves other words: they change in this deploy
      '2026-11-10T00:00:00.000Z', // never served: the date the page gave
    ]);
    expect(dated[0]!.contentSha256).toBe(hashOf(home));
  });

  it('a redeploy of the same words keeps every date', () => {
    const first = datePages(all.map((x) => x.page), wordsOf, null, BUILD);
    const served = new Map(first.map((p) => [p.url, { contentSha256: p.contentSha256!, lastModified: p.lastModified }]));
    const later = all.map((x) => ({ ...x.page, lastModified: '2026-12-01T00:00:00.000Z' }));
    expect(datePages(later, wordsOf, served, '2026-12-01T00:00:00.000Z').map((p) => p.lastModified)).toEqual(
      first.map((p) => p.lastModified)
    );
  });

  it('hashes only what a person reads in <main>: chrome, scripts and spacing do not count', () => {
    const a = pageWords(home.page, html('<h1>Hello</h1>\n  <p>From £450</p><script>var t = Date.now()</script>'));
    const b = pageWords(home.page, html('<h1>Hello</h1> <p>From £450</p>').replace('2 min ago', '3 h ago'));
    expect(a).toBe(b);
    expect(pageWords(home.page, html('<h1>Hello</h1><p>From £500</p>'))).not.toBe(b);
  });
});

describe('the built page index and sitemap', () => {
  const index = JSON.parse(readDistFile('api/pages.json') ?? '{"pages":[]}') as {
    pages: { url: string; lastModified: string; contentSha256?: string }[];
  };
  const sitemap = readDistFile('sitemap-0.xml') ?? '';

  it('every page carries the hash of its words', () => {
    expect(index.pages.length).toBeGreaterThan(0);
    for (const p of index.pages) expect(p.contentSha256, p.url).toMatch(/^[0-9a-f]{64}$/);
  });

  it('the sitemap gives every indexed page the same date as /api/pages.json', () => {
    const lastmod = new Map(
      [...sitemap.matchAll(/<url><loc>([^<]+)<\/loc>(?:<lastmod>([^<]+)<\/lastmod>)?/g)].map((m) => [m[1], m[2]])
    );
    for (const p of index.pages) expect(lastmod.get(p.url), `${p.url} <lastmod>`).toBe(p.lastModified);
  });
});
