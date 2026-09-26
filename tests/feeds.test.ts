/**
 * The machine-readable outputs: sitemap, robots.txt, /llms.txt — and the
 * draft-exclusion guarantee that keeps unpublished work unpublished.
 *
 * The llms.txt assertions are the anti-drift test: prices, email and phone
 * stated there must be byte-identical to src/data/business.ts, the single
 * source of truth. If llms.txt drifts from business.ts (or someone edits
 * the generator to hardcode a value), this fails.
 */
import { describe, expect, it, vi } from 'vitest';
import { SITE_URL, allHtmlFiles, contentPages, readDistFile } from './support/dist';
import { contentEntries } from './support/content';
import { business, services } from '../src/data/business';
import { abs } from '../src/data/urls';

vi.mock('../src/data/site-content', () => ({
  getStudies: async () => [],
  getNotes: async () => [],
}));

import { rssFeed } from '../src/data/feeds';

// Same formatting as src/pages/llms.txt.ts — asserted equal in the
// generator-parity check below so the two can never silently diverge.
const formatPrice = (n: number) =>
  n.toLocaleString('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });

describe('sitemap', () => {
  const index = readDistFile('sitemap-index.xml');
  const sitemapXml = readDistFile('sitemap-0.xml') ?? '';

  it('is emitted and wired up through robots.txt', () => {
    expect(index, 'dist/sitemap-index.xml missing').toBeTruthy();
    expect(sitemapXml, 'dist/sitemap-0.xml missing').toBeTruthy();
    expect(index).toContain(`${SITE_URL}/sitemap-0.xml`);
  });

  it('contains exactly the emitted non-draft, non-404 pages — no more, no less', () => {
    const listed = [...sitemapXml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) =>
      new URL(m[1]).pathname
    );
    // Content pages only: no 404 utility page, no redirect stubs.
    const expected = contentPages().map((p) => p.route);

    const listedSet = new Set(listed);
    const expectedSet = new Set(expected);
    const symmetricDifference = [
      ...[...expectedSet]
        .filter((route) => !listedSet.has(route))
        .map((route) => `${route} — emitted as a page but MISSING from the sitemap`),
      ...[...listedSet]
        .filter((route) => !expectedSet.has(route))
        .map((route) => `${route} — in the sitemap but NOT emitted as a page`),
    ];
    expect(
      symmetricDifference,
      'sitemap and emitted pages disagree — every route that is in one and not the other, both directions:'
    ).toEqual([]);
    expect(
      listed.length,
      `sitemap has ${listed.length} <loc> entries for ${expected.length} distinct expected pages — a route is listed more than once (entries must be unique)`
    ).toBe(expected.length);
  });
});

describe('robots.txt', () => {
  it('is emitted and references the correct sitemap URL', () => {
    const robots = readDistFile('robots.txt');
    expect(robots, 'dist/robots.txt missing').toBeTruthy();
    expect(robots!.trim()).toContain(`Sitemap: ${SITE_URL}/sitemap-index.xml`);
  });
});

describe('/llms.txt — anti-drift vs src/data/business.ts', () => {
  const raw = readDistFile('llms.txt');

  it('is emitted and non-empty', () => {
    expect(raw, 'dist/llms.txt missing').toBeTruthy();
    expect(raw!.trim().length).toBeGreaterThan(0);
  });

  it('states the exact email, phone and web address from business.ts', () => {
    const lines = raw!.split('\n');
    expect(lines).toContain(`Email: ${business.email}`);
    expect(lines).toContain(`Web: ${business.url}`);
    expect(lines).toContain(`Contact form: ${abs('/contact')}`);
    const phoneLine = lines.find((l) => l.startsWith('Phone:'));
    expect(phoneLine, 'llms.txt has no Phone line').toBeTruthy();
    // Byte-identical phone number, including spacing.
    expect(phoneLine).toContain(`Phone: ${business.phone} `);
    const devDocsLine = lines.find((l) => l.includes('Developer docs:'));
    expect(devDocsLine, 'llms.txt has no Developer docs line').toBeTruthy();
    expect(devDocsLine).toContain(`Developer docs: ${abs('/developers')} — `);
  });

  it('states every service price byte-identically to business.ts', () => {
    for (const service of services) {
      const unit = service.priceUnit === 'month' ? '/month' : ' (project)';
      const expectedPrefix = `- ${service.name}: from ${formatPrice(service.priceFrom)}${unit} —`;
      expect(
        raw,
        `llms.txt is missing (or has drifted from) the published line:\n  ${expectedPrefix}`
      ).toContain(expectedPrefix);
    }
  });

  it('matches what the JSON-LD generator derives from business.ts', () => {
    // Guard the shared source of truth itself: if someone hardcodes values
    // into the generator, these derived facts still have to agree.
    expect(business.url).toBe(SITE_URL);
    for (const service of services) {
      expect(service.priceFrom, `${service.name} must have a numeric priceFrom`).toBeTypeOf('number');
      expect(formatPrice(service.priceFrom)).toMatch(/^£[\d,]+$/);
    }
  });
});

describe('draft exclusion', () => {
  const drafts = () => contentEntries().filter((e) => e.draft);
  const slugToRoute = ({ collection, slug }: { collection: string; slug: string }) =>
    collection === 'case-studies' ? `/work/${slug}/` : `/field-notes/${slug}/`;

  it('every non-draft entry is emitted as a page (nothing accidentally hidden)', () => {
    const routes = new Set(contentPages().map((p) => p.route));
    const hidden = contentEntries()
      .filter((e) => !e.draft)
      .filter((e) => !routes.has(slugToRoute(e)));
    expect(
      hidden.map(slugToRoute),
      'published content never built into dist/ — check getStaticPaths filters'
    ).toEqual([]);
  });

  it('no draft:true entry leaks a page, a link or a sitemap URL into dist/', () => {
    const sitemapPaths = [...(readDistFile('sitemap-0.xml') ?? '').matchAll(/<loc>(.*?)<\/loc>/g)].map(
      (m) => new URL(m[1]).pathname
    );

    for (const entry of drafts()) {
      const route = slugToRoute(entry);
      // 1. No emitted page at its route…
      expect(
        contentPages().some((p) => p.route === route),
        `${route} is marked draft:true but was emitted`
      ).toBe(false);

      // 2. …no sitemap entry…
      expect(sitemapPaths, `${route} is draft but listed in the sitemap`).not.toContain(route);

      // 3. …and no link to it from any emitted page.
      for (const page of allHtmlFiles()) {
        expect(
          page.html.includes(`href="/${route.replace(/^\//, '').replace(/\/$/, '')}"`) ||
            page.html.includes(`href="${route}"`),
          `${page.route} links to draft entry ${route}`
        ).toBe(false);
      }
    }
  });
});

function assertWellFormedXml(xml: string, label: string): void {
  const stripped = xml
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA[\s\S]*?\]\]>/g, '');
  const tagRe = /<(\/?)([A-Za-z][\w.:-]*)([^>]*?)(\/?)>/g;
  const stack: string[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(stripped)) !== null) {
    expect(
      stripped.slice(last, m.index).includes('<'),
      `${label}: stray "<" outside any tag — malformed markup`
    ).toBe(false);
    last = tagRe.lastIndex;
    const [, closing, name, , selfClosing] = m;
    if (selfClosing) continue;
    if (closing) {
      expect(
        stack.pop(),
        `${label}: closing </${name}> has no matching open tag`
      ).toBe(name);
    } else {
      stack.push(name);
    }
  }
  expect(
    stripped.slice(last).includes('<'),
    `${label}: stray "<" outside any tag — malformed markup`
  ).toBe(false);
  expect(stack, `${label}: unclosed element(s): ${stack.join(', ')}`).toEqual([]);
}

describe('RSS feed CDATA escaping', () => {
  it('escapes ]]> inside Markdown body so CDATA blocks are well-formed and not prematurely terminated', () => {
    const rawMarkdown = 'Example with nested arrays: `const arr = [[1]]>;` and markup: `<div class="test">nested</div>`.';
    const xml = rssFeed({
      collectionTitle: 'Case Studies',
      collectionPath: '/work/',
      items: [
        {
          slug: 'test-cdata',
          path: '/work/test-cdata',
          title: 'Test CDATA escaping',
          description: 'Testing CDATA edge case',
          date: new Date('2026-09-25T12:00:00Z'),
          body: rawMarkdown,
        },
      ],
    });

    expect(xml).toContain('const arr = [[1]]]]><![CDATA[>;` and markup: `<div class="test">nested</div>`.');
    assertWellFormedXml(xml, 'RSS feed with CDATA containing ]]>');
  });
});

describe('feed link canonical trailing slashes', () => {
  const feedPaths = [
    { xml: 'work/rss.xml', json: 'work/feed.json' },
    { xml: 'field-notes/rss.xml', json: 'field-notes/feed.json' },
  ];

  for (const { xml, json } of feedPaths) {
    it(`${xml} channel link, item links and guids carry canonical trailing slashes`, () => {
      const content = readDistFile(xml);
      expect(content, `dist/${xml} missing`).toBeTruthy();

      const channelLink = content!.match(/<channel>[\s\S]*?<link>(.*?)<\/link>/)?.[1];
      expect(channelLink, `missing channel link in ${xml}`).toBeTruthy();
      expect(
        new URL(channelLink!).pathname.endsWith('/'),
        `channel link "${channelLink}" in ${xml} lacks trailing slash`
      ).toBe(true);

      const itemLinks = [...content!.matchAll(/<item>[\s\S]*?<link>(.*?)<\/link>/g)].map((m) => m[1]);
      expect(itemLinks.length, `no item links in ${xml}`).toBeGreaterThan(0);
      for (const link of itemLinks) {
        expect(
          new URL(link).pathname.endsWith('/'),
          `item link "${link}" in ${xml} lacks trailing slash`
        ).toBe(true);
      }

      const itemGuids = [...content!.matchAll(/<guid>(.*?)<\/guid>/g)].map((m) => m[1]);
      expect(itemGuids.length, `no item guids in ${xml}`).toBeGreaterThan(0);
      for (const guid of itemGuids) {
        expect(
          new URL(guid).pathname.endsWith('/'),
          `item guid "${guid}" in ${xml} lacks trailing slash`
        ).toBe(true);
      }
    });

    it(`${json} item and author URLs carry canonical trailing slashes`, () => {
      const content = readDistFile(json);
      expect(content, `dist/${json} missing`).toBeTruthy();
      const parsed = JSON.parse(content!) as {
        authors?: { name: string; url?: string }[];
        items?: { id: string; url: string }[];
      };

      expect(parsed.authors?.length, `authors missing in ${json}`).toBeGreaterThan(0);
      for (const author of parsed.authors ?? []) {
        if (author.url) {
          expect(
            new URL(author.url).pathname.endsWith('/'),
            `author url "${author.url}" in ${json} lacks trailing slash`
          ).toBe(true);
        }
      }

      expect(parsed.items?.length, `items missing in ${json}`).toBeGreaterThan(0);
      for (const item of parsed.items ?? []) {
        expect(
          new URL(item.url).pathname.endsWith('/'),
          `item url "${item.url}" in ${json} lacks trailing slash`
        ).toBe(true);
        expect(
          new URL(item.id).pathname.endsWith('/'),
          `item id "${item.id}" in ${json} lacks trailing slash`
        ).toBe(true);
      }
    });
  }
});

