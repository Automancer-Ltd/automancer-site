// Edge Worker in front of GitHub Pages for automancer.uk (route automancer.uk/*).
//
// GitHub Pages serves fixed files, so it cannot answer per request. This
// Worker adds only what needs that, and only from files the build already
// publishes:
//   - Accept: text/markdown on a page with a Markdown twin gets the twin.
//   - A 404 asked for as Markdown gets a Markdown body pointing at the indexes.
//   - Errors under /api/ are RFC 9457 application/problem+json.
//   - /.well-known/api-catalog gets its RFC 9727 media type.
//   - Plain HTTP is redirected to HTTPS, as GitHub Pages did before the proxy.
//   - A legacy *.html URL gets one real 301 to its page.
// Everything else passes through untouched. Deploy and undo: docs/DEPLOYMENT.md.

const ORIGIN = 'https://automancer.uk';
const MARKDOWN = 'text/markdown; charset=utf-8';
const PROBLEM = 'application/problem+json';
// RFC 8288 discovery links on every HTML page; each target is a published file.
const PAGE_LINKS = [
  '</sitemap-index.xml>; rel="sitemap"',
  '</llms.txt>; rel="describedby"; type="text/plain"',
  '</openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json"',
  '</.well-known/api-catalog>; rel="api-catalog"',
].join(', ');

// The `redirects` in astro.config.mjs. Pages can only serve them as a 301 to
// /x.html/ and then a meta-refresh stub, which a crawler or agent that follows
// HTTP redirects reads as the page itself. tests/edge-worker.test.ts fails if
// a built stub is missing here or points somewhere else.
const LEGACY_REDIRECTS = new Map([
  ['/services.html', '/services/'],
  ['/about.html', '/about/'],
  ['/book.html', '/contact/'],
  ['/privacy.html', '/privacy/'],
  ['/terms.html', '/terms/'],
]);

/** The page a legacy URL moved to, with or without its stub's trailing slash, or null. */
export function legacyRedirect(pathname) {
  return LEGACY_REDIRECTS.get(pathname.replace(/\/$/, '')) ?? null;
}

/** q-value Accept gives a media type: the most specific matching range wins (RFC 9110 §12.5.1). */
function quality(accept, type) {
  const ranges = new Map();
  for (const part of accept.toLowerCase().split(',')) {
    const [range, ...params] = part.split(';').map((x) => x.trim());
    const q = params.find((p) => p.startsWith('q='));
    ranges.set(range, q ? Number(q.slice(2)) || 0 : 1);
  }
  const [major] = type.split('/');
  return ranges.get(type) ?? ranges.get(`${major}/*`) ?? ranges.get('*/*') ?? 0;
}

export function prefers(accept, type, over) {
  if (!accept) return false;
  const want = quality(accept, type);
  return want > 0 && want > quality(accept, over);
}

/** The Markdown twin path for a page path, or null for file-like paths. */
export function twinPath(pathname) {
  if (pathname === '/' || pathname === '/index.html') return '/index.md';
  const trimmed = pathname.replace(/\/$/, '');
  if ((trimmed.split('/').pop() ?? '').includes('.')) return null;
  return `${trimmed}.md`;
}

function problem(status, title, detail, instance) {
  return new Response(
    JSON.stringify({ type: 'about:blank', title, status, detail, instance, docs: `${ORIGIN}/developers/` }, null, 2) + '\n',
    { status, headers: { 'Content-Type': PROBLEM, 'Access-Control-Allow-Origin': '*', Vary: 'Accept' } }
  );
}

function markdownNotFound(pathname) {
  const body = `# Not found

There is no page at \`${pathname}\` on automancer.uk.

- [llms.txt](${ORIGIN}/llms.txt): a short guide to this site for agents
- [Sitemap](${ORIGIN}/sitemap-index.xml): every page
- [Developer docs](${ORIGIN}/developers/): the public JSON API and Markdown twins
`;
  return new Response(body, { status: 404, headers: { 'Content-Type': MARKDOWN, Vary: 'Accept' } });
}

function withVary(response) {
  const out = new Response(response.body, response);
  const vary = out.headers.get('Vary');
  const tokens = (vary ?? '').split(',').map((t) => t.trim().toLowerCase());
  if (!tokens.includes('accept')) out.headers.set('Vary', vary ? `${vary}, Accept` : 'Accept');
  return out;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.protocol === 'http:') {
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }
    const moved = legacyRedirect(url.pathname);
    if (moved) return Response.redirect(new URL(moved + url.search, ORIGIN).toString(), 301);
    const accept = request.headers.get('Accept') ?? '';
    const isApi = url.pathname.startsWith('/api/');
    const readOnly = request.method === 'GET' || request.method === 'HEAD';

    if (isApi && !readOnly) {
      const res = problem(405, 'Method Not Allowed', 'This API is read-only: only GET and HEAD exist.', url.pathname);
      res.headers.set('Allow', 'GET, HEAD');
      return res;
    }

    const originUrl = new URL(url.pathname + url.search, ORIGIN);

    if (readOnly && prefers(accept, 'text/markdown', 'text/html')) {
      const twin = twinPath(url.pathname);
      if (twin) {
        const res = await fetch(new URL(twin, ORIGIN), { method: request.method });
        if (res.ok) {
          const out = withVary(res);
          out.headers.set('Content-Type', MARKDOWN);
          out.headers.set('Content-Location', twin);
          return out;
        }
      }
    }

    const res = await fetch(new Request(originUrl, request), { redirect: 'manual' });

    if (res.status >= 400 && (isApi || prefers(accept, 'application/json', 'text/html'))) {
      return res.status === 404
        ? problem(404, 'Not Found', `No resource at ${url.pathname}. Every endpoint is listed at ${ORIGIN}/api/index.json.`, url.pathname)
        : problem(res.status >= 500 ? 502 : res.status, 'Upstream error', `The static host answered HTTP ${res.status}. Try again shortly.`, url.pathname);
    }
    if (res.status === 404 && prefers(accept, 'text/markdown', 'text/html')) return markdownNotFound(url.pathname);

    const out = withVary(res);
    if ((out.headers.get('Content-Type') ?? '').startsWith('text/html') && res.ok) {
      const twin = url.pathname === '/' ? ', </index.md>; rel="alternate"; type="text/markdown"' : '';
      out.headers.set('Link', PAGE_LINKS + twin);
    }
    if (url.pathname === '/.well-known/api-catalog') {
      out.headers.set('Content-Type', 'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"');
    }
    return out;
  },
};
