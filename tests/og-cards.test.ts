/**
 * Share cards (src/lib/og-card.ts, src/data/share-cards.ts): what a social
 * site, chat app or search result shows when someone shares a page.
 *
 * A broken share image fails silently: the page still works, and the link
 * previews as a grey box. So every page's og:image must be a file the build
 * emitted, the size its tags say; every field note and case study must name its
 * own card; and the card's alt text must carry the page's own headline, so the
 * words a machine reads about the picture are the words a person sees.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DIST, SITE_URL, distHasFile, pageCheckPages, type BuiltPage } from './support/dist';
import { textWidth, wrap } from '../src/lib/og-card';
import { formatGBP, services } from '../src/data/business';

const pages = pageCheckPages().filter((p) => !p.is404);
const meta = (page: BuiltPage, selector: string) => page.doc.querySelector(selector)?.getAttribute('content')?.trim() ?? '';
const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** PNG width and height from its IHDR chunk, or null when the bytes are not a PNG. */
function pngSize(bytes: Buffer): { width: number; height: number } | null {
  const signature = '89504e470d0a1a0a';
  if (bytes.subarray(0, 8).toString('hex') !== signature || bytes.subarray(12, 16).toString('ascii') !== 'IHDR') return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

const articles = pages.filter((p) => /^\/(field-notes|work)\/[^/]+\/$/.test(p.route));
const handAuthored = pages.filter((p) => !articles.includes(p));
const h1Of = (page: BuiltPage) => decode(page.doc.querySelector('h1')!.text.trim().replace(/\s+/g, ' '));
const graphOf = (page: BuiltPage) =>
  page.doc
    .querySelectorAll('script[type="application/ld+json"]')
    .map((s) => JSON.parse(s.text) as { '@graph'?: Array<Record<string, unknown>> })
    .flatMap((g) => g['@graph'] ?? []);

describe('share cards', () => {
  it('cover every field note and case study', () => {
    expect(articles.filter((p) => p.route.startsWith('/field-notes/')).length).toBeGreaterThan(5);
    expect(articles.filter((p) => p.route.startsWith('/work/')).length).toBeGreaterThan(2);
  });

  it("every page's og:image is a built PNG of the size its tags state", () => {
    for (const page of pages) {
      const url = meta(page, 'meta[property="og:image"]');
      expect(url.startsWith(`${SITE_URL}/`), `${page.route}: og:image ${url} is not on this site`).toBe(true);
      expect(meta(page, 'meta[name="twitter:image"]'), `${page.route}: twitter:image differs from og:image`).toBe(url);
      const rel = new URL(url).pathname.slice(1);
      expect(distHasFile(rel), `${page.route}: og:image ${url} was not built`).toBe(true);
      const size = pngSize(readFileSync(join(DIST, rel)));
      expect(size, `${page.route}: ${rel} is not a PNG`).not.toBeNull();
      expect(meta(page, 'meta[property="og:image:type"]')).toBe('image/png');
      expect(Number(meta(page, 'meta[property="og:image:width"]')), `${page.route}: og:image:width`).toBe(size!.width);
      expect(Number(meta(page, 'meta[property="og:image:height"]')), `${page.route}: og:image:height`).toBe(size!.height);
      expect(meta(page, 'meta[property="og:image:alt"]'), `${page.route}: og:image:alt missing`).toBeTruthy();
      expect(meta(page, 'meta[name="twitter:image:alt"]')).toBe(meta(page, 'meta[property="og:image:alt"]'));
    }
  });

  it('each field note and case study names its own 1200×630 card, described by its own headline', () => {
    for (const page of articles) {
      const [, collection, slug] = /^\/([^/]+)\/([^/]+)\/$/.exec(page.route)!;
      const own = `${SITE_URL}/og/${collection}/${slug}.png`;
      expect(meta(page, 'meta[property="og:image"]'), `${page.route}: shares the generic image, not its card`).toBe(own);
      expect(pngSize(readFileSync(join(DIST, `og/${collection}/${slug}.png`)))).toEqual({ width: 1200, height: 630 });
      const h1 = h1Of(page);
      const alt = decode(meta(page, 'meta[property="og:image:alt"]'));
      expect(alt.endsWith(`: ${h1}`), `${page.route}: card alt "${alt}" does not end with the page's headline "${h1}"`).toBe(true);
    }
  });

  it('every other page names its own card, headed by its own h1', () => {
    expect(handAuthored.map((p) => p.route)).toEqual(expect.arrayContaining(['/', '/services/', '/contact/', '/about/', '/privacy/']));
    const seen = new Map<string, string>();
    for (const page of handAuthored) {
      const url = meta(page, 'meta[property="og:image"]');
      expect(url, `${page.route}: shares an image that is not a page card`).toMatch(new RegExp(`^${SITE_URL}/og/pages/[a-z-]+\\.png$`));
      expect(seen.get(url), `${page.route} shares its card with ${seen.get(url)}`).toBeUndefined();
      seen.set(url, page.route);
      const alt = decode(meta(page, 'meta[property="og:image:alt"]'));
      expect(alt.includes(`: ${h1Of(page)}`), `${page.route}: card alt "${alt}" does not carry the page's headline "${h1Of(page)}"`).toBe(true);
    }
  });

  it('the home and /services/ cards show every published from-price, and nothing else does', () => {
    const priced = ['/', '/services/'];
    for (const page of handAuthored) {
      const alt = decode(meta(page, 'meta[property="og:image:alt"]'));
      for (const s of services) {
        const price = `${s.name} from ${formatGBP(s.priceFrom)}${s.priceUnit === 'month' ? '/mo' : ''}`;
        expect(alt.includes(price), `${page.route}: card alt and "${price}"`).toBe(priced.includes(page.route));
      }
    }
  });

  it("every page's WebPage primaryImageOfPage is its share card", () => {
    for (const page of pages) {
      const webPage = graphOf(page).find((n) => typeof n['@id'] === 'string' && (n['@id'] as string).endsWith('#webpage'));
      const image = webPage?.primaryImageOfPage as { url?: string; width?: number; height?: number; caption?: string } | undefined;
      expect(image?.url, `${page.route}: primaryImageOfPage`).toBe(meta(page, 'meta[property="og:image"]'));
      expect([image?.width, image?.height]).toEqual([1200, 630]);
      expect(image?.caption).toBe(decode(meta(page, 'meta[property="og:image:alt"]')));
    }
  });

  it("a field note's BlogPosting image is its card", () => {
    for (const page of articles.filter((p) => p.route.startsWith('/field-notes/'))) {
      const post = graphOf(page).find((n) => n['@type'] === 'BlogPosting');
      expect(post?.image, `${page.route}: BlogPosting image`).toBe(meta(page, 'meta[property="og:image"]'));
    }
  });
});

describe('share card layout', () => {
  it('wraps a title without breaking a word, and refuses a character the fonts lack', () => {
    const lines = wrap('Care without the clipboard.', 'syne-800', 84, 700);
    expect(lines.join(' ')).toBe('Care without the clipboard.');
    for (const l of lines) expect(textWidth(l, 'syne-800', 84)).toBeLessThanOrEqual(700);
    expect(() => textWidth('naïve', 'syne-800', 84)).toThrow(/has no "ï"/);
  });
});
