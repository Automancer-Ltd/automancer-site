#!/usr/bin/env node
/**
 * automancer-site preview target — the non-production serving path.
 *
 * Two subcommands, one module so the test suite can import the same code the
 * target runs:
 *
 *   node ops/preview/preview.mjs serve     # the preview HTTP server (systemd)
 *   node ops/preview/preview.mjs mark DIR  # stamp a published release as preview
 *
 * WHY THIS EXISTS
 * `automancer.uk` is served by GitHub Pages from `main`, and this repository
 * cannot host a second Pages site: any Pages deployment replaces production.
 * The rollback runbook in docs/DEPLOYMENT.md therefore had nowhere safe to be
 * rehearsed. This target is that place: a separate origin, serving a published
 * release of a branch, that can never be the public site.
 *
 * WHAT MAKES IT SAFE (structural, not procedural)
 *  1. `serve` refuses to bind 80/443 and always answers with
 *     `X-Robots-Tag: noindex, nofollow, noarchive` and `Cache-Control: no-store`.
 *  2. `serve` only serves a root that `mark` has stamped (`.preview-target`).
 *     Pointed at anything else — a production `dist/`, the pin, a stale
 *     directory — it serves a placeholder instead of a site, so a mistyped
 *     PREVIEW_ROOT cannot put a real site on this origin.
 *  3. The release HTML carries its own visible "PREVIEW TARGET" banner and a
 *     `<meta name="robots" content="noindex, nofollow">`, so a page reached by
 *     accident still says what it is. The stamp also records the ref and the
 *     exact revision the release was built from.
 *  4. Nothing here writes to GitHub, Pages, or any other estate host; the only
 *     state it owns is the release directory it was told to serve.
 *
 * The served revision is published twice, deliberately: in the homepage proof
 * strip (built by the site itself from `git rev-parse --short HEAD`) and in the
 * `.preview-target` stamp. `deploy-preview.sh` reads both back over HTTP after
 * a release is published; the runbook's verification step
 * (`ops/verify-production.sh --preview --expected-revision … <url>`) reads the
 * proof strip, exactly as it does against automancer.uk.
 */
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Marker file written by `mark`; its absence makes a root unservable. */
export const STAMP_FILE = '.preview-target';
/** HTML marker comment inserted once, so `mark` is idempotent. */
export const BANNER_ID = 'preview-target-banner';
const BANNER_MARK = `<!-- ${BANNER_ID} -->`;
const ROBOTS_MARK = '<!-- preview-target-noindex -->';

const TYPES = {
  '.avif': 'image/avif',
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/vnd.microsoft.icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8',
};

const escapeHtml = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

// ---------------------------------------------------------------------------
// mark
// ---------------------------------------------------------------------------

/**
 * Insert the preview banner and the noindex meta into one HTML document.
 * Idempotent: a document already carrying either marker is returned unchanged.
 * Exported for tests.
 */
export function markHtml(html, stamp) {
  let out = html;
  if (!out.includes(BANNER_MARK)) {
    const banner =
      `${BANNER_MARK}<div id="${BANNER_ID}" role="note" style="` +
      'margin:0;padding:.6rem .9rem;background:#3b1d00;color:#ffd7a8;' +
      'font:600 14px/1.4 ui-sans-serif,system-ui,sans-serif;text-align:center">' +
      `PREVIEW TARGET — non-production. Not automancer.uk. ` +
      `Ref <code>${escapeHtml(stamp.ref)}</code>, revision <code>${escapeHtml(stamp.short)}</code>.` +
      '</div>';
    out = out.replace(/<body([^>]*)>/i, (m, attrs) => `<body${attrs}>${banner}`);
    if (!out.includes(BANNER_ID)) {
      // No <body> at all (a redirect stub or a fragment): prefix instead.
      out = `${banner}${out}`;
    }
  }
  if (!out.includes(ROBOTS_MARK)) {
    const meta =
      `${ROBOTS_MARK}<meta name="robots" content="noindex, nofollow, noarchive">`;
    out = /<head([^>]*)>/i.test(out)
      ? out.replace(/<head([^>]*)>/i, (m, attrs) => `<head${attrs}>${meta}`)
      : `${meta}${out}`;
  }
  return out;
}

/** Every `*.html` under `dir`, depth-first. Exported for tests. */
export async function htmlFiles(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await htmlFiles(path)));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      found.push(path);
    }
  }
  return found;
}

/**
 * Stamp a published release directory as this preview target's release.
 * Writes `.preview-target` (the marker `serve` requires) after rewriting HTML.
 */
export async function markRelease(dir, { ref, sha, url = '', builtAt = '' }) {
  const root = resolve(dir);
  const short = sha.slice(0, 7);
  const stamp = {
    target: 'automancer-site-preview',
    ref,
    sha,
    short,
    url,
    builtAt,
    markedAt: new Date().toISOString(),
    markedBy: 'ops/preview/preview.mjs mark',
  };
  const files = await htmlFiles(root);
  if (files.length === 0) {
    throw new Error(`no *.html under ${root} — not a built release`);
  }
  let changed = 0;
  for (const file of files) {
    const before = await readFile(file, 'utf8');
    const after = markHtml(before, stamp);
    if (after !== before) {
      await writeFile(file, after);
      changed += 1;
    }
  }
  await writeFile(join(root, STAMP_FILE), `${JSON.stringify(stamp, null, 2)}\n`);
  return { ...stamp, htmlFiles: files.length, changed };
}

// ---------------------------------------------------------------------------
// serve
// ---------------------------------------------------------------------------

const banner = (title, detail) => `<!DOCTYPE html><html lang="en-GB"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow, noarchive"><title>${escapeHtml(title)}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#08080a;color:#e8e8ee;font:16px/1.6 ui-sans-serif,system-ui,sans-serif}
main{max-width:44rem;padding:2rem}h1{font-size:1.4rem;margin:0 0 .5rem}p{margin:.4rem 0;color:#b9b9c6}code{color:#ffd7a8}</style>
</head><body><main><h1>${escapeHtml(title)}</h1><p>${detail}</p>
<p>This is a non-production preview target. The public site at <code>automancer.uk</code> is served by
GitHub Pages from <code>main</code> and is untouched by anything here.</p></main></body></html>`;

const placeholderBody = (stamp) =>
  stamp
    ? `No release is published yet. Last marked release: <code>${escapeHtml(stamp.short)}</code> (<code>${escapeHtml(stamp.ref)}</code>).`
    : 'No release is published yet. The root this target was pointed at is not a marked preview release, so it is not served.';

export function readPort(value, fallback) {
  const port = value === undefined || value === '' ? fallback : Number(value);
  // 0 is allowed and means "any free port", which tests use; every other
  // privileged or public port is refused, so the preview target can never sit
  // where a real site is expected.
  if (port === 443 || port === 80) {
    throw new Error('refusing to serve the preview target on a public web port');
  }
  if (!Number.isInteger(port) || port < 0 || port > 65535 || (port > 0 && port < 1024)) {
    throw new Error(`preview port must be 0 or an integer in 1024..65535 (got ${value})`);
  }
  return port;
}

/**
 * Resolve a request path against `root`. Never escapes root.
 *
 * Returns one of:
 *   { kind: 'file', file }                  — serve it
 *   { kind: 'redirect', location }          — GitHub Pages' trailing-slash hop
 *   null                                    — no such page (caller serves 404)
 * Exported so the behaviour can be driven directly in tests.
 */
export async function resolveRequest(root, rawUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(rawUrl, 'http://preview.invalid').pathname);
  } catch {
    return null;
  }
  if (pathname.includes('\0')) return null;
  const rel = normalize(pathname).replace(/^([.]{2}[/\\])+/, '').replace(/^[/\\]+/, '');
  const target = join(root, rel);
  if (target !== root && !target.startsWith(root + sep)) return null;
  let info;
  try {
    info = await stat(target);
  } catch {
    return null;
  }
  if (info.isDirectory()) {
    // A directory URL without its trailing slash gets the same 301 GitHub
    // Pages issues, so a rehearsal exercises the hop production has.
    if (!pathname.endsWith('/')) return { kind: 'redirect', location: `${pathname}/` };
    const index = join(target, 'index.html');
    try {
      const indexInfo = await stat(index);
      if (indexInfo.isFile()) return { kind: 'file', file: index };
    } catch {
      /* fall through to the 404 body */
    }
    return null;
  }
  if (!info.isFile()) return null;
  return { kind: 'file', file: target };
}

const headers = (stamp, extra = {}) => ({
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Cache-Control': 'no-store, max-age=0',
  'X-Preview-Target': stamp ? `${stamp.ref}@${stamp.short}` : 'placeholder',
  ...extra,
});

async function loadStamp(root) {
  try {
    const stamp = JSON.parse(await readFile(join(root, STAMP_FILE), 'utf8'));
    return stamp && stamp.target === 'automancer-site-preview' ? stamp : null;
  } catch {
    return null;
  }
}

/**
 * Start the preview target. Resolves (with the http.Server) once listening.
 * Exported so tests can drive the real server on an ephemeral port.
 */
export async function startServer({ root, host = '127.0.0.1', port = 4174, silent = false } = {}) {
  const rootDir = resolve(root);
  const stamp = await loadStamp(rootDir);
  const log = silent ? () => {} : (...args) => console.log(...args);
  if (!stamp) {
    log(
      `preview target: ${rootDir} has no ${STAMP_FILE} marker — serving the placeholder, not a site`,
    );
  } else {
    log(`preview target: serving ${stamp.ref}@${stamp.short} from ${rootDir}`);
  }

  const server = createServer(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, headers(stamp, { Allow: 'GET, HEAD' }));
      res.end();
      return;
    }
    const url = new URL(req.url ?? '/', 'http://preview.invalid');
    if (!stamp) {
      const body = banner('automancer-site preview target', placeholderBody(null));
      res.writeHead(url.pathname === '/' ? 200 : 404, headers(null, {
        'Content-Type': TYPES['.html'],
        'Content-Length': Buffer.byteLength(body),
      }));
      res.end(req.method === 'HEAD' ? undefined : body);
      return;
    }
    const hit = await resolveRequest(rootDir, req.url ?? '/');
    if (hit?.kind === 'redirect') {
      res.writeHead(301, headers(stamp, { Location: hit.location }));
      res.end();
      return;
    }
    if (!hit) {
      let body;
      try {
        body = await readFile(join(rootDir, '404.html'));
      } catch {
        body = banner('404 — not found', 'No such page in this preview release.');
      }
      res.writeHead(404, headers(stamp, {
        'Content-Type': TYPES['.html'],
        'Content-Length': Buffer.byteLength(body),
      }));
      res.end(req.method === 'HEAD' ? undefined : body);
      return;
    }
    res.writeHead(200, headers(stamp, {
      'Content-Type': TYPES[extname(hit.file).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': (await stat(hit.file)).size,
    }));
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    createReadStream(hit.file).pipe(res);
  });

  await new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(readPort(String(port), 4174), host, ok);
  });
  return server;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main(argv) {
  const [command, ...rest] = argv;
  if (command === 'mark') {
    const dir = rest[0];
    const flag = (name, fallback = '') => {
      const i = rest.indexOf(`--${name}`);
      return i === -1 ? fallback : (rest[i + 1] ?? '');
    };
    const sha = flag('sha');
    const ref = flag('ref');
    if (!dir || !/^[0-9a-f]{40}$/.test(sha) || !ref) {
      console.error(
        'usage: preview.mjs mark <release-dir> --ref <ref> --sha <40-hex-sha> [--url <url>] [--built-at <iso>]',
      );
      return 64;
    }
    const stamp = await markRelease(dir, {
      ref,
      sha,
      url: flag('url'),
      builtAt: flag('built-at'),
    });
    console.log(
      `marked ${stamp.htmlFiles} html file(s) (${stamp.changed} rewritten) at ${resolve(dir)} as ${stamp.ref}@${stamp.short}`,
    );
    return 0;
  }
  if (command === 'serve') {
    const root = process.env.PREVIEW_ROOT ?? '/opt/automancer/srv/automancer-site-preview/current';
    const host = process.env.PREVIEW_HOST ?? '127.0.0.1';
    const port = readPort(process.env.PREVIEW_PORT, 4174);
    await startServer({ root, host, port });
    console.log(`preview target listening on http://${host}:${port} (root ${resolve(root)})`);
    return 0;
  }
  console.error('usage: preview.mjs <serve|mark>');
  return 64;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}

export { main };
