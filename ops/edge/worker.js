// Edge Worker in front of GitHub Pages for automancer.uk (route automancer.uk/*).
//
// GitHub Pages serves fixed files, so it cannot answer per request. This
// Worker adds only what needs that, and only from files the build already
// publishes:
//   - Accept: text/markdown on a page with a Markdown twin gets the twin,
//     with the same Brotli copy and cache validators as the direct .md URL.
//   - A 404 asked for as Markdown gets a Markdown body pointing at the indexes.
//   - Errors under /api/ are RFC 9457 application/problem+json.
//   - /.well-known/api-catalog gets its RFC 9727 media type.
//   - Plain HTTP is redirected to HTTPS, as GitHub Pages did before the proxy.
//   - www.automancer.uk gets one 301 to the same path on automancer.uk.
//   - A legacy *.html URL gets one real 301 to its page.
//   - Every HTML page has the lock the build puts in it for the GitHub Pages
//     copy taken out (OFFSITE_LOCK), so it is drawn only here.
//   - HTML is served as a whole page because that transform changes byte offsets.
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
//   - A page's error report is posted here (ERROR_TUNNEL) and passed on to the
//     one Sentry project, without the visitor's IP address, signed with a key
//     only this Worker holds (errorReport).
//   - Every response names the source this Worker was deployed from
//     (EDGE_SOURCE_HEADER), so a release can prove it is the reviewed file.
//   - A page a browser asks for is served from this data centre's cache at
//     once and fetched again from Pages after each answer, so a visitor never
//     waits for GitHub's cold cache (keptPage, PAGE_CACHE_HEADER; t25774). A
//     copy kept before the newest release seen here is fetched again instead
//     of served (RELEASE_KEY, t26545).
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
// The exact source this Worker runs from, so anyone can tell whether production
// is the reviewed ops/edge/worker.js (t25749). ops/edge/deploy.sh hashes the
// bytes it uploads and binds the result as the plain-text EDGE_SOURCE, so the
// module itself stays byte for byte as committed. Every response names it in
// EDGE_SOURCE_HEADER; the release verifier (check_edge_source) compares it with
// the file at the revision it checks and fails when they differ: a merged
// change nobody deployed, a Worker left running from an unmerged branch or a
// working copy, or one uploaded some other way (no binding, so no header).
export const EDGE_SOURCE_HEADER = 'X-Edge-Source';
const EDGE_SOURCE = /^sha256:[0-9a-f]{64}$/;

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

/** Whether an Accept-Encoding header takes `wanted` (listed without q=0). */
export function acceptsCoding(acceptEncoding, wanted) {
  return (acceptEncoding ?? '').toLowerCase().split(',').some((part) => {
    const [coding, ...params] = part.split(';').map((x) => x.trim());
    const q = params.find((p) => p.startsWith('q='));
    return coding === wanted && (q === undefined || Number(q.slice(2)) > 0);
  });
}

/** Whether an Accept-Encoding header takes Brotli (`br` listed without q=0). */
export const acceptsBrotli = (acceptEncoding) => acceptsCoding(acceptEncoding, 'br');

// The shared compression dictionary (t26098, RFC 9842). Every page repeats the same frame (about
// 46 KB of inlined CSS, the header, the menu and the footer), so the build writes one dictionary
// per release under DICTIONARY_DIR, the home page as served without its <main>, and every page
// names it in a <link rel="compression-dictionary">. Chromium fetches it once while idle, keeps it
// (USE_AS_DICTIONARY), and then asks for a page with `Available-Dictionary: :<its SHA-256>:` and
// `dcz` in Accept-Encoding. The build's `<page>.dcz` is the page compressed with Zstandard against
// the dictionary, and starts with DCZ_MAGIC and the SHA-256 it was made with; the Worker sends it
// only when that is the hash the browser holds, and the Brotli copy otherwise (a dictionary from
// an earlier release, a browser without one). A second page drops from about 17 KB to 5 KB.
// Cloudflare passes `dcz`, Available-Dictionary and the bytes through untouched (probed on
// workers.dev, 24 Nov 2026), but not Dictionary-ID, so the dictionary carries no id.
export const DICTIONARY_DIR = '_dictionary';
export const DICTIONARY_PATH = /^\/_dictionary\/[0-9a-f]{16}\.txt$/;
export const USE_AS_DICTIONARY = 'match="/*", match-dest=("document")';
export const DCZ_MAGIC = [0x5e, 0x2a, 0x4d, 0x18, 0x20, 0x00, 0x00, 0x00];
const DCZ_HEADER_BYTES = DCZ_MAGIC.length + 32;

/** The SHA-256 an Available-Dictionary header names (a structured-field byte sequence), as hex, or null. */
export function availableDictionary(header) {
  const match = /^:([A-Za-z0-9+/]{43}=):$/.exec((header ?? '').trim());
  if (!match) return null;
  return Array.from(atob(match[1]), (c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
}

/** The dictionary hash a `dcz` body starts with, as hex, or null when it does not start with DCZ_MAGIC. */
export function dczDictionary(bytes) {
  if (bytes.length < DCZ_HEADER_BYTES || DCZ_MAGIC.some((b, i) => bytes[i] !== b)) return null;
  return Array.from(bytes.subarray(DCZ_MAGIC.length, DCZ_HEADER_BYTES), (b) => b.toString(16).padStart(2, '0')).join('');
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
  // Named by its content, like /_astro/: a new release names a new file.
  if (DICTIONARY_PATH.test(pathname)) return IMMUTABLE;
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

// Error reports (t24432). src/scripts/sentry.ts posts a page's error report to
// this path on automancer.uk (Sentry's `tunnel` option), and the Worker passes
// it on to the one Sentry project the site reports to. Until then the visitor's
// browser posted it to Sentry itself, so Sentry received their IP address,
// User-Agent, language and Referer with every report, and each page's CSP had
// to let it talk to a third party. Now a page talks only to automancer.uk, and
// Sentry sees Cloudflare's address. The Worker derives a browser family and major
// version at the edge and sends no visitor User-Agent. Reports that ad blockers
// used to stop at Sentry's address now arrive too.
//
// The Worker requires this site's Origin and accepts at most one error per
// request (or an empty verifier diagnostic), with at most 64 KiB read from the body.
// It passes those reports only to SENTRY_INGEST's
// project SENTRY_PROJECT, which ops/verify-production.sh also expects
// (EXPECTED_SENTRY_PROJECT_ID; tests/edge-worker.test.ts holds them equal).
// Anything else is answered here and never leaves.
//
// The key Sentry accepts lives only here (t24883). The DSN in a page's bundle
// names the project but holds no working key: until then it held the project's
// live client key, so anyone could read it from any page and post into the
// error monitor directly, from anywhere, as often as they liked (Sentry answered
// 200), burying real errors and spending the plan's quota. The Worker now signs
// each report with its own key, the Worker secret SENTRY_KEY (never in this
// repository), and Sentry refuses the page's key (403). A report without
// SENTRY_KEY is answered 503 here, never sent with the page's key. Each visitor
// may post ERROR_REPORTS' limit a minute (a ratelimit binding, counted per
// address at the edge and never sent on); past it the SDK is told to wait.
// ops/edge/deploy.sh carries both bindings to every version it uploads.
export const ERROR_TUNNEL = '/_errors';
export const SENTRY_INGEST = 'https://o4511673494732800.ingest.de.sentry.io';
export const SENTRY_PROJECT = '4511769898647632';
// The SDK's reports carry only error type, page and in-app frames (beforeSend in
// src/scripts/sentry.ts): about 1-3 KB. 64 KiB leaves room for a deep stack.
const ERROR_REPORT_MAX_BYTES = 65536;
// What Sentry's answer may tell the SDK: back off (429 with these) or carry on.
const SENTRY_ANSWER_HEADERS = ['Content-Type', 'Retry-After', 'X-Sentry-Rate-Limits'];

const RATE_LIMITED_FOR_SECS = 60;

const ENVELOPE_DSN = `${SENTRY_INGEST}/${SENTRY_PROJECT}`;
const UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const ENCODE = new TextEncoder();
const ERROR_TYPES = new Set([
  'Error', 'AggregateError', 'EvalError', 'RangeError', 'ReferenceError',
  'SyntaxError', 'TypeError', 'URIError',
]);
const EVENT_ID = /^[0-9a-f]{32}$/;
const RELEASE_ID = /^[0-9a-f]{40}$/;
const REPORT_PAGE = /^\/(?:[a-z0-9-]+\/|(?:field-notes|work)\/[a-z0-9-]+\/|404\.html)?$/;
const REPORT_SCRIPT = /^\/(?:assets\/js\/main\.js|_astro\/[\w.-]+\.js)$/;
// Chromium-based and iOS browsers can include other browsers' identifiers.
// Prefer their own product tokens before checking Chrome and Safari.
const BROWSER_PRODUCTS = [
  ['Edge', /(?:^| )Edg(?:A|iOS)?\/([1-9]\d{0,2})(?=[. ]|$)/],
  ['Opera', /(?:^| )OPR\/([1-9]\d{0,2})(?=[. ]|$)/],
  ['Samsung Internet', /(?:^| )SamsungBrowser\/([1-9]\d{0,2})(?=[. ]|$)/],
  ['Firefox', /(?:^| )(?:Firefox|FxiOS)\/([1-9]\d{0,2})(?=[. ]|$)/],
  ['Chrome', /(?:^| )(?:Chrome|CriOS)\/([1-9]\d{0,2})(?=[. ]|$)/],
  ['Chromium', /(?:^| )Chromium\/([1-9]\d{0,2})(?=[. ]|$)/],
  ['Safari', /(?:^| )Version\/([1-9]\d{0,2})(?=[. ]|$).* Safari\/\d/],
];

function browserContext(userAgent) {
  if (!userAgent) return;
  for (const [name, pattern] of BROWSER_PRODUCTS) {
    const version = pattern.exec(userAgent)?.[1];
    if (version) return { browser: { type: 'browser', name, version } };
  }
}

function reportPath(url) {
  if (typeof url !== 'string' || !url.startsWith(ORIGIN + '/')) return;
  const path = url.split(/[?#]/, 1)[0].slice(ORIGIN.length);
  if (path.length <= 160) return path;
}

function reportNumber(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

/** Rebuild the report at the egress boundary, even if browser-side filtering changes. */
function reportEvent(event, eventId, userAgent) {
  if (!Array.isArray(event.exception?.values)) return null;
  const path = reportPath(event.request?.url);
  const page = path && REPORT_PAGE.test(path) ? path : undefined;
  const values = [];
  for (const exception of event.exception.values) {
    if (!exception || typeof exception !== 'object' || Array.isArray(exception)) continue;
    const frames = [];
    if (Array.isArray(exception.stacktrace?.frames)) {
      for (const frame of exception.stacktrace.frames) {
        const file = reportPath(frame?.filename);
        if (!file || (file !== page && !REPORT_SCRIPT.test(file))) continue;
        const lineno = reportNumber(frame.lineno);
        const colno = reportNumber(frame.colno);
        if (lineno === undefined && colno === undefined) continue;
        frames.push({ filename: ORIGIN + file, lineno, colno, in_app: true });
      }
    }
    const mechanism = exception.mechanism;
    values.push({
      type: ERROR_TYPES.has(exception.type) ? exception.type : 'Error',
      value: 'Browser script error',
      mechanism: mechanism && typeof mechanism === 'object' ? {
        type: 'generic',
        handled: typeof mechanism.handled === 'boolean' ? mechanism.handled : undefined,
        exception_id: reportNumber(mechanism.exception_id),
        parent_id: reportNumber(mechanism.parent_id),
        is_exception_group: typeof mechanism.is_exception_group === 'boolean' ? mechanism.is_exception_group : undefined,
      } : undefined,
      stacktrace: { frames },
    });
  }
  if (!values.some(({ stacktrace }) => stacktrace.frames.length > 0)) return null;
  return {
    event_id: eventId,
    timestamp: Number.isFinite(event.timestamp) ? event.timestamp : undefined,
    platform: 'javascript',
    environment: 'production',
    release: typeof event.release === 'string' && RELEASE_ID.test(event.release) ? event.release : undefined,
    request: page ? { url: ORIGIN + page } : undefined,
    contexts: browserContext(userAgent),
    exception: { values },
  };
}

function envelopeObject(bytes) {
  try {
    const value = JSON.parse(UTF8.decode(bytes));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/** Read one browser exception or the verifier's empty diagnostic. */
function errorEnvelope(bytes, userAgent) {
  const headerEnd = bytes.indexOf(10);
  if (headerEnd === -1) return null;
  const header = envelopeObject(bytes.subarray(0, headerEnd));
  if (typeof header?.dsn !== 'string') return null;
  let dsn;
  try {
    dsn = new URL(header.dsn);
  } catch {
    return null;
  }
  if (dsn.origin !== SENTRY_INGEST || dsn.pathname !== `/${SENTRY_PROJECT}` || !dsn.username) return null;

  const itemEnd = bytes.indexOf(10, headerEnd + 1);
  if (itemEnd === -1) return null;
  const item = envelopeObject(bytes.subarray(headerEnd + 1, itemEnd));
  if (item?.type !== 'event' && item?.type !== 'client_report') return null;
  const start = itemEnd + 1;
  let end = bytes.length;
  if (item.length === undefined) {
    const newline = bytes.indexOf(10, start);
    if (newline !== -1 && newline !== end - 1) return null;
    if (newline !== -1) end = newline;
  } else {
    if (!Number.isSafeInteger(item.length) || item.length <= 0 || item.length > end - start) return null;
    const boundary = start + item.length;
    if (boundary !== end && (boundary !== end - 1 || bytes[boundary] !== 10)) return null;
    end = boundary;
  }

  let payload = envelopeObject(bytes.subarray(start, end));
  if (!payload) return null;
  const eventId = [payload.event_id, header.event_id].find((id) => typeof id === 'string' && EVENT_ID.test(id));
  if (item.type === 'event') {
    payload = reportEvent(payload, eventId, userAgent);
    if (!payload) return null;
  } else if (!Number.isFinite(payload.timestamp) || !Array.isArray(payload.discarded_events)
    || payload.discarded_events.length !== 0 || Object.keys(payload).length !== 2) {
    return null;
  }
  const encoded = ENCODE.encode(JSON.stringify(payload));
  if (encoded.length > ERROR_REPORT_MAX_BYTES) return null;
  return { eventId, type: item.type, payload: encoded };
}

/** Sign the scrubbed item using the Worker's own key. */
function signedEnvelope({ eventId, type, payload }, key) {
  const dsn = new URL(ENVELOPE_DSN);
  dsn.username = key;
  const envelopeHeader = { event_id: eventId, dsn: dsn.toString() };
  const item = { type, length: payload.length };
  const headers = ENCODE.encode(`${JSON.stringify(envelopeHeader)}\n${JSON.stringify(item)}\n`);
  const out = new Uint8Array(headers.length + payload.length);
  out.set(headers);
  out.set(payload, headers.length);
  return out;
}

/** Null if the declared or streamed body is too large. Keep at most 64 KiB of it. */
async function readErrorReport(request) {
  if (!request.body) return new Uint8Array(0);
  if (Number(request.headers.get('Content-Length')) > ERROR_REPORT_MAX_BYTES) {
    request.body.cancel().catch(() => {});
    return null;
  }
  const buffer = new Uint8Array(ERROR_REPORT_MAX_BYTES);
  const reader = request.body.getReader();
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return buffer.subarray(0, size);
      if (size + value.byteLength > buffer.byteLength) {
        reader.cancel().catch(() => {});
        return null;
      }
      buffer.set(value, size);
      size += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
}

/** Pass a page's error report on to Sentry, signed with the Worker's key, or answer why it was refused (ERROR_TUNNEL). */
async function errorReport(request, env) {
  if (request.method !== 'POST') {
    const res = problem(405, 'Method Not Allowed', 'Error reports are posted here by this site’s pages.', ERROR_TUNNEL);
    res.headers.set('Allow', 'POST');
    return res;
  }
  // A browser names the page's origin on every POST; another site's page names its own.
  if (request.headers.get('Origin') !== ORIGIN) {
    return problem(403, 'Forbidden', 'Only pages on automancer.uk post error reports here.', ERROR_TUNNEL);
  }
  if (env?.ERROR_REPORTS) {
    const { success } = await env.ERROR_REPORTS.limit({ key: request.headers.get('CF-Connecting-IP') ?? '' });
    if (!success) {
      const res = problem(429, 'Too Many Requests', 'Too many error reports from one visitor. The report was not kept.', ERROR_TUNNEL);
      res.headers.set('Retry-After', String(RATE_LIMITED_FOR_SECS));
      // The Sentry SDK stops sending every kind of report for this long.
      res.headers.set('X-Sentry-Rate-Limits', `${RATE_LIMITED_FOR_SECS}::organization`);
      return res;
    }
  }
  let body;
  try {
    body = await readErrorReport(request);
  } catch {
    return problem(400, 'Bad Request', 'The error report upload did not complete.', ERROR_TUNNEL);
  }
  if (!body) {
    return problem(413, 'Content Too Large', `An error report is at most ${ERROR_REPORT_MAX_BYTES} bytes.`, ERROR_TUNNEL);
  }
  const envelope = errorEnvelope(body, request.headers.get('User-Agent'));
  if (!envelope) {
    return problem(400, 'Bad Request', 'An upload must contain one error report for this site’s Sentry project.', ERROR_TUNNEL);
  }
  if (!env?.SENTRY_KEY) {
    return problem(503, 'Service Unavailable', 'Error reporting is not set up on this edge. The report was not kept.', ERROR_TUNNEL);
  }
  const headers = new Headers({
    'Content-Type': 'application/x-sentry-envelope', Origin: ORIGIN, 'User-Agent': 'automancer-site-edge',
  });
  let sentry;
  try {
    sentry = await fetch(`${SENTRY_INGEST}/api/${SENTRY_PROJECT}/envelope/`, {
      method: 'POST', headers, redirect: 'manual', body: signedEnvelope(envelope, env.SENTRY_KEY),
    });
  } catch {
    return problem(502, 'Upstream error', 'The error monitor could not be reached. The report was not kept.', ERROR_TUNNEL);
  }
  if (sentry.status >= 300 && sentry.status < 400) {
    sentry.body?.cancel().catch(() => {});
    return problem(502, 'Upstream error', 'The error monitor redirected the report. The report was not kept.', ERROR_TUNNEL);
  }
  const answer = new Headers({ 'Cache-Control': 'no-store' });
  for (const name of SENTRY_ANSWER_HEADERS) {
    const value = sentry.headers.get(name);
    if (value !== null) answer.set(name, value);
  }
  return new Response(sentry.body, { status: sentry.status, headers: answer });
}

/** The same `pathname` and `search` on the Pages project the files are fetched from. */
export function atPages(pathname, search = '') {
  const out = new URL(`https://${PAGES_HOST}`);
  out.pathname = PAGES_PATH + pathname;
  out.search = search;
  return out;
}

// The only request headers that change what GitHub Pages answers: validators
// for a 304 and ranges for a 206 on files served byte-for-byte. Pages serves the same file to everyone, so
// it is sent nothing else of the visitor's (t23955). Copying the visitor's
// request, as the Worker did until then, gave GitHub their IP address
// (CF-Connecting-IP, X-Forwarded-For), every cookie a browser holds for
// automancer.uk (including any an estate app scopes to the whole domain),
// the full Referer (on a click between pages, the page and its query, such
// as ?service=), Accept-Language and User-Agent, on every page view.
const CACHE_VALIDATORS = ['If-None-Match', 'If-Modified-Since'];
const PAGES_REQUEST_HEADERS = [...CACHE_VALIDATORS, 'Range', 'If-Range'];

/** The request sent to the Pages project for a visitor's request: its method and PAGES_REQUEST_HEADERS only. */
export function pagesRequest(url, request, names = PAGES_REQUEST_HEADERS) {
  const headers = new Headers();
  for (const name of names) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  return new Request(url, { method: request.method, headers });
}

const isHtml = (response) => (response.headers.get('Content-Type') ?? '').startsWith('text/html');

async function fetchPageFile(url, request, policy) {
  const file = atPages(url.pathname, url.search);
  const options = {
    redirect: 'manual',
    // Only a found file is kept; a 404 or an error is asked for again next time.
    ...(policy && { cf: { cacheTtlByStatus: { '200-299': policy.edge, '300-599': -1 } } }),
  };
  // Byte offsets into the Pages copy are wrong after the HTML lock is removed.
  const pagePath = url.pathname.endsWith('/') || url.pathname.endsWith('.html');
  const headers = pagePath ? CACHE_VALIDATORS : PAGES_REQUEST_HEADERS;
  const response = await fetch(pagesRequest(file, request, headers), options);
  // Pages also resolves spellings such as /index%2ehtml.
  if (!pagePath && (response.status === 206 || response.status === 416) && isHtml(response)) {
    response.body?.cancel().catch(() => {});
    return fetch(pagesRequest(file, request, CACHE_VALIDATORS), options);
  }
  return response;
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
 * The build's Brotli copy of the file at `pathname` (or, with `coding` dcz, its copy compressed
 * against the dictionary, file.path naming it), ready to send (BROTLI_TYPES), or null to serve the
 * file as before: the copy is missing (a page that does not exist, or a build from before t24283)
 * or Pages answered anything but 200 or 304. A page's display font preload cannot be read from
 * Brotli here (Workers decompress only gzip and deflate), so for an HTML GET the page itself is
 * fetched alongside and only its early head read, as withDisplayFontPreload does.
 */
async function brotliCopy(request, pathname, file, policy, coding = 'br') {
  const html = file.type.startsWith('text/html');
  const [res, page] = await Promise.all([
    fetch(pagesRequest(atPages(file.path), request), {
      redirect: 'manual',
      ...(policy && { cf: { cacheTtlByStatus: { '200-299': policy.edge, '300-599': -1 } } }),
    }),
    html && request.method === 'GET' ? fetch(atPages(pathname)).catch(() => null) : null,
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
  headers.set('Content-Encoding', coding);
  if (html) headers.set('Accept-Ranges', 'none');
  // Caches keep one copy per encoding; Pages already names Accept-Encoding, withVary adds Accept.
  const vary = (headers.get('Vary') ?? '').split(',').map((t) => t.trim().toLowerCase());
  if (!vary.includes('accept-encoding')) headers.set('Vary', headers.get('Vary') ? `${headers.get('Vary')}, Accept-Encoding` : 'Accept-Encoding');
  if (!vary.includes('accept')) headers.set('Vary', `${headers.get('Vary')}, Accept`);
  // A dictionary-compressed copy is only for a browser holding that dictionary (RFC 9842 section 6.2).
  if (coding === 'dcz') headers.set('Vary', `${headers.get('Vary')}, Available-Dictionary`);
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
  if (html && res.status === 200) headers.set('Link', pageLinks(pathname) + (href ? `, ${fontLink(href)}` : ''));
  const out = new Response(res.status === 304 ? null : res.body, { status: res.status, headers, encodeBody: 'manual' });
  ENCODED.add(out);
  return out;
}

/**
 * The page's copy compressed against the release's dictionary (`<page>.dcz`, made by the build
 * beside its `.br`), with the hash of the dictionary it was made with, read from its first bytes
 * and kept in the body. Null when Pages has no such copy or it is not a `dcz` body.
 */
async function dictionaryCopy(request, pathname, file, policy) {
  const copy = await brotliCopy(request, pathname, { path: file.path.replace(/\.br$/, '.dcz'), type: file.type }, policy, 'dcz');
  if (!copy?.body || copy.status !== 200) {
    copy?.body?.cancel().catch(() => {});
    return null;
  }
  const reader = copy.body.getReader();
  const chunks = [];
  let size = 0;
  while (size < DCZ_HEADER_BYTES) {
    const next = await reader.read();
    if (next.done) break;
    chunks.push(next.value);
    size += next.value.length;
  }
  const head = new Uint8Array(size);
  chunks.reduce((at, chunk) => (head.set(chunk, at), at + chunk.length), 0);
  const dictionary = dczDictionary(head);
  if (!dictionary) {
    reader.cancel().catch(() => {});
    return null;
  }
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(head);
    },
    async pull(controller) {
      const next = await reader.read();
      if (next.done) controller.close();
      else controller.enqueue(next.value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
  const response = new Response(body, { status: 200, headers: copy.headers, encodeBody: 'manual' });
  ENCODED.add(response);
  return { dictionary, response };
}

// Pages kept at the edge (t25774). GitHub Pages' own cache (Fastly) keeps a file
// ten minutes at most and, for a site as quiet as this one, mostly not at all:
// asked for a page minutes after the Worker last fetched it, it answered MISS
// and went back to GitHub. Cloudflare kept nothing either, since a page carries
// no edge lifetime (cachePolicy). So a visitor's first page waited for GitHub
// before its first byte: a median of 169 ms after TLS from London and 182 ms
// from Vienna across the 32 sitemap pages, up to 540 ms, where a copy already at
// the edge answers in 20-60 ms (ops/perf/edge-wait.sh, docs/PERFORMANCE.md).
//
// So a page asked for as Brotli by GET is kept in this data centre's cache (the
// Workers Cache API) and served from it at once. Every time one is served, the
// Worker fetches the page from Pages again once the visitor has their answer
// (ctx.waitUntil) and keeps that copy instead. A copy kept longer than
// PAGE_CACHE_SECONDS is never served, and a hard reload (`Cache-Control:
// no-cache`) waits for Pages, as every request did before. Only pages are kept:
// Markdown twins, the API and the feeds are read by machines, and the build
// reads /api/pages.json from production (src/integrations/page-dates.ts), so
// those always come from Pages. Each answer says which way it came in
// PAGE_CACHE_HEADER: hit, miss (fetched and kept), reload or release (below).
//
// Kept copies and releases (t26545). That refresh alone left a page as it was
// until someone viewed it, so after a release a quiet page kept its old words
// for days: on 25 Nov 2026 all 32 pages read from Vienna were copies from up to
// six releases before, /privacy/ among them, while the twins and the API (never
// kept) were already new. GitHub Pages dates every file of a release with the
// same Last-Modified, the moment the release was published, and a kept copy
// carries the page's own headers. So the Worker keeps the newest release it has
// fetched a page from in this data centre (RELEASE_KEY), and a kept copy
// dated before it is not served: the page is fetched from Pages and waited for,
// as on a miss (`release`). The first view at a data centre after a release can
// still get the copy kept before it, and teaches the Worker the new release;
// every page viewed there after that is the new release's.
export const PAGE_CACHE_HEADER = 'X-Edge-Cache';
export const PAGE_CACHE_SECONDS = 7 * 24 * 60 * 60;
// The address a page is kept under. No visitor's request reaches the cache under
// it: the Worker answers every request on the route before any cache does.
const PAGE_CACHE_PATH = '/.edge-cache/page';
// What the kept copy holds besides the Brotli bytes: the page's own headers, and when it was kept.
const KEPT_HEADERS = 'X-Edge-Page-Headers';
const KEPT_AT = 'X-Edge-Kept-At';
const KEPT_DICTIONARY = 'X-Edge-Kept-Dictionary';
// The newest release this data centre has fetched a page from, as Pages dated it (milliseconds).
const RELEASE_KEY = '/.edge-cache/release';
const KEPT_RELEASE = 'X-Edge-Release';
// Per-response headers that are not true of a copy served later.
const NOT_KEPT = new Set(['date', 'age', 'expires']);

/**
 * The cache key a page is kept under, by path alone: Pages serves a page whatever the query. Its
 * copy compressed against the compression dictionary is kept apart (`coding` dcz).
 */
export const pageCacheKey = (pathname, coding = 'br') =>
  new Request(atOrigin(`${PAGE_CACHE_PATH}${coding === 'br' ? '' : `-${coding}`}${pathname}`));

/** Whether an If-None-Match header names `etag` (weak comparison, RFC 9110 13.1.2). */
export function namesTag(ifNoneMatch, etag) {
  if (!ifNoneMatch || !etag) return false;
  const strip = (tag) => tag.trim().replace(/^W\//, '');
  return ifNoneMatch.split(',').some((tag) => tag.trim() === '*' || strip(tag) === strip(etag));
}

/**
 * The page at `pathname` for a browser that takes Brotli, from this data centre's cache when it
 * holds one (PAGE_CACHE_HEADER), or null to serve the file as before. Without the Cache API or a
 * context to finish work in (ops/edge/local.mjs, the tests), it is brotliCopy() unchanged, or the
 * dictionary copy when the browser holds the dictionary it was made with.
 *
 * `dictionary` is the hash of the compression dictionary the browser holds (availableDictionary),
 * or null. Its copy of the page is kept beside the Brotli one, with the hash it was made with: a
 * kept copy for that hash is served at once. Otherwise a kept Brotli copy is served at once and
 * the dictionary copy kept for next time, since waiting for GitHub (a median 160 ms from London)
 * costs more than the 12 KB the dictionary saves on most connections. With neither kept, the page
 * is fetched once either way, so the dictionary copy is fetched first and sent when it matches.
 */
async function keptPage(request, pathname, file, policy, ctx, dictionary = null) {
  const cache = globalThis.caches?.default;
  if (!cache || typeof ctx?.waitUntil !== 'function') {
    const copy = dictionary ? await dictionaryCopy(request, pathname, file, policy) : null;
    if (copy?.dictionary === dictionary) return copy.response;
    copy?.response.body?.cancel().catch(() => {});
    return brotliCopy(request, pathname, file, policy);
  }
  const key = pageCacheKey(pathname);
  const dczKey = pageCacheKey(pathname, 'dcz');
  const reload = /no-cache/i.test(`${request.headers.get('Cache-Control') ?? ''},${request.headers.get('Pragma') ?? ''}`);
  // Read alongside the first copy, so a hit waits for one cache read as before.
  const [release, firstKept] = await Promise.all([
    reload ? 0 : knownRelease(cache),
    reload ? null : cache.match(dictionary ? dczKey : key).catch(() => null),
  ]);
  // Teach this data centre the release of a page just fetched from Pages, when it is newer.
  const learn = (headers) => noteRelease(cache, headers, release);
  const keepDcz = () => ctx.waitUntil(keepDictionaryPage(cache, dczKey, pathname, file, policy, learn).catch(() => {}));
  // A kept copy is served only while no newer release has been seen here.
  let behind = false;
  const usable = (kept) => {
    const headers = kept && keptHeaders(kept);
    if (!headers || !kept.body) return null;
    if (releaseOf(headers) < release) {
      behind = true;
      return null;
    }
    return headers;
  };
  if (dictionary && firstKept) {
    const headers = usable(firstKept);
    if (headers && firstKept.headers.get(KEPT_DICTIONARY) === dictionary) {
      keepDcz();
      return pageAnswer(request, headers, firstKept.body, 'hit');
    }
    firstKept.body?.cancel().catch(() => {});
  }
  const kept = reload ? null : dictionary ? await cache.match(key).catch(() => null) : firstKept;
  if (kept) {
    const headers = usable(kept);
    if (headers) {
      ctx.waitUntil(keepPage(cache, key, pathname, file, policy, learn).catch(() => {}));
      if (dictionary) keepDcz();
      return pageAnswer(request, headers, kept.body, 'hit');
    }
    kept.body?.cancel().catch(() => {});
  }
  const state = reload ? 'reload' : behind ? 'release' : 'miss';
  if (dictionary) {
    const copy = await dictionaryCopy(new Request(atOrigin(pathname)), pathname, file, policy);
    if (copy) {
      const [visitor, keep] = copy.response.body.tee();
      ctx.waitUntil(putPage(cache, dczKey, copy.response.headers, keep, copy.dictionary).catch(() => {}));
      ctx.waitUntil(learn(copy.response.headers).catch(() => {}));
      if (copy.dictionary === dictionary) return pageAnswer(request, [...copy.response.headers], visitor, state);
      visitor.cancel().catch(() => {});
    }
  }
  const fresh = await brotliCopy(new Request(atOrigin(pathname)), pathname, file, policy);
  if (!fresh?.body || fresh.status !== 200) {
    fresh?.body?.cancel().catch(() => {});
    ctx.waitUntil(cache.delete(key).catch(() => {}));
    return null;
  }
  const [visitor, keep] = fresh.body.tee();
  ctx.waitUntil(putPage(cache, key, fresh.headers, keep).catch(() => {}));
  ctx.waitUntil(learn(fresh.headers).catch(() => {}));
  return pageAnswer(request, [...fresh.headers], visitor, state);
}

/** When Pages published the release a page's headers come from (its Last-Modified, ms), or NaN. */
function releaseOf(headers) {
  const list = Array.isArray(headers) ? headers : [...headers];
  const found = list.find(([name]) => name.toLowerCase() === 'last-modified');
  return found ? Date.parse(found[1]) : NaN;
}

/** The newest release this data centre has fetched a page from (RELEASE_KEY), or 0 when none is kept. */
async function knownRelease(cache) {
  const kept = await cache.match(new Request(atOrigin(RELEASE_KEY))).catch(() => null);
  kept?.body?.cancel().catch(() => {});
  const at = Number(kept?.headers.get(KEPT_RELEASE));
  return Number.isFinite(at) && at > 0 ? at : 0;
}

/** Keep the release `headers` were published in as this data centre's newest, when it is newer than `known`. */
function noteRelease(cache, headers, known) {
  const at = releaseOf(headers);
  if (!(at > known)) return Promise.resolve();
  return cache.put(new Request(atOrigin(RELEASE_KEY)), new Response('', {
    headers: { 'Cache-Control': `max-age=${PAGE_CACHE_SECONDS}`, [KEPT_RELEASE]: String(at) },
  }));
}

/** The page's own headers from a kept copy, or null when the copy is too old or unreadable. */
function keptHeaders(kept) {
  const at = Number(kept.headers.get(KEPT_AT));
  if (!(Date.now() - at < PAGE_CACHE_SECONDS * 1000)) return null;
  try {
    const headers = JSON.parse(kept.headers.get(KEPT_HEADERS) ?? '');
    return Array.isArray(headers) ? headers : null;
  } catch {
    return null;
  }
}

/** Fetch the page from Pages again and keep it; a page Pages no longer has is dropped. */
async function keepPage(cache, key, pathname, file, policy, learn) {
  const fresh = await brotliCopy(new Request(atOrigin(pathname)), pathname, file, policy);
  if (!fresh?.body || fresh.status !== 200) {
    fresh?.body?.cancel().catch(() => {});
    return cache.delete(key);
  }
  await learn(fresh.headers);
  return putPage(cache, key, fresh.headers, fresh.body);
}

/** Fetch the page's dictionary copy from Pages again and keep it with its hash; drop it when Pages has none. */
async function keepDictionaryPage(cache, key, pathname, file, policy, learn) {
  const copy = await dictionaryCopy(new Request(atOrigin(pathname)), pathname, file, policy);
  if (!copy) return cache.delete(key);
  await learn(copy.response.headers);
  return putPage(cache, key, copy.response.headers, copy.response.body, copy.dictionary);
}

// Kept as plain bytes with no Content-Encoding, as Pages serves the .br file, so the cache hands
// back exactly the bytes it was given; the page's headers ride along and are restored on the way
// out, and a dictionary copy carries the hash of the dictionary it was made with.
function putPage(cache, key, headers, body, dictionary = null) {
  const own = [...headers].filter(([name]) => !NOT_KEPT.has(name.toLowerCase()));
  return cache.put(key, new Response(body, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Cache-Control': `max-age=${PAGE_CACHE_SECONDS}`,
      [KEPT_HEADERS]: JSON.stringify(own),
      [KEPT_AT]: String(Date.now()),
      ...(dictionary && { [KEPT_DICTIONARY]: dictionary }),
    },
  }));
}

/** A page's Brotli bytes as the visitor's request needs them: 200, or 304 when they hold this copy. */
function pageAnswer(request, headerList, body, state) {
  const headers = new Headers(headerList);
  for (const name of NOT_KEPT) headers.delete(name);
  headers.set('Date', new Date().toUTCString());
  headers.set(PAGE_CACHE_HEADER, state);
  let status = 200;
  if (namesTag(request.headers.get('If-None-Match'), headers.get('ETag'))) {
    body.cancel().catch(() => {});
    body = null;
    status = 304;
    headers.delete('Content-Length');
  }
  const out = new Response(body, { status, headers, encodeBody: 'manual' });
  ENCODED.add(out);
  return out;
}

export default {
  async fetch(request, env, ctx) {
    const out = secured(await respond(request, env, ctx));
    if (EDGE_SOURCE.test(env?.EDGE_SOURCE ?? '')) out.headers.set(EDGE_SOURCE_HEADER, env.EDGE_SOURCE);
    return out;
  },
};

/** `response`, marked for the browser to keep as the compression dictionary when it is one (DICTIONARY_PATH). */
function asDictionary(pathname, response) {
  if (DICTIONARY_PATH.test(pathname) && response.status === 200) response.headers.set('Use-As-Dictionary', USE_AS_DICTIONARY);
  return response;
}

async function respond(request, env, ctx) {
  const url = new URL(request.url);
  if (ALIASES.has(url.hostname)) return Response.redirect(atOrigin(url.pathname, url.search).toString(), 301);
  if (url.protocol === 'http:') {
    url.protocol = 'https:';
    return Response.redirect(url.toString(), 301);
  }
  if (url.pathname === ERROR_TUNNEL) return errorReport(request, env);
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

  // Cloudflare rewrites the Accept-Encoding a Worker sees (a client that sent only `gzip` arrives
  // taking br too) and keeps what the client sent in cf.clientAcceptEncoding. Reading the header
  // alone sent Brotli to gzip-only clients, which Cloudflare then had to decode for them and,
  // under no-transform, could not compress again: 74,290 B for the home page instead of 18,809 B
  // (production, 22 Nov 2026, rolled back within minutes).
  const clientEncoding = request.cf?.clientAcceptEncoding ?? request.headers.get('Accept-Encoding');
  const useBrotli = readOnly && !request.headers.has('Range') && acceptsBrotli(clientEncoding);

  const twin = readOnly && prefers(accept, 'text/markdown', 'text/html') ? twinPath(url.pathname) : null;
  if (twin) {
    const file = useBrotli ? brotliFile(twin) : null;
    const copy = file ? await brotliCopy(request, twin, file, null) : null;
    if (copy) {
      copy.headers.set('Content-Location', twin);
      copy.headers.set('Accept-Ranges', 'none');
      return copy;
    }
    // Negotiation serves the whole twin. Revalidate against the twin itself, without asking
    // Pages for a byte range in its choice of content coding.
    const res = await fetch(pagesRequest(atPages(twin), request, CACHE_VALIDATORS));
    if (res.ok || res.status === 304) {
      const out = withVary(res);
      out.headers.set('Content-Type', MARKDOWN);
      out.headers.set('Content-Location', twin);
      out.headers.set('Accept-Ranges', 'none');
      return out;
    }
    res.body?.cancel().catch(() => {});
  }

  const policy = readOnly ? cachePolicy(url.pathname, url.search) : null;
  const brotli = useBrotli ? brotliFile(url.pathname) : null;
  if (brotli) {
    const page = request.method === 'GET' && brotli.type.startsWith('text/html');
    const dictionary = page && acceptsCoding(clientEncoding, 'dcz') ? availableDictionary(request.headers.get('Available-Dictionary')) : null;
    const copy = page ? await keptPage(request, url.pathname, brotli, policy, ctx, dictionary) : await brotliCopy(request, url.pathname, brotli, policy);
    if (copy) return asDictionary(url.pathname, copy);
  }
  const res = await fetchPageFile(url, request, policy);

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
  if (isHtml(out)) {
    out.headers.set('Accept-Ranges', 'none');
    out.headers.delete('Content-Length');
    if (res.ok) out.headers.set('Link', pageLinks(url.pathname));
    if (!out.body) return out;
    // The page is drawn here, on automancer.uk, and nowhere else (OFFSITE_LOCK).
    const body = unlocked(out.body);
    return res.ok && request.method === 'GET'
      ? await withDisplayFontPreload(body, out)
      : new Response(body, out);
  }
  if (url.pathname === '/.well-known/api-catalog') {
    out.headers.set('Content-Type', 'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"');
  }
  return asDictionary(url.pathname, out);
}
