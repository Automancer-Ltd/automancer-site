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
//   - Every response, HTML, Markdown, JSON, error or redirect, carries the
//     same SECURITY_HEADERS, so people and machines get the same answers.
//   - Fingerprinted files are cached for a year and fonts and images for a
//     day, in browsers and at the edge (cachePolicy; t18923).
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

// Sent on every response. ops/verify-production.sh reads these back from
// production, so a change here changes the check there too. HSTS matches the
// automancer.uk zone security_header setting (t15574: 6 months, no
// includeSubDomains), which Cloudflare's edge applies over Worker headers.
const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=15552000',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

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

// How long browsers and the Cloudflare edge keep a file. GitHub Pages sends
// max-age=600 on everything, so after ten minutes a returning visitor's
// browser asks again for every stylesheet, font and script before it can
// paint. Only files whose URL changes when their bytes change may be kept
// for a year without asking: Astro's /_astro/ files carry a content hash and
// main.js carries the commit as ?v=. Unversioned fonts, images and fonts.css
// are kept for a day and then refreshed in the background, so a changed file
// there reaches every visitor within a day (rename it to make that instant).
// Pages, Markdown, JSON and unversioned scripts keep the origin's ten minutes.
const YEAR = 31536000;
const DAY = 86400;
const IMMUTABLE = { browser: `public, max-age=${YEAR}, immutable`, edge: YEAR };
const DAILY = { browser: `public, max-age=${DAY}, stale-while-revalidate=${7 * DAY}`, edge: DAY };

/** The browser Cache-Control and edge lifetime (seconds) for a URL, or null to keep the origin's. */
export function cachePolicy(pathname, search) {
  if (pathname.startsWith('/_astro/')) return IMMUTABLE;
  if (pathname === '/assets/js/main.js' && /^\?v=[0-9a-f]{7,40}$/.test(search)) return IMMUTABLE;
  if (/^\/assets\/(fonts|images|css)\//.test(pathname)) return DAILY;
  return null;
}

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

/** A mutable copy of a response with SECURITY_HEADERS set on it. */
function secured(response) {
  const out = new Response(response.body, response);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) out.headers.set(name, value);
  return out;
}

export default {
  async fetch(request) {
    return secured(await respond(request));
  },
};

async function respond(request) {
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

  const policy = readOnly ? cachePolicy(url.pathname, url.search) : null;
  const res = await fetch(new Request(originUrl, request), {
    redirect: 'manual',
    // Only a found file is kept; a 404 or an error is asked for again next time.
    ...(policy && { cf: { cacheTtlByStatus: { '200-299': policy.edge, '300-599': -1 } } }),
  });

  if (res.status >= 400 && (isApi || prefers(accept, 'application/json', 'text/html'))) {
    return res.status === 404
      ? problem(404, 'Not Found', `No resource at ${url.pathname}. Every endpoint is listed at ${ORIGIN}/api/index.json.`, url.pathname)
      : problem(res.status >= 500 ? 502 : res.status, 'Upstream error', `The static host answered HTTP ${res.status}. Try again shortly.`, url.pathname);
  }
  if (res.status === 404 && prefers(accept, 'text/markdown', 'text/html')) return markdownNotFound(url.pathname);

  const out = withVary(res);
  // A 304 carries the new lifetime too, so a copy cached under the old one is renewed.
  if (policy && (res.ok || res.status === 304)) {
    out.headers.set('Cache-Control', policy.browser);
    out.headers.delete('Expires');
  }
  if ((out.headers.get('Content-Type') ?? '').startsWith('text/html') && res.ok) {
    const twin = url.pathname === '/' ? ', </index.md>; rel="alternate"; type="text/markdown"' : '';
    out.headers.set('Link', PAGE_LINKS + twin);
  }
  if (url.pathname === '/.well-known/api-catalog') {
    out.headers.set('Content-Type', 'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"');
  }
  return out;
}
