#!/usr/bin/env node
// automancer.uk as production serves it, from a built dist/ on this machine.
//
// Production is two layers: GitHub Pages serves the built files, and the edge Worker
// (ops/edge/worker.js) answers every request in front of it, adding the security headers, the
// cache lifetimes, the Markdown twins for `Accept: text/markdown`, the legacy *.html 301s, the
// RFC 9457 API errors and the Markdown 404. This module runs that same worker.js, unchanged, over
// a stand-in for GitHub Pages that reads dist/ and answers as Pages does (checked against the
// Pages copy on 21 Nov 2026: a directory without its slash 301s to it with the query kept, a
// missing file is 404.html with no Cache-Control, every file carries max-age=600, Vary:
// Accept-Encoding, an ETag and Access-Control-Allow-Origin: *). Pages also serves single
// byte ranges, letting the local journey exercise the Worker's response to partial files.
//
// So whatever reads the local site (the visitor journey, `pnpm run compare`, the ops/perf probes)
// gets the response headers, redirects and twins a visitor gets, and a test that needs the Worker
// no longer has to wait for production to run.
//
//   node ops/edge/local.mjs [dist=dist] [--port=0] [--host=127.0.0.1] [--delay=0]
//
// prints `automancer.uk from <dist> at http://127.0.0.1:<port>/` once it listens. Port 0 (the
// default) takes a free port, so two agents never collide. --delay holds every HTML page back that
// many ms, the wait for a page that is not in a phone's cache.
//
// In code:
//   siteFromDist(dist)            (Request) => Promise<Response>, Requests made to https://automancer.uk
//   serveSite({ dist, port, ... }) the same on a local HTTP port; resolves to { url, server, close }
//   routeSite(context, dist)      Playwright: answers https://automancer.uk/** in a browser context
//                                 from dist/ (opens no port)
import { AsyncLocalStorage } from 'node:async_hooks';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import worker, { atOrigin, atPages } from './worker.js';

/** https://automancer.uk, as the Worker names itself in redirects. */
export const ORIGIN = atOrigin('/').origin;
/** The Pages project address the Worker reads every file from, without its trailing slash. */
const PAGES = atPages('/').href.replace(/\/$/, '');
const PAGES_PATH = new URL(PAGES).pathname;

// GitHub Pages' Content-Type for each file the build emits (read from the Pages copy).
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.xml': 'application/xml',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

/** A single byte range, as Pages serves it. Multiple or malformed ranges get the full file. */
function byteRange(request, headers, size) {
  const validator = request.headers.get('If-Range');
  if (validator !== null && validator !== headers.ETag && validator !== headers['Last-Modified']) return null;
  const range = /^bytes=(\d*)-(\d*)$/i.exec(request.headers.get('Range') ?? '');
  if (!range) return null;
  const [, first, last] = range;
  if (!first && !last) return null;
  if (first && last && Number(first) > Number(last)) return null;
  const start = first ? Number(first) : Math.max(0, size - Number(last));
  const end = first && last ? Math.min(Number(last) + 1, size) : size;
  return { start, end };
}

/** A stand-in for GitHub Pages serving `dist`: answers Requests to the Pages project address. */
export function pagesFromDist(dist) {
  const root = path.resolve(dist);
  return async (request) => {
    const url = new URL(request.url);
    const encoded = url.pathname.slice(PAGES_PATH.length) || '/';
    let rel;
    try {
      rel = decodeURIComponent(encoded);
    } catch {
      // A malformed escape has no file behind it. Serve the same missing-page body.
    }
    const always = { 'Access-Control-Allow-Origin': '*', Vary: 'Accept-Encoding' };
    let file = rel && path.join(root, rel);
    let found = file && (file === root || file.startsWith(root + path.sep)) ? await stat(file).catch(() => null) : null;
    if (found?.isDirectory()) {
      if (!rel.endsWith('/')) {
        return new Response(null, {
          status: 301,
          headers: { ...always, 'Cache-Control': 'max-age=600', 'Content-Type': 'text/html', Location: `${PAGES}${encoded}/${url.search}` },
        });
      }
      file = path.join(file, 'index.html');
      found = await stat(file).catch(() => null);
    }
    const head = request.method === 'HEAD';
    if (!found?.isFile()) {
      const body = head ? null : await readFile(path.join(root, '404.html'));
      return new Response(body, { status: 404, headers: { ...always, 'Content-Type': TYPES['.html'] } });
    }
    const etag = `"${Math.floor(found.mtimeMs / 1000).toString(16)}-${found.size.toString(16)}"`;
    const headers = {
      ...always,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'max-age=600',
      'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream',
      ETag: etag,
      'Last-Modified': found.mtime.toUTCString(),
    };
    if (request.headers.get('If-None-Match') === etag) return new Response(null, { status: 304, headers });
    if (head) return new Response(null, { status: 200, headers });
    const range = request.method === 'GET' && byteRange(request, headers, found.size);
    if (!range) return new Response(await readFile(file), { status: 200, headers });
    const { start, end } = range;
    if (start >= end) {
      headers['Content-Range'] = `bytes */${found.size}`;
      return new Response(null, { status: 416, headers });
    }
    headers['Content-Range'] = `bytes ${start}-${end - 1}/${found.size}`;
    return new Response((await readFile(file)).subarray(start, end), { status: 206, headers });
  };
}

// worker.js calls the global fetch, as it must on the Workers runtime. While it answers a local
// request, a fetch of the Pages project address goes to that request's dist/ instead (several
// dist/s may be served at once: `pnpm run compare` serves two). Every other fetch is untouched.
const servingFrom = new AsyncLocalStorage();
let fetchInstalled = false;
function installFetch() {
  if (fetchInstalled) return;
  fetchInstalled = true;
  const networkFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const pages = servingFrom.getStore();
    if (pages) {
      const request = new Request(input, init);
      if (request.url === PAGES || request.url.startsWith(`${PAGES}/`)) return pages(request);
    }
    return networkFetch(input, init);
  };
}

// The binding ops/edge/deploy.sh gives the deployed Worker: the hash of the source it runs (t25749),
// here of the worker.js this module imports, so a local copy names its source as production does.
const EDGE_ENV = {
  EDGE_SOURCE: `sha256:${createHash('sha256').update(readFileSync(new URL('./worker.js', import.meta.url))).digest('hex')}`,
};

/** The site as automancer.uk serves it, from `dist`: give it Requests to https://automancer.uk. */
export function siteFromDist(dist) {
  installFetch();
  const pages = pagesFromDist(dist);
  return (request) => servingFrom.run(pages, () => worker.fetch(request, EDGE_ENV));
}

/** A copy of `response`'s headers with Location moved from automancer.uk to `local`. */
function localHeaders(response, local) {
  const headers = Object.fromEntries(response.headers);
  if (headers.location?.startsWith(`${ORIGIN}/`)) headers.location = local + headers.location.slice(ORIGIN.length);
  return headers;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Serve `dist` through the Worker on a local port (0 takes a free one). `delay` holds each HTML page back. */
export async function serveSite({ dist = 'dist', port = 0, host = '127.0.0.1', delay = 0, onRequest } = {}) {
  const site = siteFromDist(dist);
  const server = createServer(async (req, res) => {
    try {
      onRequest?.(req);
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const headers = Object.entries(req.headers).filter(([name]) => !['host', 'connection'].includes(name));
      const response = await site(new Request(ORIGIN + req.url, {
        method: req.method,
        headers: headers.map(([name, value]) => [name, Array.isArray(value) ? value.join(', ') : value]),
        body: chunks.length ? Buffer.concat(chunks) : undefined,
      }));
      if (delay && (response.headers.get('Content-Type') ?? '').startsWith('text/html')) await sleep(delay);
      res.writeHead(response.status, localHeaders(response, `http://${req.headers.host}`));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(String(error?.stack ?? error));
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const url = `http://${host}:${server.address().port}`;
  return { url, server, close: () => new Promise((r) => server.close(r)) };
}

/** Answer https://automancer.uk/** in a Playwright browser context from `dist`, through the Worker. */
export async function routeSite(context, dist) {
  const site = siteFromDist(dist);
  await context.route(`${ORIGIN}/**`, async (route) => {
    const request = route.request();
    const response = await site(new Request(request.url(), {
      method: request.method(),
      headers: Object.entries(await request.allHeaders()).filter(([name]) => !name.startsWith(':')),
      body: request.postDataBuffer() ?? undefined,
    }));
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const flag = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
  const dist = path.resolve(args.find((a) => !a.startsWith('--')) ?? 'dist');
  const { url, close } = await serveSite({ dist, port: Number(flag('port', 0)), host: flag('host', '127.0.0.1'), delay: Number(flag('delay', 0)) });
  console.log(`automancer.uk from ${dist} at ${url}/`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => close().then(() => process.exit(0)));
}
