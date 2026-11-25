// Keep the files earlier releases' pages load, so a page kept from one of them still works (t26531).
//
// The edge Worker keeps each page in a data centre for up to 7 days and serves that copy first
// (keptPage, PAGE_CACHE_SECONDS in ops/edge/worker.js), so on a quiet page the first view after a
// release can be a page from several releases ago. A browser's own copy of a page, a tab left open
// and a lazily loaded chunk can be just as old. Those pages name the files their own build made:
// the page-load module and its Sentry chunk under /_astro/ (content-hashed) and the compression
// dictionary under /_dictionary/. Each release's Pages artifact holds only its own build, so those
// names answered 404 and the old page ran with no script at all: no menu dismissal, contents bar,
// reveals, prefetch or error reports (seen live on 25 Nov 2026: 4 of 10 pages were kept copies
// from 24-25 Nov whose script and dictionary were gone).
//
// The deploy now carries those files forward. Every release publishes a ledger, LEDGER_PATH, of
// every file it holds under /_astro/ and /_dictionary/ and when each one stopped being built. The
// next deploy reads production's ledger, downloads each file its own build no longer makes and
// that stopped being built less than KEEP_DAYS ago, with its Brotli copy, and adds them to dist/
// beside its own. A file is never overwritten, and its bytes are production's own (the Brotli copy
// must decode to them). Without a ledger (the first release with one, or an unreadable ledger)
// it reads the files production's pages and their scripts name instead.
//
// usage, from the repository root:
//   node ops/carry-forward.mjs --dist=dist [--from=https://automancer.uk]   # deploy.yml, after the audit
//   node ops/carry-forward.mjs --check [--from=https://automancer.uk]      # every listed file answers
//
// Carrying never stops a release: if production cannot be read the build ships with nothing
// carried and says so. --check exits 1 when a file the ledger lists does not answer 200.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import zlib from 'node:zlib';

export const LEDGER_PATH = '/_carried.json';
// Kept pages are served for 7 days after they were fetched (PAGE_CACHE_SECONDS); a page fetched
// just before a release names files that stop being built at that release. One more day covers
// a browser's own copy and clock differences.
export const KEEP_DAYS = 8;
const DAY_MS = 24 * 60 * 60 * 1000;
// The directories whose file names change with their bytes, so an old page names an old file.
const CARRIED_DIRS = ['_astro', '_dictionary'];
const CARRIED_FILE = /^\/(?:_astro\/[\w.-]+|_dictionary\/[0-9a-f]{16}\.txt)$/;
// What a page or a script names: a root-relative path, or a chunk import relative to /_astro/.
const NAMED = /\/(?:_astro\/[\w.-]+?\.(?:js|css|woff2)|_dictionary\/[0-9a-f]{16}\.txt)\b/g;
const CHUNK_IMPORT = /["'`]\.\/([\w.-]+?\.js)["'`]/g;

/** Every file the build holds under CARRIED_DIRS, as served paths, without Brotli copies. */
export function builtFiles(dist) {
  const out = [];
  for (const dir of CARRIED_DIRS) {
    const full = path.join(dist, dir);
    if (!fs.existsSync(full)) continue;
    for (const name of fs.readdirSync(full)) {
      if (name.endsWith('.br')) continue;
      if (fs.statSync(path.join(full, name)).isFile()) out.push(`/${dir}/${name}`);
    }
  }
  return out.sort();
}

/**
 * Which of production's files this release carries: those its own build lacks and that stopped
 * being built less than KEEP_DAYS before `now`. A file production still builds stops being built
 * now. `served` is production's ledger entries.
 */
export function toCarry(served, built, now) {
  const own = new Set(built);
  const out = [];
  for (const entry of served) {
    if (!CARRIED_FILE.test(entry.path) || own.has(entry.path)) continue;
    const retired = entry.retired ?? new Date(now).toISOString();
    const at = Date.parse(retired);
    if (!Number.isFinite(at) || now - at >= KEEP_DAYS * DAY_MS) continue;
    out.push({ path: entry.path, retired });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** The ledger a release publishes: its own files (retired null) and the ones it carries. */
export function ledger(built, carried) {
  const files = [
    ...built.map((p) => ({ path: p, retired: null })),
    ...carried.map(({ path: p, retired }) => ({ path: p, retired })),
  ].sort((a, b) => a.path.localeCompare(b.path));
  return {
    about:
      'Files under /_astro/ and /_dictionary/ this release serves. retired is when a build stopped making the file; '
      + `it is carried forward for ${KEEP_DAYS} days after that, so a page an edge cache or browser kept from an earlier release still loads them.`,
    keepDays: KEEP_DAYS,
    files,
  };
}

async function get(from, urlPath, fetcher) {
  const res = await fetcher(new URL(urlPath, from), { headers: { 'Accept-Encoding': 'identity', Accept: '*/*' }, redirect: 'manual' });
  if (res.status !== 200) {
    await res.body?.cancel().catch(() => {});
    return null;
  }
  return Buffer.from(await res.arrayBuffer());
}

/** Production's ledger entries, or null when it publishes none that reads. */
async function servedLedger(from, fetcher) {
  const body = await get(from, `${LEDGER_PATH}?for=${Date.now()}`, fetcher);
  if (!body) return null;
  try {
    const files = JSON.parse(body.toString('utf8')).files;
    return Array.isArray(files) && files.every((f) => typeof f?.path === 'string') ? files : null;
  } catch {
    return null;
  }
}

/** Without a ledger: the files production's pages name, and the chunks those scripts import. */
async function servedNames(from, fetcher) {
  const index = await get(from, `/api/pages.json?for=${Date.now()}`, fetcher);
  if (!index) return null;
  const pages = JSON.parse(index.toString('utf8')).pages.map((page) => new URL(page.url).pathname);
  const names = new Set();
  for (const page of [...pages, '/404.html']) {
    const html = await get(from, page, fetcher);
    for (const [name] of html?.toString('utf8').matchAll(NAMED) ?? []) names.add(name);
  }
  const scripts = [...names].filter((name) => name.endsWith('.js'));
  for (const script of scripts) {
    const code = (await get(from, script, fetcher))?.toString('utf8') ?? '';
    for (const [, chunk] of code.matchAll(CHUNK_IMPORT)) {
      const name = `/_astro/${chunk}`;
      if (!names.has(name)) {
        names.add(name);
        scripts.push(name);
      }
    }
  }
  return [...names].map((name) => ({ path: name, retired: null }));
}

/**
 * Add to `dist` the files production serves that its pages may still name, and write the ledger.
 * Returns what it did; never throws for production being unreadable.
 */
export async function carryForward({ dist, from, now = Date.now(), fetcher = fetch, log = console.log }) {
  const built = builtFiles(dist);
  let served = null;
  let source = 'ledger';
  try {
    served = await servedLedger(from, fetcher);
    if (!served) {
      source = 'pages';
      served = await servedNames(from, fetcher);
    }
  } catch (error) {
    log(`carry-forward: WARNING could not read ${from}: ${error?.message ?? error}`);
    served = null;
  }
  if (!served) log(`carry-forward: WARNING ${from} published neither ${LEDGER_PATH} nor its pages; nothing carried`);

  const carried = [];
  const missing = [];
  for (const entry of served ? toCarry(served, built, now) : []) {
    const target = path.join(dist, entry.path);
    if (fs.existsSync(target)) continue;
    const bytes = await get(from, entry.path, fetcher).catch(() => null);
    if (!bytes) {
      missing.push(entry.path);
      continue;
    }
    const brotli = await get(from, `${entry.path}.br`, fetcher).catch(() => null);
    let copy = null;
    try {
      if (brotli && zlib.brotliDecompressSync(brotli).equals(bytes)) copy = brotli;
    } catch {
      copy = null;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes, { flag: 'wx' });
    if (copy) fs.writeFileSync(`${target}.br`, copy, { flag: 'wx' });
    carried.push({ ...entry, bytes: bytes.length, brotli: copy?.length ?? null });
  }

  const doc = `${JSON.stringify(ledger(built, carried), null, 2)}\n`;
  const out = path.join(dist, LEDGER_PATH);
  fs.writeFileSync(out, doc);
  fs.writeFileSync(`${out}.br`, zlib.brotliCompressSync(Buffer.from(doc), {
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: zlib.constants.BROTLI_MAX_QUALITY },
  }));

  for (const file of carried) log(`carry-forward: ${file.path} (${file.bytes} B, Brotli ${file.brotli ?? 'none'}), retired ${file.retired}`);
  for (const file of missing) log(`carry-forward: WARNING ${file} is in production's list but did not answer 200; not carried`);
  log(`carry-forward: ${built.length} files built, ${carried.length} carried from ${from} (read from its ${source === 'ledger' ? 'ledger' : 'pages'})`);
  return { built, carried, missing, source: served ? source : null };
}

/** Every file production's ledger lists answers 200. Returns the paths that do not. */
export async function checkCarried({ from, fetcher = fetch }) {
  const served = await servedLedger(from, fetcher);
  if (!served) throw new Error(`${from}${LEDGER_PATH} is missing or unreadable`);
  const failed = [];
  for (const entry of served) {
    const res = await fetcher(new URL(entry.path, from), { method: 'HEAD' });
    if (res.status !== 200) failed.push(`${entry.path} ${res.status}`);
  }
  return { files: served.length, carried: served.filter((f) => f.retired).length, failed };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const flag = (name, fallback) => {
    const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
    if (!hit) return fallback;
    return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : true;
  };
  const from = flag('from', 'https://automancer.uk');
  if (flag('check', false)) {
    const { files, carried, failed } = await checkCarried({ from });
    for (const line of failed) console.log(`carry-forward: FAIL ${line}`);
    console.log(`carry-forward: ${files - failed.length} of ${files} listed files answer 200 (${carried} carried from earlier releases)`);
    process.exit(failed.length ? 1 : 0);
  }
  await carryForward({ dist: flag('dist', 'dist'), from });
}
