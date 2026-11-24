/**
 * The build's Brotli copies (t24283, src/integrations/precompress.ts).
 *
 * A browser that takes Brotli gets `<file>.br` from the edge Worker instead of the file, so a
 * copy that is stale, missing its lock removal or decoded differently is what a visitor reads.
 * Every built file of a compressed type is fetched through the Worker over a stand-in for GitHub
 * Pages, as Chrome asks (`gzip, deflate, br, zstd`) and as a client without Brotli asks, and
 * the two answers must carry the same words and the same headers.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { brotliDecompressSync, zstdDecompressSync } from 'node:zlib';
import { BROTLI_TYPES, DICTIONARY_DIR, USE_AS_DICTIONARY, dczDictionary, legacyRedirect } from '../ops/edge/worker.js';
import { namedDictionary } from '../src/integrations/compression-dictionary';
import { siteFromDist } from '../ops/edge/local.mjs';
import { DIST, allHtmlFiles } from './support/dist';

const CHROME = 'gzip, deflate, br, zstd';
// Headers that belong to the bytes sent, not to what they say.
const PER_ENCODING = new Set(['content-encoding', 'content-length', 'etag', 'last-modified']);

const built = readdirSync(DIST, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => join(entry.parentPath, entry.name).slice(DIST.length).split(/[\\/]/).join('/'));
const compressible = built.filter((file) => Object.hasOwn(BROTLI_TYPES, extname(file)));
const pageIndex = JSON.parse(readFileSync(join(DIST, 'api/pages.json'), 'utf8')) as {
  pages: Array<{ url: string; markdownUrl: string | null }>;
};

const site = siteFromDist(DIST);
const ask = (path: string, headers: Record<string, string> = {}, method = 'GET') =>
  site(new Request(`https://automancer.uk${path}`, { method, headers: { Accept: 'text/html,*/*;q=0.8', ...headers } }));
const contentHeaders = (res: Response) =>
  Object.fromEntries([...res.headers].filter(([name]) => !PER_ENCODING.has(name)));

describe('Brotli copies the edge Worker sends', () => {
  it('has one copy for every compressible file and none left over', () => {
    expect(compressible.length).toBeGreaterThan(80);
    const copies = new Set(built.filter((file) => file.endsWith('.br')));
    for (const file of compressible) expect(copies.has(`${file}.br`), file).toBe(true);
    for (const copy of copies) expect(compressible, `${copy} has no source file`).toContain(copy.slice(0, -3));
  });

  it('gives a Brotli browser the same words and headers as anyone else, on every page and file', async () => {
    // A directory's index.html is its page; any other file is asked for by its own path.
    const urls = compressible.map((file) => (file.endsWith('/index.html') ? file.slice(0, -'index.html'.length) : file));
    const unencoded: string[] = [];
    for (const url of urls) {
      const plain = await ask(url);
      const brotli = await ask(url, { 'Accept-Encoding': CHROME });
      expect(brotli.status, url).toBe(plain.status);
      // A Brotli copy also says no-transform, so Cloudflare's edge sends it as built.
      const sent = contentHeaders(brotli);
      if (brotli.headers.get('Content-Encoding') === 'br') {
        expect(sent['cache-control'], url).toBe(plain.headers.has('Cache-Control') ? `${plain.headers.get('Cache-Control')}, no-transform` : 'no-transform');
        sent['cache-control'] = plain.headers.get('Cache-Control')!;
        if (!plain.headers.has('Cache-Control')) delete sent['cache-control'];
      }
      expect(sent, url).toEqual(contentHeaders(plain));
      expect(plain.headers.get('Content-Encoding'), url).toBeNull();
      const bytes = Buffer.from(await brotli.arrayBuffer());
      const words = brotli.headers.get('Content-Encoding') === 'br' ? brotliDecompressSync(bytes) : bytes;
      if (brotli.headers.get('Content-Encoding') !== 'br') unencoded.push(url);
      expect(words.equals(Buffer.from(await plain.arrayBuffer())), `${url}: decoded body differs`).toBe(true);
    }
    // Everything but the legacy redirect stubs (the Worker answers those with a 301).
    expect(unencoded.sort()).toEqual(urls.filter((url) => legacyRedirect(url)).sort());
    expect(unencoded.length).toBe(5);
  });

  it('is smaller than the file on every page', async () => {
    for (const page of allHtmlFiles().filter((p) => !p.isRedirectStub)) {
      const path = page.is404 ? '/404.html' : page.route;
      const brotli = await ask(path, { 'Accept-Encoding': CHROME });
      const size = (await brotli.arrayBuffer()).byteLength;
      expect(size, path).toBeLessThan(page.html.length / 3);
    }
  });

  it('sends the file as built to a client without Brotli, to a range request and to a missing page', async () => {
    for (const encoding of ['gzip, deflate', 'br;q=0, gzip', 'identity', '']) {
      const res = await ask('/services/', encoding ? { 'Accept-Encoding': encoding } : {});
      expect(res.headers.get('Content-Encoding'), encoding).toBeNull();
    }
    const range = await ask('/services/', { 'Accept-Encoding': CHROME, Range: 'bytes=0-99' });
    expect(range.headers.get('Content-Encoding')).toBeNull();
    const missing = await ask('/nowhere/', { 'Accept-Encoding': CHROME });
    expect(missing.status).toBe(404);
    expect(missing.headers.get('Content-Encoding')).toBeNull();
    expect(await missing.text()).toContain('</html>');
  });

  it('answers a revalidation of a Brotli copy with a 304 that keeps its type and encoding', async () => {
    const first = await ask('/about/', { 'Accept-Encoding': CHROME });
    const etag = first.headers.get('ETag');
    expect(etag).toBeTruthy();
    const again = await ask('/about/', { 'Accept-Encoding': CHROME, 'If-None-Match': etag! });
    expect(again.status).toBe(304);
    expect(again.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(again.headers.get('Content-Encoding')).toBe('br');
    expect(again.headers.get('Strict-Transport-Security')).toBe('max-age=15552000');
    const head = await ask('/about/', { 'Accept-Encoding': CHROME }, 'HEAD');
    expect(head.status).toBe(200);
    expect(head.headers.get('Content-Encoding')).toBe('br');
  });

  it('serves the same Markdown bytes and validators at every page URL and its twin URL', async () => {
    for (const page of pageIndex.pages) {
      if (!page.markdownUrl) continue;
      const path = new URL(page.url).pathname;
      const twin = new URL(page.markdownUrl).pathname;
      for (const encoding of ['identity', CHROME]) {
        const headers = { Accept: 'text/markdown', 'Accept-Encoding': encoding };
        const direct = await ask(twin, headers);
        const negotiated = await ask(path, headers);
        expect(negotiated.status, path).toBe(200);
        expect(negotiated.headers.get('Content-Encoding'), path).toBe(encoding === CHROME ? 'br' : null);
        expect(negotiated.headers.get('Content-Type'), path).toBe('text/markdown; charset=utf-8');
        expect(negotiated.headers.get('Content-Location'), path).toBe(twin);
        expect(negotiated.headers.get('ETag'), path).toBe(direct.headers.get('ETag'));
        expect(Buffer.from(await negotiated.arrayBuffer()), path).toEqual(Buffer.from(await direct.arrayBuffer()));

        const etag = direct.headers.get('ETag')!;
        const unchanged = await ask(path, { ...headers, 'If-None-Match': etag });
        expect(unchanged.status, path).toBe(304);
        for (const name of ['ETag', 'Vary', 'Content-Location', 'Cache-Control', 'Content-Encoding']) {
          expect(unchanged.headers.get(name), `${path}: ${name}`).toBe(negotiated.headers.get(name));
        }
        expect(unchanged.body, path).toBeNull();

        const changed = await ask(path, { ...headers, 'If-None-Match': '"old-version"' }, 'HEAD');
        expect(changed.status, path).toBe(200);
        expect(changed.headers.get('ETag'), path).toBe(etag);
        expect(changed.body, path).toBeNull();
      }
    }
  });
});

// The shared compression dictionary (t26098): a page names it, Chromium keeps it, and then asks
// for each page as `dcz` with the dictionary's hash; the Worker sends `<page>.dcz` when it matches.
describe('pages compressed against the compression dictionary', () => {
  const dictionaryFiles = built.filter((file) => file.startsWith(`/${DICTIONARY_DIR}/`) && file.endsWith('.txt'));
  const pages = allHtmlFiles().filter((p) => !p.isRedirectStub);
  const dictionary = readFileSync(join(DIST, dictionaryFiles[0] ?? 'missing'));
  const hash = createHash('sha256').update(dictionary).digest();
  const holding = { 'Accept-Encoding': 'gzip, deflate, br, zstd, dcb, dcz', 'Available-Dictionary': `:${hash.toString('base64')}:` };

  it('has one dictionary per release, named on every page, and a copy against it for each', () => {
    expect(dictionaryFiles).toHaveLength(1);
    for (const page of pages) expect(namedDictionary(page.html), page.route).toBe(dictionaryFiles[0]);
    const copies = built.filter((file) => file.endsWith('.dcz'));
    expect(copies.sort()).toEqual(pages.map((p) => `${p.is404 ? '/404.html' : `${p.route}index.html`}`).map((f) => `${f}.dcz`).sort());
  });

  it('serves the dictionary for browsers to keep for a year, for pages only', async () => {
    const res = await ask(dictionaryFiles[0], { 'Accept-Encoding': CHROME });
    expect(res.status).toBe(200);
    expect(res.headers.get('Use-As-Dictionary')).toBe(USE_AS_DICTIONARY);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable, no-transform');
    expect(brotliDecompressSync(Buffer.from(await res.arrayBuffer())).equals(dictionary)).toBe(true);
    for (const path of ['/', '/about/', '/assets/js/main.js']) expect((await ask(path)).headers.get('Use-As-Dictionary'), path).toBeNull();
  });

  it('gives a browser holding it the same words and headers on every page, a third of the Brotli size', async () => {
    let brotliBytes = 0;
    let dczBytes = 0;
    for (const page of pages.filter((p) => !p.is404)) {
      const plain = await ask(page.route);
      const brotli = await ask(page.route, { 'Accept-Encoding': CHROME });
      const dcz = await ask(page.route, holding);
      expect(dcz.headers.get('Content-Encoding'), page.route).toBe('dcz');
      const bytes = Buffer.from(await dcz.arrayBuffer());
      expect(dczDictionary(bytes), page.route).toBe(hash.toString('hex'));
      const words = zstdDecompressSync(bytes.subarray(40), { dictionary });
      expect(words.equals(Buffer.from(await plain.arrayBuffer())), `${page.route}: decoded body differs`).toBe(true);
      const sent = contentHeaders(dcz);
      expect(sent.vary, page.route).toBe(`${brotli.headers.get('Vary')}, Available-Dictionary`);
      sent.vary = brotli.headers.get('Vary')!;
      expect(sent, page.route).toEqual(contentHeaders(brotli));
      const brotliSize = (await brotli.arrayBuffer()).byteLength;
      brotliBytes += brotliSize;
      dczBytes += bytes.length;
      expect(bytes.length, page.route).toBeLessThan(brotliSize);
    }
    expect(dczBytes).toBeLessThan(brotliBytes * 0.4);
  });

  it('sends Brotli to a browser holding another dictionary, and to a twin, a range or a HEAD', async () => {
    const other = { ...holding, 'Available-Dictionary': `:${createHash('sha256').update('an older frame').digest('base64')}:` };
    expect((await ask('/about/', other)).headers.get('Content-Encoding')).toBe('br');
    expect((await ask('/about/', { ...holding, 'Accept-Encoding': CHROME })).headers.get('Content-Encoding')).toBe('br');
    expect((await ask('/about/', { ...holding, Accept: 'text/markdown' })).headers.get('Content-Encoding')).toBe('br');
    expect((await ask('/about/', { ...holding, Range: 'bytes=0-99' })).headers.get('Content-Encoding')).toBeNull();
    expect((await ask('/about/', holding, 'HEAD')).headers.get('Content-Encoding')).toBe('br');
  });
});
