/**
 * Page dates: `lastModified` in /api/pages.json (and so the sitemap's
 * <lastmod>) is when the words a person reads on a page last changed on the
 * live site, not when the site was last built.
 *
 * Each page's words are hashed after the build: its title, its description and
 * the visible text of its <main> (`contentSha256`, published beside
 * `lastModified`). The deploy passes the address of the page index production
 * serves now (SERVED_PAGES_URL). Then, per page:
 *
 *   - production serves the same words  -> keep the date production publishes;
 *   - production serves other words     -> this build's time: they change now;
 *   - production has no hash for it     -> the date pages.json.ts gave (a case
 *     study or field note's own date, a legal page's "Last updated", else the
 *     build time). That covers a new page, a local build and an unreachable
 *     production, which therefore fall back to the pre-t19631 behaviour.
 *
 * Production is the record, so nothing has to be kept by hand: a deploy that
 * changes no words changes no date. The hook runs before the sitemap
 * integration's, which reads the dated file (astro.config.mjs).
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration, AstroIntegrationLogger } from 'astro';
import { parse } from 'node-html-parser';

export interface IndexedPage {
  url: string;
  title: string;
  description: string;
  lastModified: string;
  contentSha256?: string;
  [field: string]: unknown;
}

export interface ServedDate {
  contentSha256: string;
  lastModified: string;
}

/** The words a person reads on a built page: title, description, visible <main> text. */
export function pageWords(page: Pick<IndexedPage, 'title' | 'description'>, html: string): string {
  const main = parse(html).querySelector('main');
  if (!main) throw new Error(`page-dates: ${page.title} has no <main>`);
  for (const hidden of main.querySelectorAll('script, style, template')) hidden.remove();
  const alts = main.querySelectorAll('img[alt]').map((img) => img.getAttribute('alt') ?? '');
  const text = [main.textContent, ...alts].join(' ').replace(/\s+/g, ' ').trim();
  return [page.title, page.description, text].join('\n');
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Dates each page against the served record (see the module comment). Pure:
 * `wordsOf` reads a page's built HTML, `served` is production's index or null.
 */
export function datePages(
  pages: IndexedPage[],
  wordsOf: (page: IndexedPage) => string,
  served: Map<string, ServedDate> | null,
  buildTime: string
): IndexedPage[] {
  return pages.map((page) => {
    const contentSha256 = sha256(wordsOf(page));
    const record = served?.get(page.url);
    const lastModified = !record
      ? page.lastModified
      : record.contentSha256 === contentSha256
        ? record.lastModified
        : buildTime;
    // Keep the published field order: contentSha256 sits after lastModified.
    return { ...page, lastModified, contentSha256 };
  });
}

/** Production's page index as url -> {hash, date}; null when it cannot be read. */
export async function readServed(url: string, logger: AstroIntegrationLogger): Promise<Map<string, ServedDate> | null> {
  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { pages?: Partial<IndexedPage>[] };
    if (!Array.isArray(body.pages)) throw new Error('no pages[]');
    const served = new Map<string, ServedDate>();
    for (const p of body.pages) {
      if (typeof p.url === 'string' && typeof p.contentSha256 === 'string' && typeof p.lastModified === 'string') {
        served.set(p.url, { contentSha256: p.contentSha256, lastModified: p.lastModified });
      }
    }
    logger.info(`read ${served.size} served page dates from ${url}`);
    return served;
  } catch (error) {
    logger.warn(`could not read served page dates from ${url} (${String(error)}); pages keep their built dates`);
    return null;
  }
}

/** dist file holding a page's HTML, from its canonical URL. */
function htmlFile(dist: URL, site: string, url: string): URL {
  const path = url.slice(site.length).replace(/^\//, '');
  return new URL(path === '' || path.endsWith('/') ? `${path}index.html` : `${path}/index.html`, dist);
}

export function pageDates(): AstroIntegration {
  let site = '';
  return {
    name: 'page-dates',
    hooks: {
      'astro:config:done': ({ config }) => {
        site = (config.site ?? '').replace(/\/$/, '');
      },
      'astro:build:done': async ({ dir, logger }) => {
        const indexFile = new URL('api/pages.json', dir);
        const index = JSON.parse(readFileSync(indexFile, 'utf8')) as { generatedAt: string; pages: IndexedPage[] };
        const servedUrl = process.env.SERVED_PAGES_URL;
        const served = servedUrl ? await readServed(servedUrl, logger) : null;
        index.pages = datePages(
          index.pages,
          (page) => pageWords(page, readFileSync(fileURLToPath(htmlFile(dir, site, page.url)), 'utf8')),
          served,
          index.generatedAt
        );
        if (served) {
          const carried = index.pages.filter((p) => served.get(p.url)?.lastModified === p.lastModified).length;
          logger.info(`${carried} of ${index.pages.length} pages keep the date production publishes`);
        }
        writeFileSync(indexFile, JSON.stringify(index, null, 2) + '\n');
      },
    },
  };
}
