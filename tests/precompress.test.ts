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
import { readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { BROTLI_TYPES, legacyRedirect } from '../ops/edge/worker.js';
import { siteFromDist } from '../ops/edge/local.mjs';
import { DIST, allHtmlFiles } from './support/dist';

const CHROME = 'gzip, deflate, br, zstd';
// Headers that belong to the bytes sent, not to what they say.
const PER_ENCODING = new Set(['content-encoding', 'content-length', 'etag', 'last-modified']);

const built = readdirSync(DIST, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => join(entry.parentPath, entry.name).slice(DIST.length).split(/[\\/]/).join('/'));
const compressible = built.filter((file) => Object.hasOwn(BROTLI_TYPES, extname(file)));

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
      expect(contentHeaders(brotli), url).toEqual(contentHeaders(plain));
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
});
