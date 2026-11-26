import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { brotliCompressSync, brotliDecompressSync, zstdCompressSync, zstdDecompressSync } from 'node:zlib';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import worker, { DCZ_MAGIC, EDGE_SOURCE_HEADER, ERROR_TUNNEL, OFFSITE_LOCK, PAGE_CACHE_HEADER, PAGE_CACHE_SECONDS, SENTRY_INGEST, SENTRY_PROJECT, acceptsBrotli, acceptsCoding, atOrigin, availableDictionary, atPages, brotliFile, cachePolicy, dczDictionary, fromPages, legacyRedirect, namesTag, pageCacheKey, unlocked } from '../ops/edge/worker.js';
import { DIST, allHtmlFiles, contentPages } from './support/dist';

// The Pages project the Worker reads (t22925): the site has no custom domain on GitHub.
const PAGES = 'https://automancer-ltd.github.io/automancer-site';

// A stand-in for GitHub Pages: two pages, one twin, everything else 404.
const origin: Record<string, [number, string, string]> = {
  '/': [200, 'text/html; charset=utf-8', '<html>home</html>'],
  '/index.md': [200, 'text/markdown; charset=utf-8', '# Home'],
  '/privacy/': [200, 'text/html; charset=utf-8', '<html>privacy</html>'],
  '/locked/': [200, 'text/html; charset=utf-8', `<html><head><script>guard</script>${OFFSITE_LOCK}</head><body>page</body></html>`],
  '/api/services.json': [200, 'application/json; charset=utf-8', '{}'],
  '/assets/images/logo.svg': [200, 'image/svg+xml', '<svg></svg>'],
  '/field-notes/rss.xml': [200, 'application/xml', '<rss></rss>'],
};

function serve(input: RequestInfo | URL) {
  const url = new URL(input instanceof Request ? input.url : String(input));
  // Anything not asked of the Pages project is a request that left it.
  if (url.host !== 'automancer-ltd.github.io' || !url.pathname.startsWith('/automancer-site/')) {
    return Promise.resolve(new Response('wrong origin', { status: 421 }));
  }
  const path = url.pathname.slice('/automancer-site'.length);
  // Pages adds the slash to a directory itself, naming its own address.
  if (path === '/privacy') return Promise.resolve(new Response('', { status: 301, headers: { Location: `${PAGES}/privacy/${url.search}` } }));
  const [status, type, body] = origin[path] ?? [404, 'text/html; charset=utf-8', `<html><head>${OFFSITE_LOCK}</head>404</html>`];
  // GitHub Pages sends Vary: Accept-Encoding; the Worker must add Accept to it.
  // It also sends the reporting headers a host may add, which must never reach a visitor.
  const reporting = {
    NEL: '{"report_to":"host-nel","max_age":604800}',
    'Report-To': '{"group":"host-nel","max_age":604800,"endpoints":[{"url":"https://reports.example/nel"}]}',
    'Reporting-Endpoints': 'default="https://reports.example/r"',
  };
  return Promise.resolve(new Response(body, { status, headers: { 'Content-Type': type, Vary: 'Accept-Encoding', ...reporting } }));
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
    expect(await html.text()).toBe('<html><head></head>404</html>');
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
      expect(`${url.origin}${url.pathname}${url.search}`, path).toBe(`${PAGES}${path}`);
    }
    const twin = await get('//', 'text/markdown');
    expect(twin.headers.get('Content-Location')).toBe('/index.md');
    const twinAsked = fetchSpy.mock.calls.at(-1)?.[0];
    expect(twinAsked instanceof Request ? twinAsked.url : String(twinAsked as URL)).toBe(`${PAGES}/index.md`);
    expect(atOrigin('//evil.example/x', '?a=b').toString()).toBe('https://automancer.uk//evil.example/x?a=b');
    expect(atPages('//evil.example/x', '?a=b').toString()).toBe(`${PAGES}//evil.example/x?a=b`);
  });

  // Pages serves the same file to everyone. Until t23955 the Worker copied the visitor's request,
  // so GitHub got their IP, cookies, Referer and browser details with every page view.
  it("asks GitHub Pages for the file only, with none of the visitor's details (t23955)", async () => {
    const fetchSpy = vi.fn(serve);
    vi.stubGlobal('fetch', fetchSpy);
    const visitor = {
      'CF-Connecting-IP': '203.0.113.7',
      'X-Forwarded-For': '203.0.113.7',
      'X-Real-IP': '203.0.113.7',
      'True-Client-IP': '203.0.113.7',
      'CF-IPCountry': 'GB',
      Cookie: 'session=visitor-secret',
      Authorization: 'Bearer visitor-secret',
      Referer: 'https://automancer.uk/contact/?service=audit',
      'User-Agent': 'Mozilla/5.0 (visitor)',
      'Accept-Language': 'en-GB',
      'Sec-CH-UA-Platform': '"Android"',
      'If-None-Match': '"abc"',
      'If-Modified-Since': 'Sat, 21 Nov 2026 23:49:16 GMT',
      Range: 'bytes=0-99',
      'If-Range': '"abc"',
    };
    for (const [path, accept] of [['/services/', 'text/html'], ['/', 'text/markdown'], ['/nope', 'text/html'], ['/api/services.json', 'application/json']]) {
      fetchSpy.mockClear();
      await worker.fetch(new Request(`https://automancer.uk${path}`, { headers: { ...visitor, Accept: accept } }));
      expect(fetchSpy, path).toHaveBeenCalled();
      for (const [input, init] of fetchSpy.mock.calls as [RequestInfo | URL, RequestInit?][]) {
        const sent = new Request(input, init);
        const names = [...sent.headers.keys()];
        expect(names, `${path} → ${sent.url}`).not.toContain('cookie');
        for (const name of names) expect(['if-none-match', 'if-modified-since', 'range', 'if-range'], `${path} sent ${name}`).toContain(name);
        expect(JSON.stringify([...sent.headers]), path).not.toMatch(/203\.0\.113\.7|visitor-secret|service=audit|en-GB|Android/);
      }
    }
    // A file served byte-for-byte can still revalidate or resume a download.
    const file = fetchSpy.mock.calls[0][0] as Request;
    expect(file.headers.get('If-None-Match')).toBe('"abc"');
    expect(file.headers.get('If-Modified-Since')).toBe('Sat, 21 Nov 2026 23:49:16 GMT');
    expect(file.headers.get('Range')).toBe('bytes=0-99');
    expect(file.method).toBe('GET');
    fetchSpy.mockClear();
    await get('/services/', 'text/html', 'HEAD');
    expect((fetchSpy.mock.calls[0][0] as Request).method).toBe('HEAD');
  });

  it("asks for a page's Brotli copy with none of the visitor's details either (t24283)", async () => {
    const fetchSpy = vi.fn(serve);
    vi.stubGlobal('fetch', fetchSpy);
    await worker.fetch(new Request('https://automancer.uk/services/', {
      headers: { Accept: 'text/html', 'Accept-Encoding': 'gzip, br', Cookie: 'session=visitor-secret', 'CF-Connecting-IP': '203.0.113.7', 'If-None-Match': '"abc"' },
    }));
    const sent = (fetchSpy.mock.calls as [RequestInfo | URL, RequestInit?][]).map(([input, init]) => new Request(input, init));
    expect(sent.map((r) => r.url)).toContain(`${PAGES}/services/index.html.br`);
    for (const request of sent) {
      for (const name of request.headers.keys()) expect(['if-none-match'], `${request.url} sent ${name}`).toContain(name);
    }
  });

  it("decides Brotli on what the client sent, not on Cloudflare's rewritten Accept-Encoding (t24283)", async () => {
    const fetchSpy = vi.fn(serve);
    vi.stubGlobal('fetch', fetchSpy);
    const asked = async (headers: Record<string, string>, cf?: Record<string, string>) => {
      fetchSpy.mockClear();
      const request = new Request('https://automancer.uk/services/', { headers: { Accept: 'text/html', ...headers } });
      if (cf) Object.defineProperty(request, 'cf', { value: cf });
      await worker.fetch(request);
      return (fetchSpy.mock.calls as [RequestInfo | URL, RequestInit?][]).some(([input, init]) => new Request(input, init).url.endsWith('.br'));
    };
    // Cloudflare showed a gzip-only client to the Worker as taking br too.
    expect(await asked({ 'Accept-Encoding': 'gzip, br' }, { clientAcceptEncoding: 'gzip' })).toBe(false);
    expect(await asked({ 'Accept-Encoding': 'gzip, br' }, { clientAcceptEncoding: 'gzip, deflate, br, zstd' })).toBe(true);
    // Outside Cloudflare (ops/edge/local.mjs) there is no cf: the header is what the client sent.
    expect(await asked({ 'Accept-Encoding': 'gzip, br' })).toBe(true);
    expect(await asked({ 'Accept-Encoding': 'gzip' })).toBe(false);
  });

  it('knows which URLs have a Brotli copy and which browsers take one (t24283)', () => {
    expect(brotliFile('/')).toEqual({ path: '/index.html.br', type: 'text/html; charset=utf-8' });
    expect(brotliFile('/field-notes/')?.path).toBe('/field-notes/index.html.br');
    expect(brotliFile('/api/services.json')?.type).toBe('application/json; charset=utf-8');
    expect(brotliFile('/.well-known/agent.json')?.path).toBe('/.well-known/agent.json.br');
    expect(brotliFile('/field-notes/rss.xml')?.type).toBe('application/xml');
    for (const none of ['/services', '/.well-known/api-catalog', '/og/home.png', '/_astro/syne.abc.woff2', '//services/', '/a.html/b', '/x.toString']) {
      expect(brotliFile(none), none).toBeNull();
    }
    for (const yes of ['gzip, deflate, br, zstd', 'br', 'gzip, BR;q=0.5']) expect(acceptsBrotli(yes), yes).toBe(true);
    for (const no of [null, '', 'gzip, deflate', 'br;q=0', 'gzip, zstd', 'brotli']) expect(acceptsBrotli(no), String(no)).toBe(false);
  });

  // GitHub can renew its *.github.io certificate; it could not renew automancer.uk's behind
  // Cloudflare's proxy (t15154). So the files come from the Pages project, and a visitor never sees
  // its address.
  it("moves GitHub's own redirects back onto automancer.uk", async () => {
    vi.stubGlobal('fetch', vi.fn(serve));
    const res = await get('/privacy?ref=a%20b');
    expect(res.status).toBe(301);
    expect(res.headers.get('Location')).toBe('https://automancer.uk/privacy/?ref=a%20b');
    expect(res.headers.get('Strict-Transport-Security')).toBe('max-age=15552000');
    expect(fromPages(`${PAGES}`)).toBe('https://automancer.uk/');
    expect(fromPages('/automancer-site/work/')).toBe('https://automancer.uk/work/');
    expect(fromPages('https://automancer-ltd.github.io/automancer-site-other/')).toBeNull();
    expect(fromPages('https://automancer-ltd.github.io/')).toBeNull();
    expect(fromPages('https://evil.example/automancer-site/')).toBeNull();
  });

  // Putting automancer.uk back as the Pages custom domain makes GitHub send every file to
  // automancer.uk, which is this Worker again: answer an error, never a redirect loop.
  it('refuses a redirect that leaves the Pages project', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('', { status: 301, headers: { Location: 'https://automancer.uk/services/' } }))));
    const page = await get('/services/', 'text/html');
    expect(page.status).toBe(502);
    expect(page.headers.get('Location')).toBeNull();
    expect(page.headers.get('Content-Type')).toBe('application/problem+json');
  });

  it('sends www to the same address on automancer.uk without touching the origin', async () => {
    const fetchSpy = vi.fn(serve);
    vi.stubGlobal('fetch', fetchSpy);
    for (const [from, to] of [
      ['https://www.automancer.uk/services/?utm_campaign=spring%20offer', 'https://automancer.uk/services/?utm_campaign=spring%20offer'],
      ['http://www.automancer.uk/', 'https://automancer.uk/'],
      ['https://www.automancer.uk//evil.example/', 'https://automancer.uk//evil.example/'],
    ]) {
      const res = (await worker.fetch(new Request(from))) as Response;
      expect(res.status, from).toBe(301);
      expect(res.headers.get('Location'), from).toBe(to);
      expect(res.headers.get('Strict-Transport-Security'), from).toBe('max-age=15552000');
    }
    expect(fetchSpy).not.toHaveBeenCalled();
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
      'Cross-Origin-Opener-Policy': 'same-origin',
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
      ['www 301', (await worker.fetch(new Request('https://www.automancer.uk/about/'))) as Response],
      ['Pages slash 301', await get('/privacy')],
    ];
    for (const [label, res] of responses) {
      for (const [name, value] of Object.entries(expected)) expect(res.headers.get(name), `${label}: ${name}`).toBe(value);
      // No response may tell the browser to report to anyone for days after the visit.
      for (const name of ['NEL', 'Report-To', 'Reporting-Endpoints']) expect(res.headers.get(name), `${label}: ${name}`).toBeNull();
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

  // The release verifier proves production runs the reviewed worker.js by this header (t25749):
  // ops/edge/deploy.sh binds the uploaded bytes' SHA-256 as EDGE_SOURCE, and every answer names it.
  it('names the source it was deployed from on every response, and nothing it was not given', async () => {
    vi.stubGlobal('fetch', vi.fn(serve));
    const source = `sha256:${createHash('sha256').update(readFileSync('ops/edge/worker.js')).digest('hex')}`;
    const env = { EDGE_SOURCE: source };
    const ask = (url: string, accept = 'text/html') => worker.fetch(new Request(url, { headers: { Accept: accept } }), env) as Promise<Response>;
    const responses: [string, Response][] = [
      ['HTML page', await ask('https://automancer.uk/')],
      ['Markdown twin', await ask('https://automancer.uk/', 'text/markdown')],
      ['HTML 404', await ask('https://automancer.uk/nope')],
      ['API success', await ask('https://automancer.uk/api/services.json', 'application/json')],
      ['legacy 301', await ask('https://automancer.uk/about.html')],
      ['HTTPS 301', await ask('http://automancer.uk/about/')],
      ['www 301', await ask('https://www.automancer.uk/about/')],
      ['error tunnel', await ask(`https://automancer.uk${ERROR_TUNNEL}`)],
    ];
    for (const [label, res] of responses) expect(res.headers.get(EDGE_SOURCE_HEADER), label).toBe(source);
    // Without the binding (a Worker uploaded some other way), or with anything but a hash in it,
    // it names nothing, so the verifier cannot mistake it for a reviewed deploy.
    for (const bindings of [undefined, {}, { EDGE_SOURCE: 'main' }, { EDGE_SOURCE: `${source}\nX-Other: 1` }]) {
      const res = (await worker.fetch(new Request('https://automancer.uk/'), bindings)) as Response;
      expect(res.headers.get(EDGE_SOURCE_HEADER), JSON.stringify(bindings)).toBeNull();
    }
  });

  // A file kept for a year without asking must change URL when its bytes change; otherwise a
  // returning visitor keeps an old stylesheet or script after a release.
  it('keeps only content-addressed files for a year; pages keep the origin lifetime', async () => {
    const fetchSpy = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
      const path = new URL(input instanceof Request ? input.url : String(input)).pathname;
      const found = /^\/automancer-site\/(_astro|assets)\/[^/]+/.test(path) && !path.includes('missing');
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
      // A `.br` beside a file is its Brotli copy, served under the file's own URL (t24283).
      expect(name.replace(/\.br$/, ''), `dist/_astro/${name} has no content hash`).toMatch(/\.[\w-]{8}\.\w+$/);
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
  it("takes the GitHub Pages copy's lock out of every HTML page it serves, a 404 included (t23484)", async () => {
    vi.stubGlobal('fetch', vi.fn(serve));
    const page = await get('/locked/');
    expect(await page.text()).toBe('<html><head><script>guard</script></head><body>page</body></html>');
    expect(page.headers.get('Content-Length')).toBeNull();
    expect(page.headers.get('Strict-Transport-Security')).toBe('max-age=15552000');
    const missing = await get('/nowhere/', 'text/html');
    expect(missing.status).toBe(404);
    expect(await missing.text()).toBe('<html><head></head>404</html>');
    expect(await (await get('/', 'text/html')).text()).toBe('<html>home</html>');
  });

  it('starts the display-font request from the HTML response headers, with the page body intact', async () => {
    for (const page of contentPages()) {
      const href = page.doc.querySelectorAll('head link[rel="preload"][as="font"]')
        .map((el) => el.getAttribute('href'))
        .find((path) => path?.startsWith('/_astro/syne.'));
      expect(href, page.route).toBeTruthy();

      // Split the early head across chunks as it may arrive from Pages.
      const split = page.html.indexOf(href!) + 12;
      const encoder = new TextEncoder();
      vi.stubGlobal('fetch', () => Promise.resolve(new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(page.html.slice(0, split)));
          controller.enqueue(encoder.encode(page.html.slice(split)));
          controller.close();
        },
      }), { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
      const response = await get(page.route);
      const preloads = response.headers.get('Link')?.split(', ').filter((link) => link.includes('rel=preload'));
      expect(preloads, page.route).toEqual([`<${href!}>; rel=preload; as=font; type="font/woff2"; crossorigin`]);
      expect(await response.text(), page.route).toBe(page.html.replace(OFFSITE_LOCK, ''));
    }
  });

  it('finds the lock however the page arrives in chunks, and leaves one outside <head> alone', async () => {
    const page = `<!doctype html><html><head><meta charset="utf-8">${OFFSITE_LOCK}<title>£ é</title></head><body>${OFFSITE_LOCK}</body></html>`;
    const want = page.replace(OFFSITE_LOCK, '');
    const bytes = new TextEncoder().encode(page);
    const read = (chunks: Uint8Array[]) => new Response(unlocked(new ReadableStream({
      start(controller) { for (const c of chunks) controller.enqueue(c); controller.close(); },
    }))).text();
    for (let cut = 1; cut < bytes.length; cut += 1) {
      expect(await read([bytes.slice(0, cut), bytes.slice(cut)]), `split at byte ${cut}`).toBe(want);
    }
    expect(await read(Array.from(bytes, (b) => Uint8Array.of(b))), 'one byte at a time').toBe(want);
    const body = `<html><head></head><body>${OFFSITE_LOCK}</body></html>`;
    expect(await read([new TextEncoder().encode(body)]), 'a lock after </head> is page text').toBe(body);
  });
});

// Pages kept at the edge (t25774): a page is served from the data centre's cache at once and
// fetched again from Pages after each answer; a copy from before the newest release seen at the
// data centre is fetched again instead (t26545).
describe('pages kept at the edge', () => {
  // Pages as it stands: each page's HTML and its Brotli copy, changed by the test between views.
  let pages: Record<string, string>;
  // When Pages published the release it serves: every file's Last-Modified, as GitHub Pages dates them.
  let published: number;
  // A release: new words for some pages, every file dated by the new publication.
  const release = (changes: Record<string, string>) => {
    published += 3_600_000;
    Object.assign(pages, changes);
  };
  let calls: Request[];
  let pending: Promise<unknown>[];
  let kept: Map<string, Response>;
  // The release's compression dictionary (t26098), changed by the test as a release would.
  let dictionary: Buffer;
  const ctx = { waitUntil: (p: Promise<unknown>) => void pending.push(p) };
  const etag = (html: string) => `W/"${createHash('sha256').update(html).digest('hex').slice(0, 8)}"`;
  const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest();
  const holding = (dict: Buffer) => ({ 'Accept-Encoding': 'gzip, br, zstd, dcb, dcz', 'Available-Dictionary': `:${sha(dict).toString('base64')}:` });

  beforeEach(() => {
    pages = { '/kept/': '<html>first</html>', '/services/': '<html>services</html>' };
    published = Date.parse('2026-11-24T18:57:32Z');
    dictionary = Buffer.from('<html><head><style>shared frame</style></head><body></body></html>');
    calls = [];
    pending = [];
    kept = new Map();
    vi.stubGlobal('caches', {
      default: {
        match: async (req: Request) => kept.get(req.url)?.clone(),
        put: async (req: Request, res: Response) => void kept.set(req.url, new Response(await res.arrayBuffer(), res)),
        delete: async (req: Request) => kept.delete(req.url),
      },
    });
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      calls.push(request);
      const path = new URL(request.url).pathname.slice('/automancer-site'.length);
      const page = path.replace(/\.(br|dcz)$/, '').replace(/index\.html$/, '');
      const html = pages[page];
      if (html === undefined) return Promise.resolve(new Response('<html>404</html>', { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
      if (request.headers.get('If-None-Match') === etag(html)) return Promise.resolve(new Response(null, { status: 304, headers: { ETag: etag(html) } }));
      const headers = { ETag: etag(html), 'Last-Modified': new Date(published).toUTCString(), 'Cache-Control': 'max-age=600', Age: '179', Expires: 'Thu, 01 Jan 2026 00:00:00 GMT', Vary: 'Accept-Encoding' };
      if (path.endsWith('.dcz')) {
        const dcz = Buffer.concat([Buffer.from(DCZ_MAGIC), sha(dictionary), zstdCompressSync(html, { dictionary })]);
        return Promise.resolve(new Response(dcz, { headers: { ...headers, ETag: `W/"dcz-${etag(html).slice(3)}`, 'Content-Type': 'application/octet-stream' } }));
      }
      return Promise.resolve(path.endsWith('.br')
        ? new Response(brotliCompressSync(html), { headers: { ...headers, 'Content-Type': 'application/octet-stream' } })
        : new Response(html, { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } }));
    });
  });
  afterEach(() => vi.useRealTimers());

  const view = async (path: string, headers: Record<string, string> = {}, method = 'GET') => {
    const res = (await worker.fetch(new Request(`https://automancer.uk${path}`, {
      method, headers: { Accept: 'text/html', 'Accept-Encoding': 'gzip, br', ...headers },
    }), {}, ctx)) as Response;
    const bytes = res.body ? Buffer.from(await res.arrayBuffer()) : null;
    await Promise.all(pending.splice(0));
    const coding = res.headers.get('Content-Encoding');
    const decode = (b: Buffer) => {
      if (coding === 'br') return brotliDecompressSync(b);
      // A dcz body names the dictionary it needs; decode only with the one it names.
      if (coding === 'dcz') return zstdDecompressSync(b.subarray(40), { dictionary: dictionaryFor(dczDictionary(b)) });
      return b;
    };
    return { res, coding, text: bytes && bytes.length ? decode(bytes).toString() : null };
  };
  const dictionaries = new Map<string, Buffer>();
  const dictionaryFor = (hash: string | null) => {
    const found = hash && dictionaries.get(hash);
    if (!found) throw new Error(`no dictionary ${hash}`);
    return found;
  };
  const remember = (dict: Buffer) => dictionaries.set(sha(dict).toString('hex'), dict);

  it('serves a page from the edge at once, one view behind Pages at most', async () => {
    const first = await view('/kept/');
    expect(first.res.headers.get(PAGE_CACHE_HEADER)).toBe('miss');
    expect(first.text).toBe('<html>first</html>');
    expect(first.res.headers.get('Content-Encoding')).toBe('br');
    expect(kept.has(pageCacheKey('/kept/').url)).toBe(true);

    // A release changes the page: the next view gets the kept copy and the Worker fetches the
    // new one after answering, so the view after that gets the new page.
    pages['/kept/'] = '<html>second</html>';
    calls = [];
    const stale = await view('/kept/?service=audit');
    expect(stale.res.headers.get(PAGE_CACHE_HEADER)).toBe('hit');
    expect(stale.text).toBe('<html>first</html>');
    expect(calls.map((r) => r.url)).toContain(`${PAGES}/kept/index.html.br`);
    const fresh = await view('/kept/');
    expect(fresh.res.headers.get(PAGE_CACHE_HEADER)).toBe('hit');
    expect(fresh.text).toBe('<html>second</html>');
  });

  it('after a release, serves a copy kept before it to one view at most per data centre (t26545)', async () => {
    pages['/privacy/'] = '<html>privacy, first</html>';
    for (const path of ['/kept/', '/services/', '/privacy/']) expect((await view(path)).res.headers.get(PAGE_CACHE_HEADER)).toBe('miss');
    release({ '/kept/': '<html>second</html>', '/services/': '<html>services, second</html>', '/privacy/': '<html>privacy, second</html>' });

    // The first view after the release gets the copy kept before it, and teaches the data centre
    // the release from the page it fetches again after answering.
    const first = await view('/kept/');
    expect([first.res.headers.get(PAGE_CACHE_HEADER), first.text]).toEqual(['hit', '<html>first</html>']);
    // Every other page kept before it is fetched again and waited for, not served.
    calls = [];
    const next = await view('/services/');
    expect([next.res.headers.get(PAGE_CACHE_HEADER), next.text]).toEqual(['release', '<html>services, second</html>']);
    expect(calls.map((r) => r.url)).toContain(`${PAGES}/services/index.html.br`);
    expect(next.res.headers.get('Last-Modified')).toBe(new Date(published).toUTCString());
    for (const request of calls) expect([...request.headers.keys()], request.url).toEqual([]);
    // ...and kept again, so the view after that is answered at once.
    expect((await view('/services/')).res.headers.get(PAGE_CACHE_HEADER)).toBe('hit');
    const privacy = await view('/privacy/');
    expect([privacy.res.headers.get(PAGE_CACHE_HEADER), privacy.text]).toEqual(['release', '<html>privacy, second</html>']);
    // The page whose old copy taught the release was kept again then.
    expect((await view('/kept/')).text).toBe('<html>second</html>');
  });

  it('keeps every sitemap page of a release once a view teaches it to a data centre (t26986)', async () => {
    const loc = (paths: string[]) => paths.map((p) => `<url><loc>https://automancer.uk${p}</loc></url>`).join('');
    pages['/privacy/'] = '<html>privacy, first</html>';
    pages['/sitemap-index.xml'] = '<sitemapindex><sitemap><loc>https://automancer.uk/sitemap-0.xml</loc></sitemap></sitemapindex>';
    // Only this site's pages are fetched: not another host's, a feed or a page Pages lacks.
    pages['/sitemap-0.xml'] = `<urlset>${loc(['/kept/', '/services/', '/privacy/', '/gone/', '/field-notes/rss.xml'])}<url><loc>https://example.com/x/</loc></url></urlset>`;
    const fetched = () => calls.map((r) => new URL(r.url).pathname.slice('/automancer-site'.length));

    // The first view at a data centre that has seen no release waits for Pages, and keeps the rest.
    const first = await view('/kept/');
    expect(first.res.headers.get(PAGE_CACHE_HEADER)).toBe('miss');
    expect(fetched()).toEqual(expect.arrayContaining(['/sitemap-index.xml', '/sitemap-0.xml', '/services/index.html.br', '/privacy/index.html.br', '/gone/index.html.br']));
    expect(fetched().filter((p) => p.startsWith('/kept/') || p.includes('rss') || p.includes('example'))).toEqual(['/kept/index.html.br', '/kept/']);
    for (const request of calls) expect([...request.headers.keys()], request.url).toEqual([]);
    for (const path of ['/services/', '/privacy/']) expect((await view(path)).res.headers.get(PAGE_CACHE_HEADER), path).toBe('hit');
    expect(kept.has(pageCacheKey('/gone/').url)).toBe(false);

    // A release: the view that teaches it is served the copy kept before, and every other page is
    // the new release's at once, where each waited for Pages before (`release`).
    release({ '/kept/': '<html>second</html>', '/services/': '<html>services, second</html>', '/privacy/': '<html>privacy, second</html>' });
    expect((await view('/kept/')).text).toBe('<html>first</html>');
    const services = await view('/services/');
    expect([services.res.headers.get(PAGE_CACHE_HEADER), services.text]).toEqual(['hit', '<html>services, second</html>']);
    expect((await view('/privacy/')).text).toBe('<html>privacy, second</html>');

    // Once per release per data centre: later views and a hard reload do not fetch the sitemap again.
    calls = [];
    await view('/kept/');
    await view('/services/', { 'Cache-Control': 'no-cache' });
    kept.delete('https://automancer.uk/.edge-cache/release');
    await view('/kept/', { 'Cache-Control': 'no-cache' });
    expect(fetched()).not.toContain('/sitemap-index.xml');
  });

  it('never moves the release it knows back, and serves copies with no date as before', async () => {
    await view('/kept/');
    release({ '/kept/': '<html>second</html>' });
    await view('/kept/');
    const known = kept.get('https://automancer.uk/.edge-cache/release');
    expect(Number(known?.headers.get('X-Edge-Release'))).toBe(published);

    // Pages' own cache answering with the release before (GitHub's Fastly keeps a file ten
    // minutes): that copy is served and kept, and the data centre still knows the newer release,
    // so the next view fetches the page again rather than serving it.
    const newest = published;
    published -= 3_600_000;
    pages['/services/'] = '<html>services, from the cache</html>';
    expect((await view('/services/')).res.headers.get(PAGE_CACHE_HEADER)).toBe('miss');
    const again = kept.get('https://automancer.uk/.edge-cache/release');
    expect(Number(again?.headers.get('X-Edge-Release'))).toBe(newest);
    published = newest;
    pages['/services/'] = '<html>services, second</html>';
    const caught = await view('/services/');
    expect([caught.res.headers.get(PAGE_CACHE_HEADER), caught.text]).toEqual(['release', '<html>services, second</html>']);

    // A copy that carries no Last-Modified cannot be dated, so it is served as before.
    const [name] = [...kept.keys()].filter((url) => url.endsWith('/page/kept/'));
    const old = kept.get(name)!;
    const headers = JSON.parse(old.headers.get('X-Edge-Page-Headers')!).filter(([h]: [string]) => h.toLowerCase() !== 'last-modified');
    const undated = new Headers(old.headers);
    undated.set('X-Edge-Page-Headers', JSON.stringify(headers));
    kept.set(name, new Response(await old.clone().arrayBuffer(), { headers: undated }));
    release({});
    await view('/services/');
    expect((await view('/kept/')).res.headers.get(PAGE_CACHE_HEADER)).toBe('hit');
  });

  it('fetches the dictionary copy again too when it was kept before the release', async () => {
    remember(dictionary);
    await view('/kept/', holding(dictionary));
    await view('/services/', holding(dictionary));
    release({ '/kept/': '<html>second</html>', '/services/': '<html>services, second</html>' });
    expect((await view('/kept/', holding(dictionary))).res.headers.get(PAGE_CACHE_HEADER)).toBe('hit');
    const next = await view('/services/', holding(dictionary));
    expect([next.coding, next.res.headers.get(PAGE_CACHE_HEADER), next.text]).toEqual(['dcz', 'release', '<html>services, second</html>']);
  });

  it("answers a kept page with the page's own headers, dated now, and asks Pages with none of the visitor's", async () => {
    await view('/kept/');
    calls = [];
    const { res } = await view('/kept/', { Cookie: 'session=visitor-secret', 'CF-Connecting-IP': '203.0.113.7', Referer: 'https://automancer.uk/' });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(res.headers.get('Cache-Control')).toBe('max-age=600, no-transform');
    expect(res.headers.get('ETag')).toBe(etag('<html>first</html>'));
    expect(res.headers.get('Link')).toContain('rel="sitemap"');
    expect(varies(res)).toBe(true);
    expect(res.headers.get('Strict-Transport-Security')).toBe('max-age=15552000');
    // A browser counts the page's ten minutes from now, not from when it was kept.
    expect(Math.abs(Date.parse(res.headers.get('Date') ?? '') - Date.now())).toBeLessThan(2000);
    expect(res.headers.get('Age')).toBeNull();
    expect(res.headers.get('Expires')).toBeNull();
    expect(calls.length).toBeGreaterThan(0);
    for (const request of calls) expect([...request.headers.keys()], request.url).toEqual([]);
  });

  it('answers a browser that holds this copy with 304, from the edge too', async () => {
    await view('/kept/');
    const tag = etag('<html>first</html>');
    expect(namesTag(tag, tag)).toBe(true);
    expect(namesTag(`"other", ${tag.slice(2)}`, tag)).toBe(true);
    expect(namesTag('"other"', tag)).toBe(false);
    const { res, text } = await view('/kept/', { 'If-None-Match': tag });
    expect([res.status, res.headers.get(PAGE_CACHE_HEADER), text]).toEqual([304, 'hit', null]);
    expect(res.headers.get('ETag')).toBe(tag);
    const changed = await view('/kept/', { 'If-None-Match': '"older"' });
    expect([changed.res.status, changed.text]).toEqual([200, '<html>first</html>']);
  });

  it('waits for Pages on a hard reload, and never serves a copy older than its limit', async () => {
    await view('/kept/');
    pages['/kept/'] = '<html>second</html>';
    const reload = await view('/kept/', { 'Cache-Control': 'no-cache', Pragma: 'no-cache' });
    expect([reload.res.headers.get(PAGE_CACHE_HEADER), reload.text]).toEqual(['reload', '<html>second</html>']);

    pages['/kept/'] = '<html>third</html>';
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + PAGE_CACHE_SECONDS * 1000 + 1000);
    const old = await view('/kept/');
    expect([old.res.headers.get(PAGE_CACHE_HEADER), old.text]).toEqual(['miss', '<html>third</html>']);
  });

  it('drops a page Pages no longer has, after one more view at most', async () => {
    await view('/kept/');
    delete pages['/kept/'];
    expect((await view('/kept/')).res.headers.get(PAGE_CACHE_HEADER)).toBe('hit');
    expect([...kept.keys()].filter((url) => url.includes('/.edge-cache/page'))).toEqual([]);
    const gone = await view('/kept/');
    expect(gone.res.status).toBe(404);
    expect(gone.res.headers.get(PAGE_CACHE_HEADER)).toBeNull();
  });

  it("sends a browser holding the release's dictionary the page compressed against it, kept apart (t26098)", async () => {
    remember(dictionary);
    const first = await view('/kept/', holding(dictionary));
    expect([first.res.status, first.coding, first.res.headers.get(PAGE_CACHE_HEADER), first.text]).toEqual([200, 'dcz', 'miss', '<html>first</html>']);
    expect(first.res.headers.get('Vary')).toBe('Accept-Encoding, Accept, Available-Dictionary');
    expect(first.res.headers.get('Cache-Control')).toBe('max-age=600, no-transform');
    expect(first.res.headers.get('Link')).toContain('rel="sitemap"');
    expect(kept.has(pageCacheKey('/kept/', 'dcz').url)).toBe(true);
    expect(kept.has(pageCacheKey('/kept/').url)).toBe(false);
    const again = await view('/kept/', holding(dictionary));
    expect([again.coding, again.res.headers.get(PAGE_CACHE_HEADER), again.text]).toEqual(['dcz', 'hit', '<html>first</html>']);
    const tag = again.res.headers.get('ETag')!;
    const unchanged = await view('/kept/', { ...holding(dictionary), 'If-None-Match': tag });
    expect([unchanged.res.status, unchanged.coding, unchanged.text]).toEqual([304, 'dcz', null]);

    // A browser without dcz, or holding another dictionary (an earlier release's), gets Brotli,
    // on a page the edge keeps nothing of too.
    const cold = await view('/services/', holding(Buffer.from('an older frame')));
    expect([cold.coding, cold.res.headers.get(PAGE_CACHE_HEADER), cold.text]).toEqual(['br', 'miss', '<html>services</html>']);
    for (const headers of [{ 'Available-Dictionary': holding(dictionary)['Available-Dictionary'] }, holding(Buffer.from('an older frame'))]) {
      const other = await view('/kept/', headers);
      expect([other.coding, other.text], JSON.stringify(headers)).toEqual(['br', '<html>first</html>']);
    }
    // A hard reload waits for Pages, and still gets the dictionary copy.
    pages['/kept/'] = '<html>second</html>';
    const reload = await view('/kept/', { ...holding(dictionary), 'Cache-Control': 'no-cache' });
    expect([reload.coding, reload.res.headers.get(PAGE_CACHE_HEADER), reload.text]).toEqual(['dcz', 'reload', '<html>second</html>']);
  });

  it('serves a kept Brotli page at once rather than wait for the dictionary copy, and keeps that for next time', async () => {
    remember(dictionary);
    await view('/kept/');
    calls = [];
    const first = await view('/kept/', holding(dictionary));
    expect([first.coding, first.res.headers.get(PAGE_CACHE_HEADER), first.text]).toEqual(['br', 'hit', '<html>first</html>']);
    expect(calls.map((r) => r.url)).toContain(`${PAGES}/kept/index.html.dcz`);
    const next = await view('/kept/', holding(dictionary));
    expect([next.coding, next.res.headers.get(PAGE_CACHE_HEADER)]).toEqual(['dcz', 'hit']);

    // A release with a new dictionary: the old dictionary's kept copy is served once more at most,
    // and the copy kept after that answers only the new dictionary.
    const old = dictionary;
    dictionary = Buffer.from('<html><head><style>the next release</style></head></html>');
    remember(dictionary);
    pages['/kept/'] = '<html>second</html>';
    expect((await view('/kept/', holding(old))).coding).toBe('dcz');
    const stale = await view('/kept/', holding(old));
    expect(stale.coding).toBe('br');
    const fresh = await view('/kept/', holding(dictionary));
    expect([fresh.coding, fresh.text]).toEqual(['dcz', '<html>second</html>']);
    for (const request of calls) expect([...request.headers.keys()], request.url).toEqual([]);
  });

  it('reads the dictionary a browser holds, and a dcz copy, only in their exact forms', () => {
    const hash = createHash('sha256').update('x').digest();
    expect(availableDictionary(`:${hash.toString('base64')}:`)).toBe(hash.toString('hex'));
    for (const bad of [null, '', hash.toString('base64'), `:${hash.subarray(1).toString('base64')}:`, `"${hash.toString('base64')}"`, `:${hash.toString('base64')}:, :x:`]) {
      expect(availableDictionary(bad), String(bad)).toBeNull();
    }
    expect(acceptsCoding('gzip, br, dcb, dcz', 'dcz')).toBe(true);
    expect(acceptsCoding('gzip, br, dcz;q=0', 'dcz')).toBe(false);
    expect(acceptsCoding('gzip, br, zstd', 'dcz')).toBe(false);
    expect(dczDictionary(Buffer.concat([Buffer.from(DCZ_MAGIC), hash, Buffer.from('frame')]))).toBe(hash.toString('hex'));
    expect(dczDictionary(Buffer.concat([Buffer.from([0xff, 0x44, 0x43, 0x42]), hash]))).toBeNull();
    expect(dczDictionary(Buffer.from(DCZ_MAGIC))).toBeNull();
  });

  it('keeps only pages: twins, the API, HEAD, ranges and clients without Brotli always go to Pages', async () => {
    pages['/index.md'] = '# Home';
    const twin = await view('/', { Accept: 'text/markdown' });
    expect(twin.text).toBe('# Home');
    await view('/api/services.json', { Accept: 'application/json' });
    await view('/kept/', {}, 'HEAD');
    await view('/kept/', { Range: 'bytes=0-1' });
    await view('/kept/', { 'Accept-Encoding': 'gzip' });
    expect([...kept.keys()]).toEqual([]);
    // Without the Cache API (ops/edge/local.mjs, Node) a page is served as before.
    vi.stubGlobal('caches', undefined);
    expect((await view('/kept/')).res.headers.get(PAGE_CACHE_HEADER)).toBeNull();
  });
});

// Error reports (t24432): the page posts to ERROR_TUNNEL and the Worker passes them on to Sentry,
// so the visitor's browser never talks to Sentry and Sentry never gets their IP address.
describe('error report tunnel', () => {
  const DSN = `https://0123456789abcdef0123456789abcdef@${new URL(SENTRY_INGEST).host}/${SENTRY_PROJECT}`;
  const envelope = (dsn: string, ...items: [Record<string, unknown>, string][]) =>
    [JSON.stringify({ event_id: 'f'.repeat(32), dsn }),
      ...items.flatMap(([header, payload]) => [JSON.stringify(header), payload])].join('\n');
  const pageUrl = 'https://automancer.uk/contact/';
  const frame = { filename: 'https://automancer.uk/assets/js/main.js', lineno: 12, colno: 34, in_app: true };
  const cleanEvent = {
    event_id: 'f'.repeat(32), timestamp: 1795338000, platform: 'javascript', environment: 'production',
    release: 'b'.repeat(40), request: { url: pageUrl },
    exception: { values: [{ type: 'TypeError', value: 'Browser script error', stacktrace: { frames: [frame] } }] },
  };
  const event = (): [Record<string, unknown>, string] => [{ type: 'event' }, JSON.stringify(cleanEvent)];
  const visitor = {
    Origin: 'https://automancer.uk',
    'CF-Connecting-IP': '203.0.113.7',
    'X-Forwarded-For': '203.0.113.7',
    'True-Client-IP': '203.0.113.7',
    'CF-IPCountry': 'GB',
    Cookie: 'session=visitor-secret',
    Referer: 'https://automancer.uk/contact/?service=audit',
    'Accept-Language': 'en-GB',
    'Sec-CH-UA-Platform': '"Android"',
    'Sec-CH-UA-Model': '"FACTORY_TEST_DEVICE"',
    'User-Agent': 'Mozilla/5.0 (Linux; Android 18; FACTORY_TEST_DEVICE) Chrome/149.0.7843.86 Mobile Safari/537.36',
    'Content-Type': 'text/plain;charset=UTF-8',
  };
  // The Worker's own client key (the SENTRY_KEY secret, t24883); the page's DSN key is not it.
  const KEY = 'feedfacefeedfacefeedfacefeedface';
  const SIGNED = DSN.replace('0123456789abcdef0123456789abcdef', KEY);
  const env = { SENTRY_KEY: KEY };
  const post = (body: BodyInit, headers: Record<string, string> = visitor, method = 'POST', bindings: object = env) =>
    worker.fetch(new Request(`https://automancer.uk${ERROR_TUNNEL}`, { method, headers, body: method === 'POST' ? body : undefined }), bindings) as Promise<Response>;
  const sentry = () => vi.fn(() => Promise.resolve(new Response('{"id":"ffff"}', {
    status: 200, headers: { 'Content-Type': 'application/json', 'X-Sentry-Rate-Limits': '60::organization', 'X-Internal': 'x' },
  })));

  it('names the project ops/verify-production.sh expects', () => {
    const verifier = readFileSync(new URL('../ops/verify-production.sh', import.meta.url), 'utf8');
    expect(verifier).toContain(`readonly EXPECTED_SENTRY_PROJECT_ID='${SENTRY_PROJECT}'`);
    expect(verifier).toContain(new URL(SENTRY_INGEST).host);
  });

  it('sends only the source details and coarse browser context to Sentry', async () => {
    const fetchSpy = sentry();
    vi.stubGlobal('fetch', fetchSpy);
    const body = [
      JSON.stringify({ dsn: DSN, event_id: cleanEvent.event_id, sent_at: 'FACTORY_TEST_DATA', sdk: { name: 'FACTORY_TEST_DATA', version: 'FACTORY_TEST_DATA' } }),
      JSON.stringify({ type: 'event' }),
      JSON.stringify({
        ...cleanEvent,
        user: { email: 'FACTORY_TEST_DATA@example.invalid' },
        breadcrumbs: [{ message: 'FACTORY_TEST_DATA' }],
        contexts: { browser: { name: 'FACTORY_TEST_DATA', version: '149.0.7843.86' }, device: { model: 'FACTORY_TEST_DEVICE' } },
        request: { url: pageUrl + '?detail=FACTORY_TEST_DATA#FACTORY_TEST_DATA', data: 'FACTORY_TEST_DATA' },
        exception: { values: [{
          ...cleanEvent.exception.values[0], value: 'FACTORY_TEST_DATA',
          stacktrace: { frames: [
            { ...frame, filename: frame.filename + '?v=FACTORY_TEST_DATA', function: 'FACTORY_TEST_DATA' },
            { filename: 'https://example.invalid/FACTORY_TEST_DATA.js', lineno: 5 },
            { filename: pageUrl, lineno: 'FACTORY_TEST_DATA' },
            null,
          ] },
        }] },
      }),
    ].join('\n');
    const res = await post(body);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"id":"ffff"}');
    expect(res.headers.get('X-Sentry-Rate-Limits'), 'the SDK still hears to back off').toBe('60::organization');
    expect(res.headers.get('X-Internal')).toBeNull();
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('X-Content-Type-Options'), 'secured like every answer').toBe('nosniff');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [input, init] = (fetchSpy.mock.calls as unknown as [string, RequestInit][])[0];
    const sent = new Request(input, init);
    expect(sent.url).toBe(`${SENTRY_INGEST}/api/${SENTRY_PROJECT}/envelope/`);
    expect(sent.method).toBe('POST');
    expect(sent.redirect).toBe('manual');
    const [header, item, payload] = (await sent.text()).split('\n');
    expect(JSON.parse(header)).toEqual({ event_id: cleanEvent.event_id, dsn: SIGNED });
    expect(JSON.parse(item)).toEqual({ type: 'event', length: new TextEncoder().encode(payload).length });
    expect(JSON.parse(payload)).toEqual({
      ...cleanEvent,
      contexts: { browser: { type: 'browser', name: 'Chrome', version: '149' } },
    });
    expect(Object.fromEntries(sent.headers)).toEqual({
      'content-type': 'application/x-sentry-envelope',
      origin: 'https://automancer.uk',
      'user-agent': 'automancer-site-edge',
    });
  });

  it.each([
    ['Chrome/149.0.0.0 Safari/537.36 Edg/149.0.1.2', 'Edge', '149'],
    ['Version/26.1 CriOS/148.0.0.0 Mobile/15E148 Safari/604.1', 'Chrome', '148'],
    ['Version/26.1 EdgiOS/148.0.1.2 Mobile/15E148 Safari/604.1', 'Edge', '148'],
    ['Version/26.1 FxiOS/147.0 Mobile/15E148 Safari/604.1', 'Firefox', '147'],
    ['Gecko/20100101 Firefox/151.0', 'Firefox', '151'],
    ['Version/26.1 Mobile/15E148 Safari/604.1', 'Safari', '26'],
    ['Chrome/149.0.0.0 Safari/537.36 OPR/134.2.1.3', 'Opera', '134'],
    ['SamsungBrowser/31.1 Chrome/149.0.0.0 Mobile Safari/537.36', 'Samsung Internet', '31'],
    ['Chrome/149.0.0.0 Mobile Safari/537.36 EdgA/149.0.1.2', 'Edge', '149'],
    ['Chromium/149.1.2.3', 'Chromium', '149'],
    ['OtherBrowser/23.4', undefined, undefined],
    ['Chrome/123456.0', undefined, undefined],
    [undefined, undefined, undefined],
  ])('sends bounded browser context for User-Agent %s', async (agent, name, version) => {
    const fetchSpy = sentry();
    vi.stubGlobal('fetch', fetchSpy);
    const { 'User-Agent': _agent, ...otherHeaders } = visitor;
    const headers = agent === undefined ? otherHeaders : { ...otherHeaders, 'User-Agent': agent };
    const response = await post(envelope(DSN, event()), headers);
    expect(response.status).toBe(200);
    const [input, init] = (fetchSpy.mock.calls as unknown as [string, RequestInit][])[0];
    const sent = new Request(input, init);
    expect(sent.headers.get('User-Agent')).toBe('automancer-site-edge');
    const payload = JSON.parse((await sent.text()).split('\n')[2]);
    expect(payload.contexts).toEqual(name ? { browser: { type: 'browser', name, version } } : undefined);
  });

  it('passes nothing on that is not an error report from this site for this project', async () => {
    const fetchSpy = sentry();
    vi.stubGlobal('fetch', fetchSpy);
    const other = `https://0123456789abcdef0123456789abcdef@o999.ingest.sentry.io/${SENTRY_PROJECT}`;
    const refused: [string, Promise<Response>, number][] = [
      ['GET', post('', visitor, 'GET'), 405],
      ['empty body', post(''), 400],
      ['another site', post(envelope(DSN, event()), { ...visitor, Origin: 'https://evil.example' }), 403],
      ['no Origin', post(envelope(DSN, event()), { 'Content-Type': 'text/plain' }), 403],
      ['another Sentry org', post(envelope(other, event())), 400],
      ['another project', post(envelope(DSN.replace(SENTRY_PROJECT, '1'), event())), 400],
      ['wrong project path', post(envelope(`${DSN}/extra`, event())), 400],
      ['no DSN username', post(envelope(DSN.replace('0123456789abcdef0123456789abcdef@', ''), event())), 400],
      ['the tests\' DSN', post(envelope('https://public@example.invalid/1', event())), 400],
      ['no DSN', post(JSON.stringify({ event_id: 'f' }) + '\n' + JSON.stringify({ type: 'event' }) + '\n{}'), 400],
      ['no items', post(envelope(DSN)), 400],
      ['two events in one request', post(envelope(DSN, event(), event())), 400],
      ['no event payload', post(envelope(DSN, [{ type: 'event' }, ''])), 400],
      ['malformed event payload', post(envelope(DSN, [{ type: 'event' }, '{'])), 400],
      ['event with no exception', post(envelope(DSN, [{ type: 'event' }, '{}'])), 400],
      ['event with no useful frames', post(envelope(DSN, [{ type: 'event' }, '{"exception":{"values":[null,{"type":"Error"}]}}'])), 400],
      ['non-empty client report', post(envelope(DSN, [{ type: 'client_report' }, '{"timestamp":1,"discarded_events":[{"quantity":1}]}'])), 400],
      ['a session', post(envelope(DSN, event(), [{ type: 'session' }, '{}'])), 400],
      ['an attachment', post(envelope(DSN, [{ type: 'attachment', length: 3 }, 'a\nb'])), 400],
      ['not JSON', post('hello\nworld'), 400],
      ['declared too large', post(envelope(DSN, event()), { ...visitor, 'Content-Length': '65537' }), 413],
      ['too large', post(envelope(DSN, [{ type: 'event' }, JSON.stringify({ pad: 'x'.repeat(70000) })])), 413],
    ];
    for (const [label, response, status] of refused) {
      const res = await response;
      expect(res.status, label).toBe(status);
      expect(res.headers.get('Content-Type'), label).toBe('application/problem+json');
    }
    expect(fetchSpy, 'nothing left the Worker').not.toHaveBeenCalled();
  });

  it("signs every report with the Worker's key, whatever key the page's DSN carries", async () => {
    const fetchSpy = sentry();
    vi.stubGlobal('fetch', fetchSpy);
    const placeholder = DSN.replace('0123456789abcdef0123456789abcdef', 'tunnel');
    const report: [Record<string, unknown>, string] = [{ type: 'client_report' }, '{"timestamp":1,"discarded_events":[]}'];
    for (const dsn of [DSN, placeholder, DSN.replace('@', ':secret@')]) {
      expect((await post(envelope(dsn, event()))).status, dsn).toBe(200);
    }
    expect((await post(envelope(placeholder, report))).status, 'a client report, as the verifier posts').toBe(200);
    const sent = await Promise.all((fetchSpy.mock.calls as unknown as [string, RequestInit][]).map(([input, init]) => new Request(input, init).text()));
    expect(sent).toHaveLength(4);
    for (const message of sent) expect(JSON.parse(message.split('\n')[0]).dsn).toBe(SIGNED);
    expect(JSON.parse(sent[3].split('\n')[2])).toEqual({ timestamp: 1, discarded_events: [] });
  });

  it("never passes a report on with the page's key when the Worker holds none", async () => {
    const fetchSpy = sentry();
    vi.stubGlobal('fetch', fetchSpy);
    for (const bindings of [{}, { SENTRY_KEY: '' }]) {
      const res = await post(envelope(DSN, event()), visitor, 'POST', bindings);
      expect(res.status).toBe(503);
      expect(res.headers.get('Content-Type')).toBe('application/problem+json');
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('takes a limited number of reports from one visitor and tells the SDK to wait', async () => {
    const fetchSpy = sentry();
    vi.stubGlobal('fetch', fetchSpy);
    const seen: string[] = [];
    let left = 2;
    const ERROR_REPORTS = { limit: vi.fn(async ({ key }: { key: string }) => { seen.push(key); return { success: left-- > 0 }; }) };
    const statuses = [];
    for (let i = 0; i < 3; i += 1) statuses.push((await post(envelope(DSN, event()), visitor, 'POST', { ...env, ERROR_REPORTS })));
    expect(statuses.map((r) => r.status)).toEqual([200, 200, 429]);
    const limited = statuses[2];
    expect(limited.headers.get('Content-Type')).toBe('application/problem+json');
    expect(limited.headers.get('Retry-After')).toBe('60');
    expect(limited.headers.get('X-Sentry-Rate-Limits')).toBe('60::organization');
    expect(seen, 'counted per visitor address').toEqual(['203.0.113.7', '203.0.113.7', '203.0.113.7']);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const forged = await post(envelope(DSN, event()), { ...visitor, Origin: 'https://evil.example' }, 'POST', { ...env, ERROR_REPORTS });
    expect(forged.status, 'another site is refused before it is counted').toBe(403);
    expect(ERROR_REPORTS.limit).toHaveBeenCalledTimes(3);
  });

  it('checks a length-delimited payload against its exact byte boundary', async () => {
    const fetchSpy = sentry();
    vi.stubGlobal('fetch', fetchSpy);
    const payload = JSON.stringify({ ...cleanEvent, extra: { fixture: 'café' } }, null, 2);
    const length = new TextEncoder().encode(payload).byteLength;
    expect((await post(envelope(DSN, [{ type: 'event', length }, payload]) + '\n')).status).toBe(200);
    for (const wrongLength of [-1, length - 1, length + 1]) {
      expect((await post(envelope(DSN, [{ type: 'event', length: wrongLength }, payload]))).status).toBe(400);
    }
    expect((await post(envelope(DSN, [{ type: 'event', length }, payload], event()))).status).toBe(400);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('cancels an undeclared oversized upload as soon as it crosses 64 KiB', async () => {
    const fetchSpy = sentry();
    vi.stubGlobal('fetch', fetchSpy);
    const cancel = vi.fn();
    let read = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        read += 1;
        controller.enqueue(new Uint8Array(read === 1 ? 65536 : 1));
        if (read === 3) controller.close();
      },
      cancel,
    }, { highWaterMark: 0 });
    const request = new Request(`https://automancer.uk${ERROR_TUNNEL}`, {
      method: 'POST', headers: visitor, body, duplex: 'half',
    } as RequestInit);
    expect(request.headers.get('Content-Length')).toBeNull();
    expect((await worker.fetch(request, env)).status).toBe(413);
    expect(read).toBe(2);
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('answers a 502 problem when Sentry cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('down'))));
    const res = await post(envelope(DSN, event()));
    expect(res.status).toBe(502);
    expect(res.headers.get('Content-Type')).toBe('application/problem+json');
  });

  it('refuses upstream redirects so the signed report stays at the pinned endpoint', async () => {
    const fetchSpy = vi.fn(async () => new Response(null, { status: 307, headers: { Location: 'https://example.invalid/' } }));
    vi.stubGlobal('fetch', fetchSpy);
    const res = await post(envelope(DSN, event()));
    expect(res.status).toBe(502);
    expect(res.headers.get('Location')).toBeNull();
    expect(fetchSpy).toHaveBeenCalledOnce();
  });
});
