import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { legacyRedirect } from '../ops/edge/worker.js';
import { allHtmlFiles } from './support/dist';

// A stand-in for GitHub Pages: two pages, one twin, everything else 404.
const origin: Record<string, [number, string, string]> = {
  '/': [200, 'text/html; charset=utf-8', '<html>home</html>'],
  '/index.md': [200, 'text/markdown; charset=utf-8', '# Home'],
  '/privacy/': [200, 'text/html; charset=utf-8', '<html>privacy</html>'],
  '/api/services.json': [200, 'application/json; charset=utf-8', '{}'],
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
      for (const path of [legacy, `${legacy}/`, `${legacy}?ref=old`]) {
        const res = await get(path);
        expect(res.status, path).toBe(301);
        expect(res.headers.get('Location'), path).toBe(`https://automancer.uk${target}${path.includes('?') ? '?ref=old' : ''}`);
      }
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(legacyRedirect('/contact.html')).toBeNull();
    expect(legacyRedirect('/services/')).toBeNull();
  });
});
