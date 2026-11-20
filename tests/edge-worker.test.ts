import { afterEach, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import worker, { atOrigin, cachePolicy, legacyRedirect } from '../ops/edge/worker.js';
import { DIST, allHtmlFiles } from './support/dist';

// A stand-in for GitHub Pages: two pages, one twin, everything else 404.
const origin: Record<string, [number, string, string]> = {
  '/': [200, 'text/html; charset=utf-8', '<html>home</html>'],
  '/index.md': [200, 'text/markdown; charset=utf-8', '# Home'],
  '/privacy/': [200, 'text/html; charset=utf-8', '<html>privacy</html>'],
  '/api/services.json': [200, 'application/json; charset=utf-8', '{}'],
  '/assets/images/logo.svg': [200, 'image/svg+xml', '<svg></svg>'],
  '/field-notes/rss.xml': [200, 'application/xml', '<rss></rss>'],
};

function serve(input: RequestInfo | URL) {
  const path = new URL(input instanceof Request ? input.url : String(input)).pathname;
  const [status, type, body] = origin[path] ?? [404, 'text/html; charset=utf-8', '<html>404</html>'];
  // GitHub Pages sends Vary: Accept-Encoding; the Worker must add Accept to it.
  return Promise.resolve(new Response(body, { status, headers: { 'Content-Type': type, Vary: 'Accept-Encoding' } }));
}

const get = (path: string, accept?: string, method = 'GET') =>
  worker.fetch(new Request(`https://automancer.uk${path}`, { method, headers: accept ? { Accept: accept } : {} })) as Promise<Response>;

const varies = (res: Response) => (res.headers.get('Vary') ?? '').split(',').map((t) => t.trim()).includes('Accept');

afterEach(() => vi.unstubAllGlobals());

describe('edge Worker in front of GitHub Pages', () => {
  it('serves a browser the HTML page, never the Markdown twin', async () => {
    vi.stubGlobal('fetch', vi.fn(serve));
    const browser = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
    for (const accept of [browser, '*/*', undefined]) {
      const res = await get('/', accept);
      expect(res.headers.get('Content-Type'), `Accept: ${accept}`).toContain('text/html');
      expect(await res.text()).toBe('<html>home</html>');
      expect(varies(res), `Vary: ${res.headers.get('Vary')}`).toBe(true);
      expect(res.headers.get('Link')).toContain('</index.md>; rel="alternate"; type="text/markdown"');
    }
  });

  it('serves an agent that asks for Markdown the twin, and falls back to HTML where none exists', async () => {
    vi.stubGlobal('fetch', vi.fn(serve));
    const md = await get('/', 'text/markdown');
    expect(md.status).toBe(200);
    expect(md.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8');
    expect(varies(md), `Vary: ${md.headers.get('Vary')}`).toBe(true);
    expect(await md.text()).toBe('# Home');
    const legal = await get('/privacy/', 'text/markdown');
    expect(await legal.text()).toBe('<html>privacy</html>');
  });

  it('answers a missing page with a 404, in Markdown when asked', async () => {
    vi.stubGlobal('fetch', vi.fn(serve));
    const md = await get('/nope', 'text/markdown');
    expect(md.status).toBe(404);
    expect(md.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8');
    expect(await md.text()).toContain('/llms.txt');
    const html = await get('/nope', 'text/html');
    expect(html.status).toBe(404);
    expect(await html.text()).toBe('<html>404</html>');
  });

  it('answers API errors as problem+json and leaves API successes alone', async () => {
    vi.stubGlobal('fetch', vi.fn(serve));
    const missing = await get('/api/nope.json');
    expect(missing.status).toBe(404);
    expect(missing.headers.get('Content-Type')).toBe('application/problem+json');
    expect((await missing.json()).status).toBe(404);
    const post = await get('/api/services.json', undefined, 'POST');
    expect(post.status).toBe(405);
    expect(post.headers.get('Allow')).toBe('GET, HEAD');
    const ok = await get('/api/services.json');
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe('{}');
  });

  it('redirects plain HTTP to HTTPS without touching the origin', async () => {
    const fetchSpy = vi.fn(serve);
    vi.stubGlobal('fetch', fetchSpy);
    const res = (await worker.fetch(new Request('http://automancer.uk/about/'))) as Response;
    expect(res.status).toBe(301);
    expect(res.headers.get('Location')).toBe('https://automancer.uk/about/');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends each legacy .html URL straight to its page with one 301, matching the built stub', async () => {
    const fetchSpy = vi.fn(serve);
    vi.stubGlobal('fetch', fetchSpy);
    const stubs = allHtmlFiles().filter((p) => p.isRedirectStub);
    expect(stubs.length, 'astro.config.mjs redirects build stubs').toBeGreaterThan(0);
    for (const stub of stubs) {
      const target = /url=([^"]+)"/.exec(stub.html)?.[1];
      expect(target, `${stub.file} has a meta refresh`).toBeTruthy();
      const legacy = `/${stub.file.replace(/\/index\.html$/, '')}`;
      expect(legacyRedirect(legacy), `${legacy} is in LEGACY_REDIRECTS`).toBe(target);
      for (const path of [legacy, `${legacy}/`, `${legacy}/index.html`, `/${legacy}`, `/${legacy}/`, `/${legacy}/index.html`, `${legacy}?ref=old`]) {
        const res = await get(path);
        expect(res.status, path).toBe(301);
        expect(res.headers.get('Location'), path).toBe(`https://automancer.uk${target}${path.includes('?') ? '?ref=old' : ''}`);
      }
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(legacyRedirect('/contact.html')).toBeNull();
    expect(legacyRedirect('/services/')).toBeNull();
  });

  // The Worker runs on the standard URL parser (t21891), as Node does. There `new URL('//services/',
  // origin)` names the host "services", so a visitor's doubled slash would leave the site (Cloudflare
  // answered 403). GitHub Pages serves such paths itself; the Worker must pass them on unchanged.
  it('keeps every request on the origin, whatever slashes or escapes its path holds', async () => {
    const fetchSpy = vi.fn(serve);
    vi.stubGlobal('fetch', fetchSpy);
    for (const path of ['//services/', '/services//', '/api//index.json', '/fie%6cd-notes/', '/services/?q=a%20b']) {
      await get(path);
      const sent = fetchSpy.mock.calls.at(-1)?.[0];
      const url = new URL(sent instanceof Request ? sent.url : String(sent));
      expect(`${url.origin}${url.pathname}${url.search}`, path).toBe(`https://automancer.uk${path}`);
    }
    const twin = await get('//', 'text/markdown');
    expect(twin.headers.get('Content-Location')).toBe('/index.md');
    const twinAsked = fetchSpy.mock.calls.at(-1)?.[0];
    expect(twinAsked instanceof Request ? twinAsked.url : String(twinAsked as URL)).toBe('https://automancer.uk/index.md');
    expect(atOrigin('//evil.example/x', '?a=b').toString()).toBe('https://automancer.uk//evil.example/x?a=b');
  });

  it("keeps a legacy URL's query exactly as the visitor sent it", async () => {
    vi.stubGlobal('fetch', vi.fn(serve));
    const res = await get('/services.html?utm_campaign=spring%20offer&q=a%3Fb&r=c+d');
    expect(res.headers.get('Location')).toBe('https://automancer.uk/services/?utm_campaign=spring%20offer&q=a%3Fb&r=c+d');
  });

  // An upload with no date runs on Cloudflare's 2021 runtime and its legacy URL parser; an upload
  // that rewrites the module deploys code no test ran.
  it('deploys this module unchanged, on a dated Workers runtime', () => {
    const deploy = readFileSync(new URL('../ops/edge/deploy.sh', import.meta.url), 'utf8');
    const date = /^readonly COMPATIBILITY_DATE=(\d{4}-\d{2}-\d{2})$/m.exec(deploy)?.[1];
    expect(date, 'deploy.sh sets COMPATIBILITY_DATE').toBeTruthy();
    expect(Date.parse(`${date}T00:00:00Z`)).toBeLessThanOrEqual(Date.now());
    expect(deploy).toContain('"main_module": "worker.js"');
    expect(deploy).not.toMatch(/\bsed\b/);
  });

  it('sends the same security headers on pages, twins, errors and redirects', async () => {
    vi.stubGlobal('fetch', vi.fn(serve));
    const expected = {
      'Strict-Transport-Security': 'max-age=15552000',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Content-Security-Policy': "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    };
    const responses: [string, Response][] = [
      ['HTML page', await get('/')],
      ['Markdown twin', await get('/', 'text/markdown')],
      ['HTML 404', await get('/nope', 'text/html')],
      ['Markdown 404', await get('/nope', 'text/markdown')],
      ['API 404', await get('/api/nope.json')],
      ['API 405', await get('/api/services.json', undefined, 'POST')],
      ['API success', await get('/api/services.json')],
      ['legacy 301', await get('/about.html')],
      ['HTTPS 301', (await worker.fetch(new Request('http://automancer.uk/about/'))) as Response],
    ];
    for (const [label, res] of responses) {
      for (const [name, value] of Object.entries(expected)) expect(res.headers.get(name), `${label}: ${name}`).toBe(value);
    }

    // SVG and XML are active documents in browsers and carry no <meta> policy,
    // so the Worker gives them a full default-src 'none' + Trusted Types CSP.
    for (const path of ['/assets/images/logo.svg', '/field-notes/rss.xml']) {
      const res = await get(path);
      const csp = res.headers.get('Content-Security-Policy') ?? '';
      expect(csp, path).toContain("default-src 'none'");
      expect(csp, path).toContain("frame-ancestors 'none'");
      expect(csp, path).toContain("form-action 'none'");
      expect(csp, path).toContain("require-trusted-types-for 'script'");
      expect(res.headers.get('X-Content-Type-Options'), path).toBe('nosniff');
    }
  });

  // A file kept for a year without asking must change URL when its bytes change; otherwise a
  // returning visitor keeps an old stylesheet or script after a release.
  it('keeps only content-addressed files for a year; pages keep the origin lifetime', async () => {
    const fetchSpy = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
      const path = new URL(input instanceof Request ? input.url : String(input)).pathname;
      const found = /^\/(_astro|assets)\/[^/]+/.test(path) && !path.includes('missing');
      return Promise.resolve(
        new Response(found ? 'x' : '<html>404</html>', { status: found ? 200 : 404, headers: { 'Cache-Control': 'max-age=600', Expires: 'Thu, 01 Jan 2026 00:00:00 GMT' } })
      );
    });
    vi.stubGlobal('fetch', fetchSpy);
    const year = 'public, max-age=31536000, immutable';
    expect((await get('/_astro/BaseLayout.Bpsqvkb3.css')).headers.get('Cache-Control')).toBe(year);
    const main = await get('/assets/js/main.js?v=e090f3949bfe28a5dfc14fc6eb9823288129792f');
    expect(main.headers.get('Cache-Control')).toBe(year);
    expect(main.headers.get('Expires')).toBeNull();
    expect(fetchSpy.mock.calls.at(-1)?.[1]).toMatchObject({ cf: { cacheTtlByStatus: { '200-299': 31536000, '300-599': -1 } } });
    // Unversioned: fonts and images for a day; main.js and pages keep the origin's ten minutes.
    expect((await get('/assets/fonts/syne-800-latin.woff2')).headers.get('Cache-Control')).toMatch(/^public, max-age=86400, stale-while-revalidate=/);
    expect((await get('/assets/js/main.js')).headers.get('Cache-Control')).toBe('max-age=600');
    expect((await get('/assets/js/main.js?v=latest')).headers.get('Cache-Control')).toBe('max-age=600');
    expect((await get('/about/')).headers.get('Cache-Control')).toBe('max-age=600');
    expect(fetchSpy.mock.calls.at(-1)?.[1]).not.toHaveProperty('cf');
    // A missing file is never kept: the next request asks the origin again.
    expect((await get('/_astro/missing.abcdefgh.js')).headers.get('Cache-Control')).toBe('max-age=600');
    for (const name of readdirSync(join(DIST, '_astro'))) {
      expect(name, `dist/_astro/${name} has no content hash`).toMatch(/\.[\w-]{8}\.\w+$/);
    }
  });

  it('gives every file a built page loads from this site a lifetime that matches its URL', () => {
    for (const page of allHtmlFiles()) {
      for (const el of page.doc.querySelectorAll('script[src], link[rel="stylesheet"], link[rel="preload"]')) {
        const ref = new URL(el.getAttribute('src') ?? el.getAttribute('href') ?? '', 'https://automancer.uk/');
        if (ref.host !== 'automancer.uk') continue;
        const policy = cachePolicy(ref.pathname, ref.search);
        expect(policy, `${page.route}: ${ref.pathname}${ref.search}`).not.toBeNull();
        if (policy?.edge === 31536000) expect(`${ref.pathname}${ref.search}`).toMatch(/^\/_astro\/|\?v=[0-9a-f]{7,40}$/);
      }
    }
  });
});
