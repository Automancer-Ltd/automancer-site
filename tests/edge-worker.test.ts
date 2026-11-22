import { afterEach, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import worker, { OFFSITE_LOCK, acceptsBrotli, atOrigin, atPages, brotliFile, cachePolicy, fromPages, legacyRedirect, unlocked } from '../ops/edge/worker.js';
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
    // A revalidation and a range request still reach Pages, so a 304 and a 206 still work.
    const page = fetchSpy.mock.calls[0][0] as Request;
    expect(page.headers.get('If-None-Match')).toBe('"abc"');
    expect(page.headers.get('If-Modified-Since')).toBe('Sat, 21 Nov 2026 23:49:16 GMT');
    expect(page.headers.get('Range')).toBe('bytes=0-99');
    expect(page.method).toBe('GET');
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
