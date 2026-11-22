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
//   - www.automancer.uk gets one 301 to the same path on automancer.uk.
//   - A legacy *.html URL gets one real 301 to its page.
//   - Every HTML page has the lock the build puts in it for the GitHub Pages
//     copy taken out (OFFSITE_LOCK), so it is drawn only here.
//   - The display font's HTML preload is also sent in the response headers.
//   - Every response, HTML, Markdown, JSON, error or redirect, carries the
//     same SECURITY_HEADERS, so people and machines get the same answers.
//   - Fingerprinted files are cached for a year and fonts and images for a
//     day, in browsers and at the edge (cachePolicy; t18923).
//   - GitHub Pages is asked for the file only: none of the visitor's IP
//     address, cookies, Referer or browser details go with it (pagesRequest).
//   - A browser that takes Brotli gets the copy the build compressed at the
//     highest level (BROTLI_TYPES, src/integrations/precompress.ts), not
//     Cloudflare's quicker on-the-fly compression: about a quarter fewer bytes.
// Everything else passes through untouched. Deploy and undo: docs/DEPLOYMENT.md.
//
// The files come from the GitHub Pages project address (PAGES), not from
// automancer.uk itself (t22925). The Pages site has no custom domain, so GitHub
// serves it on its own *.github.io certificate, which GitHub renews. While
// automancer.uk was the Pages custom domain, GitHub could not renew that
// certificate behind Cloudflare's proxy: every renewal meant hours with the
// proxy off, and a missed one would have answered 526 on every page.
//
// It runs as this ES module, byte for byte, on the Workers runtime of the
// compatibility date in ops/edge/deploy.sh (t21891). Until then it ran as a
// rewritten service-worker script with no date, on the 2021 runtime.

const ORIGIN = 'https://automancer.uk';
// Where the published files are fetched from: the Pages site of
// Automancer-Ltd/automancer-site, which carries no custom domain.
const PAGES_HOST = 'automancer-ltd.github.io';
const PAGES_PATH = '/automancer-site';
// Other names for the site, each sent to the same path on ORIGIN. www was a
// DNS-only CNAME to GitHub, which redirected it while automancer.uk was the
// Pages custom domain; it is now proxied to this Worker instead, so no DNS
// name of the site points at GitHub for someone else's Pages site to claim.
const ALIASES = new Set(['www.automancer.uk']);
const MARKDOWN = 'text/markdown; charset=utf-8';
const PROBLEM = 'application/problem+json';
// RFC 8288 discovery links on every HTML page; each target is a published file.
const PAGE_LINKS = [
  '</sitemap-index.xml>; rel="sitemap"',
  '</llms.txt>; rel="describedby"; type="text/plain"',
  '</openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json"',
  '</.well-known/api-catalog>; rel="api-catalog"',
].join(', ');
// BaseLayout preloads the content-hashed Syne font just after the CSP and lock.
const DISPLAY_FONT_PRELOAD = /<link rel="preload" href="(\/_astro\/syne\.[\w-]{8}\.woff2)" as="font" type="font\/woff2" crossorigin>/;
const PRELOAD_SCAN_BYTES = 4096;

// Sent on every response. ops/verify-production.sh reads these back from
// production, so a change here changes the check there too. HSTS matches the
// automancer.uk zone security_header setting (t15574: 6 months, no
// includeSubDomains), which Cloudflare's edge applies over Worker headers.
// Cross-Origin-Opener-Policy puts every page in its own browsing context group:
// a site that opens automancer.uk in a window gets back a closed handle, so it
// cannot later swap the page for a look-alike, message it or count its frames
// (t22383).
const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=15552000',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
};
// The lock every built page carries in its <head> (BaseLayout.astro, t23484):
// it hides the page and says where the site lives. The Worker takes it out of
// every HTML response (unlocked()), so automancer.uk is drawn as built, while
// the GitHub Pages copy keeps it. That copy carries none of SECURITY_HEADERS,
// and its script guard (t23224) does not run in a frame sandboxed without
// allow-scripts, where the whole page, prices and Contact button included,
// used to draw inside a stranger's site. These exact bytes are what the build
// emits and what is removed, so a change here changes both.
export const OFFSITE_LOCK =
  '<style>body>*{display:none!important}body::before{content:"This page is at automancer.uk";display:block;padding:2rem;font:1.25rem/1.5 system-ui,sans-serif}</style>';
/** `html` with its first OFFSITE_LOCK in the <head> taken out, as unlocked() does to a stream. */
export function withoutLock(html) {
  const at = html.indexOf(OFFSITE_LOCK);
  const headEnd = html.indexOf('</head>');
  return at !== -1 && (headEnd === -1 || at < headEnd) ? html.slice(0, at) + html.slice(at + OFFSITE_LOCK.length) : html;
}

// Built Brotli copies (t24283). Cloudflare compresses what GitHub Pages sends on
// the fly, quickly and so loosely: Chrome and Firefox got zstd, Safari Brotli,
// both larger than GitHub's own gzip. The build writes `<file>.br` beside every
// file of these types at Brotli's highest level (src/integrations/precompress.ts),
// HTML with OFFSITE_LOCK already taken out, as this Worker would serve it. A
// visitor whose browser takes Brotli gets those bytes untouched: 648,720 →
// 494,045 B for the 32 sitemap pages, and 20,839 → 15,781 B for the home page
// (measured live, 22 Nov 2026). Pages serves `.br` files as plain bytes, so the
// type is the one Pages gives the file itself (the same as ops/edge/local.mjs).
export const BROTLI_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.xml': 'application/xml',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

/** The built Brotli copy for a URL path and the type of the file it holds, or null when the build makes none. */
export function brotliFile(pathname) {
  if (pathname.includes('//')) return null;
  const file = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
  const ext = /\.[a-z0-9]+$/.exec(file.slice(file.lastIndexOf('/')))?.[0];
  const type = ext && Object.hasOwn(BROTLI_TYPES, ext) ? BROTLI_TYPES[ext] : null;
  return type ? { path: `${file}.br`, type } : null;
}

/** Whether an Accept-Encoding header takes Brotli (`br` listed without q=0). */
export function acceptsBrotli(acceptEncoding) {
  return (acceptEncoding ?? '').toLowerCase().split(',').some((part) => {
    const [coding, ...params] = part.split(';').map((x) => x.trim());
    const q = params.find((p) => p.startsWith('q='));
    return coding === 'br' && (q === undefined || Number(q.slice(2)) > 0);
  });
}

// Headers that tell the visitor's browser to send reports to a server for days
// after a visit (Network Error Logging and the Reporting API). The pages may
// contact only this site and the error monitor, and a CSP cannot stop these,
// so no response carries one. Cloudflare's own NEL is the zone setting `nel`,
// off on automancer.uk and automancer.co.uk since t22383; this strips any the
// origin adds, and ops/verify-production.sh fails if one is served.
const REPORTING_HEADERS = ['NEL', 'Report-To', 'Reporting-Endpoints'];
// SVG and XML are active documents in browsers when opened directly and carry no
// <meta> tag, so the edge header gives them the same nothing-allowed floor.
const XML_DOCUMENT_CSP =
  "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'none'; require-trusted-types-for 'script'; trusted-types 'none'";
const XML_CONTENT_TYPE = /^(?:image\/svg\+xml|(?:application|text)\/(?:[a-z0-9.+-]+\+)?xml)\b/i;

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

/**
 * `pathname` and `search` on the public site. Never `new URL(path, ORIGIN)`: under
 * the standard URL parser a path that starts with `//` (`//services/`) names
 * another host, so the request would leave for `https://services/`.
 */
export function atOrigin(pathname, search = '') {
  const out = new URL(ORIGIN);
  out.pathname = pathname;
  out.search = search;
  return out;
}

/** The same `pathname` and `search` on the Pages project the files are fetched from. */
export function atPages(pathname, search = '') {
  const out = new URL(`https://${PAGES_HOST}`);
  out.pathname = PAGES_PATH + pathname;
  out.search = search;
  return out;
}

// The only request headers that change what GitHub Pages answers: validators
// for a 304 and ranges for a 206. Pages serves the same file to everyone, so
// it is sent nothing else of the visitor's (t23955). Copying the visitor's
// request, as the Worker did until then, gave GitHub their IP address
// (CF-Connecting-IP, X-Forwarded-For), every cookie a browser holds for
// automancer.uk (including any an estate app scopes to the whole domain),
// the full Referer (on a click between pages, the page and its query, such
// as ?service=), Accept-Language and User-Agent, on every page view.
const PAGES_REQUEST_HEADERS = ['If-None-Match', 'If-Modified-Since', 'Range', 'If-Range'];

/** The request sent to the Pages project for a visitor's request: its method and PAGES_REQUEST_HEADERS only. */
export function pagesRequest(url, request) {
  const headers = new Headers();
  for (const name of PAGES_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  return new Request(url, { method: request.method, headers });
}

/**
 * A redirect GitHub Pages sent (`/services` → `/services/`) moved back onto the
 * public site, or null when it leaves the Pages project. GitHub names its own
 * address in Location; a visitor must never be sent there.
 */
export function fromPages(location) {
  if (!location) return null;
  const to = new URL(location, atPages('/'));
  if (to.host !== PAGES_HOST) return null;
  if (to.pathname !== PAGES_PATH && !to.pathname.startsWith(`${PAGES_PATH}/`)) return null;
  return atOrigin(to.pathname.slice(PAGES_PATH.length) || '/', to.search).toString();
}

/** The page a legacy URL moved to (including /x.html/index.html or //x.html/), or null. */
export function legacyRedirect(pathname) {
  return LEGACY_REDIRECTS.get(pathname.replace(/\/{2,}/g, '/').replace(/\/(?:index\.html)?$/, '')) ?? null;
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

/**
 * The Markdown twin path for a page path, or null for file-like paths. Repeated slashes collapse
 * (`//services/` → `/services.md`): the twin is named in Content-Location, where `//services.md`
 * would read as another host.
 */
export function twinPath(pathname) {
  const path = pathname.replace(/\/{2,}/g, '/');
  if (path === '/' || path === '/index.html') return '/index.md';
  const trimmed = path.replace(/\/$/, '');
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

// Responses whose body is already Brotli (encodeBody: 'manual'). A copy made with
// `new Response(body, response)` would lose that, and the runtime would compress
// the compressed bytes again, so these are only ever changed in place.
const ENCODED = new WeakSet();

/** A mutable copy of a response with SECURITY_HEADERS set on it. */
function secured(response) {
  const out = ENCODED.has(response) ? response : new Response(response.body, response);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) out.headers.set(name, value);
  for (const name of REPORTING_HEADERS) out.headers.delete(name);
  if (XML_CONTENT_TYPE.test(out.headers.get('Content-Type') ?? '')) {
    out.headers.set('Content-Security-Policy', XML_DOCUMENT_CSP);
  }
  return out;
}

/**
 * An HTML body stream with the first OFFSITE_LOCK in its <head> taken out, as it
 * streams: nothing waits for the whole page. Bodies without one pass through
 * unchanged, so a Worker deployed before the build that adds the lock is safe.
 */
export function unlocked(body) {
  const keep = OFFSITE_LOCK.length - 1;
  let carry = '';
  let searching = true;
  return body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new TransformStream({
      transform(chunk, controller) {
        if (!searching) return controller.enqueue(chunk);
        const text = carry + chunk;
        carry = '';
        const at = text.indexOf(OFFSITE_LOCK);
        const headEnd = text.indexOf('</head>');
        if (at !== -1 && (headEnd === -1 || at < headEnd)) {
          searching = false;
          return controller.enqueue(text.slice(0, at) + text.slice(at + OFFSITE_LOCK.length));
        }
        if (headEnd !== -1) {
          searching = false;
          return controller.enqueue(text);
        }
        // Hold back what could be the start of a lock split across two chunks.
        const cut = Math.max(0, text.length - keep);
        carry = text.slice(cut);
        if (cut) controller.enqueue(text.slice(0, cut));
      },
      flush(controller) {
        if (carry) controller.enqueue(carry);
      },
    }))
    .pipeThrough(new TextEncoderStream());
}

/**
 * Read the early head to get the current font URL, then replay those bytes and stream the rest.
 * The HTML preload still works if the link is absent or farther into the page.
 */
async function withDisplayFontPreload(body, response) {
  const reader = body.getReader();
  const { chunks, done, href } = await displayFont(reader);
  const replay = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      if (done) controller.close();
    },
    async pull(controller) {
      const next = await reader.read();
      if (next.done) controller.close();
      else controller.enqueue(next.value);
    },
    cancel(reason) { return reader.cancel(reason); },
  });
  const out = new Response(replay, response);
  if (href) out.headers.append('Link', fontLink(href));
  return out;
}

/** The Link header every HTML page gets: discovery links, and the home page's Markdown twin. */
const pageLinks = (pathname) => PAGE_LINKS + (pathname === '/' ? ', </index.md>; rel="alternate"; type="text/markdown"' : '');
const fontLink = (href) => `<${href}>; rel=preload; as=font; type="font/woff2"; crossorigin`;

/** The display font preload in the early head of an HTML stream, with the chunks read to find it. */
async function displayFont(reader) {
  const decoder = new TextDecoder();
  const chunks = [];
  let remaining = PRELOAD_SCAN_BYTES;
  let prefix = '';
  let href;
  let done = false;
  while (remaining > 0) {
    const next = await reader.read();
    done = next.done;
    if (done) break;
    chunks.push(next.value);
    const bytes = next.value.subarray(0, remaining);
    remaining -= bytes.length;
    prefix += decoder.decode(bytes, { stream: true });
    const head = prefix.split(/<\/head>|<body[ >]/, 1)[0];
    href = DISPLAY_FONT_PRELOAD.exec(head)?.[1];
    if (href || head.length < prefix.length) break;
  }
  return { chunks, done, href };
}

/**
 * The build's Brotli copy of the file at `url`, ready to send (BROTLI_TYPES), or null to serve the
 * file as before: the copy is missing (a page that does not exist, or a build from before t24283)
 * or Pages answered anything but 200 or 304. A page's display font preload cannot be read from
 * Brotli here (Workers decompress only gzip and deflate), so for an HTML GET the page itself is
 * fetched alongside and only its early head read, as withDisplayFontPreload does.
 */
async function brotliCopy(request, url, file, policy) {
  const html = file.type.startsWith('text/html');
  const [res, page] = await Promise.all([
    fetch(pagesRequest(atPages(file.path), request), {
      redirect: 'manual',
      ...(policy && { cf: { cacheTtlByStatus: { '200-299': policy.edge, '300-599': -1 } } }),
    }),
    html && request.method === 'GET' ? fetch(atPages(url.pathname)).catch(() => null) : null,
  ]);
  let href;
  if (page?.ok && page.body && res.status === 200) {
    const reader = page.body.getReader();
    href = (await displayFont(reader)).href;
    reader.cancel().catch(() => {});
  } else {
    page?.body?.cancel().catch(() => {});
  }
  if (res.status !== 200 && res.status !== 304) {
    res.body?.cancel().catch(() => {});
    return null;
  }
  const headers = new Headers(res.headers);
  headers.set('Content-Type', file.type);
  headers.set('Content-Encoding', 'br');
  // Caches keep one copy per encoding; Pages already names Accept-Encoding, withVary adds Accept.
  const vary = (headers.get('Vary') ?? '').split(',').map((t) => t.trim().toLowerCase());
  if (!vary.includes('accept-encoding')) headers.set('Vary', headers.get('Vary') ? `${headers.get('Vary')}, Accept-Encoding` : 'Accept-Encoding');
  if (!vary.includes('accept')) headers.set('Vary', `${headers.get('Vary')}, Accept`);
  if (policy) {
    headers.set('Cache-Control', policy.browser);
    headers.delete('Expires');
  }
  // Without no-transform Cloudflare's edge decodes an HTML response for its zone HTML features
  // (Automatic HTTPS Rewrites, Server-Side Excludes and Replace Insecure JS are on for
  // automancer.uk) and compresses it again at its own level: the probe sent 18,282 B for a
  // 15,362 B copy. Those features change nothing in this site's pages (the live /releases/
  // was byte-identical to the built file without its lock, 22 Nov 2026), so skipping them
  // changes no words. Only these Brotli responses carry it; every other one is compressed as before.
  headers.set('Cache-Control', headers.has('Cache-Control') ? `${headers.get('Cache-Control')}, no-transform` : 'no-transform');
  if (html && res.status === 200) headers.set('Link', pageLinks(url.pathname) + (href ? `, ${fontLink(href)}` : ''));
  const out = new Response(res.status === 304 ? null : res.body, { status: res.status, headers, encodeBody: 'manual' });
  ENCODED.add(out);
  return out;
}

export default {
  async fetch(request) {
    return secured(await respond(request));
  },
};

async function respond(request) {
  const url = new URL(request.url);
  if (ALIASES.has(url.hostname)) return Response.redirect(atOrigin(url.pathname, url.search).toString(), 301);
  if (url.protocol === 'http:') {
    url.protocol = 'https:';
    return Response.redirect(url.toString(), 301);
  }
  const moved = legacyRedirect(url.pathname);
  if (moved) return Response.redirect(atOrigin(moved, url.search).toString(), 301);
  const accept = request.headers.get('Accept') ?? '';
  const isApi = url.pathname.startsWith('/api/');
  const readOnly = request.method === 'GET' || request.method === 'HEAD';

  if (isApi && !readOnly) {
    const res = problem(405, 'Method Not Allowed', 'This API is read-only: only GET and HEAD exist.', url.pathname);
    res.headers.set('Allow', 'GET, HEAD');
    return res;
  }

  if (readOnly && prefers(accept, 'text/markdown', 'text/html')) {
    const twin = twinPath(url.pathname);
    if (twin) {
      const res = await fetch(atPages(twin), { method: request.method });
      if (res.ok) {
        const out = withVary(res);
        out.headers.set('Content-Type', MARKDOWN);
        out.headers.set('Content-Location', twin);
        return out;
      }
    }
  }

  const policy = readOnly ? cachePolicy(url.pathname, url.search) : null;
  // Cloudflare rewrites the Accept-Encoding a Worker sees (a client that sent only `gzip` arrives
  // taking br too) and keeps what the client sent in cf.clientAcceptEncoding. Reading the header
  // alone sent Brotli to gzip-only clients, which Cloudflare then had to decode for them and,
  // under no-transform, could not compress again: 74,290 B for the home page instead of 18,809 B
  // (production, 22 Nov 2026, rolled back within minutes).
  const clientEncoding = request.cf?.clientAcceptEncoding ?? request.headers.get('Accept-Encoding');
  const brotli = readOnly && !request.headers.has('Range') && acceptsBrotli(clientEncoding)
    ? brotliFile(url.pathname)
    : null;
  if (brotli) {
    const copy = await brotliCopy(request, url, brotli, policy);
    if (copy) return copy;
  }
  const res = await fetch(pagesRequest(atPages(url.pathname, url.search), request), {
    redirect: 'manual',
    // Only a found file is kept; a 404 or an error is asked for again next time.
    ...(policy && { cf: { cacheTtlByStatus: { '200-299': policy.edge, '300-599': -1 } } }),
  });

  if (res.status >= 300 && res.status < 400 && res.headers.has('Location')) {
    const back = fromPages(res.headers.get('Location'));
    // Anywhere else means the Pages site is misconfigured (a custom domain put
    // back on it sends every file to automancer.uk, which would loop forever).
    if (!back) return problem(502, 'Upstream error', 'The static host sent this request somewhere else. Try again shortly.', url.pathname);
    const out = withVary(res);
    out.headers.set('Location', back);
    return out;
  }
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
  const html = (out.headers.get('Content-Type') ?? '').startsWith('text/html');
  if (html && res.ok) out.headers.set('Link', pageLinks(url.pathname));
  if (html && out.body) {
    // The page is drawn here, on automancer.uk, and nowhere else (OFFSITE_LOCK).
    const body = unlocked(out.body);
    const open = res.ok && request.method === 'GET'
      ? await withDisplayFontPreload(body, out)
      : new Response(body, out);
    open.headers.delete('Content-Length');
    return open;
  }
  if (url.pathname === '/.well-known/api-catalog') {
    out.headers.set('Content-Type', 'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"');
  }
  return out;
}
