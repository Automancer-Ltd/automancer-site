/**
 * Per-page guarantees for every content page emitted into dist/.
 *
 * These catch the quiet regressions: a page added without the SEO
 * component, a heading level skipped, an image shipped without alt text,
 * a JSON-LD block that no longer parses. The 404 page is included (it uses
 * the full layout); meta-refresh redirect stubs are excluded — they are
 * bare by design (see tests/support/dist.ts).
 */
import { describe, expect, it } from 'vitest';
import { SITE_URL, pageCheckPages, type BuiltPage } from './support/dist';

const pages = pageCheckPages();

/** All headings in document order, as their numeric level (h2 -> 2). */
function headingLevels(page: BuiltPage): number[] {
  return page.doc
    .querySelectorAll('h1, h2, h3, h4, h5, h6')
    .map((h) => Number(h.tagName.slice(1)));
}

function metaContent(page: BuiltPage, selector: string): string {
  const el = page.doc.querySelector(selector);
  return el?.getAttribute('content')?.trim() ?? '';
}

describe('every emitted page', () => {
  it("includes the full-layout 404 page in SEO checks", () => {
    expect(pages.some((page) => page.is404), "404.html skipped page-level SEO checks").toBe(true);
  });

  it('exists — the suite has pages to audit', () => {
    expect(
      pages.length,
      `the build emitted only ${pages.length} content pages (need >5) — if this is 0, dist/ is empty or every page was filtered out, and the entire run audited nothing: its pass proves nothing`
    ).toBeGreaterThan(5);
  });

  it('has exactly one <h1>', () => {
    for (const page of pages) {
      const h1s = page.doc.querySelectorAll('h1');
      expect(h1s, `${page.route}: expected exactly one h1`).toHaveLength(1);
    }
  });

  it('has a non-empty <title> under 60 characters', () => {
    for (const page of pages) {
      const title = page.doc.querySelector('title')?.text.trim() ?? '';
      expect(title.length, `${page.route}: empty <title>`).toBeGreaterThan(0);
      expect(
        title.length,
        `${page.route}: <title> is ${title.length} chars ("${title}") — must stay under 60 or SERPs truncate it`
      ).toBeLessThan(60);
    }
  });

  it('has a meta description between 50 and 160 characters', () => {
    for (const page of pages) {
      const desc = metaContent(page, 'meta[name="description"]');
      expect(
        desc.length,
        `${page.route}: missing/empty meta description`
      ).toBeGreaterThanOrEqual(50);
      expect(
        desc.length,
        `${page.route}: meta description is ${desc.length} chars — Google truncates past ~160`
      ).toBeLessThanOrEqual(160);
    }
  });

  it('has an absolute canonical link matching its own URL, mirrored by og:url', () => {
    for (const page of pages) {
      const canonical = page.doc.querySelector('link[rel="canonical"]')?.getAttribute('href');
      expect(canonical, `${page.route}: missing rel=canonical`).toBeTruthy();
      const canonicalUrl = new URL(canonical!, SITE_URL);

      // Must be absolute and on our origin…
      expect(canonicalUrl.protocol).toBe('https:');
      expect(canonicalUrl.host).toBe(new URL(SITE_URL).host);

      // …and must name THIS page (catches copy-pasted canonicals).
      const own = new URL(page.route, SITE_URL);
      // Tolerate trailing-slash differences; anything else is a mismatch.
      const norm = (u: URL) => (u.pathname !== '/' ? u.pathname.replace(/\/$/, '') : '/');
      expect(norm(canonicalUrl), `${page.route}: canonical points at ${canonical}, not this page`).toBe(
        norm(own)
      );

      const ogUrl = metaContent(page, 'meta[property="og:url"]');
      expect(ogUrl, `${page.route}: og:url missing`).toBeTruthy();
      expect(ogUrl, `${page.route}: og:url disagrees with canonical`).toBe(canonical!.trim());
    }
  });

  it('has non-empty og:title / og:description / og:image / og:type tags', () => {
    for (const page of pages) {
      for (const prop of ['og:title', 'og:description', 'og:image', 'og:url']) {
        expect(
          metaContent(page, `meta[property="${prop}"]`),
          `${page.route}: meta property="${prop}" missing/empty`
        ).toBeTruthy();
      }
    }
  });

  it('has non-empty twitter card tags', () => {
    for (const page of pages) {
      for (const name of ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']) {
        expect(
          metaContent(page, `meta[name="${name}"]`),
          `${page.route}: meta name="${name}" missing/empty`
        ).toBeTruthy();
      }
    }
  });

  it('never skips heading levels (no h2 followed directly by h4)', () => {
    for (const page of pages) {
      const levels = headingLevels(page);
      for (let i = 1; i < levels.length; i++) {
        const [prev, next] = [levels[i - 1], levels[i]];
        expect(
          next - prev,
          `${page.route}: heading skip h${prev} → h${next} in document order`
        ).toBeLessThanOrEqual(1);
      }
    }
  });

  it('gives every <img> a real alt, or alt="" plus role="presentation"', () => {
    for (const page of pages) {
      for (const img of page.doc.querySelectorAll('img')) {
        const src = img.getAttribute('src') ?? '(no src)';
        const alt = img.getAttribute('alt') ?? '';

        if (alt.trim() === '') {
          // Missing alt and empty alt both land here: decorative images are
          // allowed only when explicitly marked as presentational.
          const role = img.getAttribute('role');
          expect(
            role === 'presentation' || role === 'none',
            `${page.route}: <img src="${src}"> needs a non-empty alt, or role="presentation" alongside its empty alt`
          ).toBe(true);
        }
      }
    }
  });

  it('emits valid schema.org JSON-LD with absolute URLs only', () => {
    for (const page of pages) {
      const blocks = page.doc.querySelectorAll('script[type="application/ld+json"]');
      expect(blocks.length, `${page.route}: no JSON-LD block found`).toBeGreaterThan(0);

      // Node registry across the whole page: every @id actually described by
      // a node, from every block. Property references may point across
      // blocks (field notes describe their article in a second document),
      // but must resolve somewhere ON THE PAGE — a dangling @id reference
      // hands consumers an entity with no facts attached.
      const describedIds = new Set<string>();
      const danglingRefs = new Set<string>();
      const bannedKeys = new Set<string>();

      for (const block of blocks) {
        let json: unknown;
        expect(() => {
          json = JSON.parse(block.text);
        }, `${page.route}: JSON-LD block does not parse`).not.toThrow();

        const obj = json as Record<string, unknown>;
        expect(String(obj['@context']), `${page.route}: JSON-LD @context missing`).toContain(
          'schema.org'
        );

        // The site emits one schema.org @graph per page (top-level keys are
        // @context and @graph). A graph document must be a non-empty array
        // whose every node is typed and carries an absolute https @id.
        // Documents without @graph keep the classic top-level shape.
        if ('@graph' in obj) {
          expect(Array.isArray(obj['@graph']), `${page.route}: @graph must be an array`).toBe(true);
          expect(
            obj['@graph'] as unknown[],
            `${page.route}: @graph present but empty`
          ).not.toHaveLength(0);
          for (const node of obj['@graph'] as Record<string, unknown>[]) {
            expect(
              node?.['@type'],
              `${page.route}: node in @graph without a @type`
            ).toBeTruthy();
            expect(
              typeof node?.['@id'] === 'string' && String(node['@id']).startsWith('https://'),
              `${page.route}: node @id missing or not an absolute https URL (${String(node?.['@id'])})`
            ).toBe(true);
            describedIds.add(String(node['@id']));
          }
        } else {
          expect(obj['@type'], `${page.route}: JSON-LD @type missing`).toBeTruthy();
        }

        // Every URL-shaped string inside must be absolute AND https.
        const visit = (node: unknown): void => {
          if (typeof node === 'string') {
            if (/^[a-z][a-z0-9+.-]*:\/\//i.test(node)) {
              expect(node.startsWith('https://'), `${page.route}: non-https URL "${node}" in JSON-LD`).toBe(true);
            }
            return;
          }
          if (Array.isArray(node)) node.forEach(visit);
          else if (node && typeof node === 'object') Object.values(node).forEach(visit);
        };
        visit(obj);

        // Property values that are bare {@id} objects reference other nodes
        // (publisher, isPartOf, author, founder…). A typed object carrying
        // @id describes itself; an untyped one points elsewhere and must
        // resolve against this page's registry above.
        const collectRefs = (node: unknown): void => {
          if (Array.isArray(node)) {
            node.forEach(collectRefs);
            return;
          }
          if (!node || typeof node !== 'object') return;
          const rec = node as Record<string, unknown>;
          if (!('@type' in rec) && typeof rec['@id'] === 'string') {
            danglingRefs.add(rec['@id'] as string);
            return;
          }
          Object.values(rec).forEach(collectRefs);
        };
        collectRefs(obj);

        // This business publishes no review data anywhere. Fabricated
        // aggregateRating/review markup is a legal liability, not a style
        // slip, so its presence is always a defect.
        const findBanned = (node: unknown): void => {
          if (Array.isArray(node)) {
            node.forEach(findBanned);
            return;
          }
          if (!node || typeof node !== 'object') return;
          for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
            if (key === 'aggregateRating' || key === 'review') bannedKeys.add(key);
            findBanned(value);
          }
        };
        findBanned(obj);
      }

      expect(
        bannedKeys,
        `${page.route}: JSON-LD must never contain aggregateRating/review (no review data exists)`
      ).toEqual(new Set());

      for (const ref of danglingRefs) {
        expect(
          describedIds.has(ref),
          `${page.route}: dangling @id reference "${ref}" — no node on this page describes it`
        ).toBe(true);
      }
    }
  });
});
