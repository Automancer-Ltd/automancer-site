// Tell search engines which pages a release changed, the moment it is live (IndexNow, t26811).
//
// Google finds a changed page by crawling it again; the IndexNow engines (Bing, and through Bing's
// index ChatGPT search, Copilot and DuckDuckGo, plus Yandex, Seznam, Naver and Yep, which share every
// submission with each other) are told instead. Without this a new field note waited for a crawler
// to come back on its own. The protocol is https://www.indexnow.org/documentation: the site
// proves it owns the host by serving `/<key>.txt` holding the key (src/pages/[indexnowKey].txt.ts),
// and posts the URLs that were added, updated or deleted. The key is public by design; it only
// shows that whoever submits URLs for automancer.uk can also publish files there.
//
// Two steps, because only the build can see the release before it is live:
//   --plan   (deploy.yml build job, before the deploy) compares the build's page index with the one
//            production serves now, page by page on its words (`contentSha256`, the same hash that
//            dates pages, src/integrations/page-dates.ts): new, changed and removed pages are the
//            release's changes. When production does not yet serve the key (the first release that
//            announces, or a new key), or cannot be read, every page in the sitemap is announced.
//            Writes `urls=<JSON array>` to $GITHUB_OUTPUT.
//   --submit (deploy.yml journey job, once production serves the release) checks that production
//            serves the key file, then posts the planned URLs (INDEXNOW_URLS, a JSON array).
//
// usage, from the repository root:
//   node ops/indexnow.mjs --plan --dist=dist [--from=https://automancer.uk]
//   INDEXNOW_URLS='["https://automancer.uk/"]' node ops/indexnow.mjs --submit [--from=https://automancer.uk] [--dry-run]
//
// A release is never held back by a search engine: if the engine is busy (429), down (5xx) or
// unreachable, --submit warns and exits 0. It exits 1 when the engine refuses the request itself
// (400, 403 key not valid, 422 URL not on the host): those are this site's faults.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const HOST = 'automancer.uk';
export const SITE = `https://${HOST}`;
// 8 to 128 of a-z, A-Z, 0-9 and '-' (the protocol). Changing it re-announces every page once.
export const INDEXNOW_KEY = '66b4dcf893fce47c732bb1db048576ff';
export const KEY_PATH = `/${INDEXNOW_KEY}.txt`;
// The shared endpoint: one submission reaches every participating engine.
export const ENDPOINT = 'https://api.indexnow.org/indexnow';
// One post takes at most 10,000 URLs.
const MAX_URLS = 10_000;
const TIMEOUT_MS = 20_000;

/** The page URLs a built sitemap lists, in its order. */
export function sitemapUrls(dist) {
  const urls = [];
  for (const name of fs.readdirSync(dist).filter((n) => /^sitemap-\d+\.xml$/.test(n)).sort()) {
    const xml = fs.readFileSync(path.join(dist, name), 'utf8');
    for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) urls.push(m[1]);
  }
  return urls;
}

/** url -> contentSha256 from a page index body ({ pages: [...] }). */
export function wordHashes(index) {
  const out = new Map();
  for (const page of index?.pages ?? []) {
    if (typeof page?.url === 'string' && typeof page?.contentSha256 === 'string') out.set(page.url, page.contentSha256);
  }
  return out;
}

/**
 * The URLs a release announces. `sitemap` is the build's page URLs, `built` and `served` its and
 * production's url -> words hash (served null when production could not be read), `keyServed`
 * whether production already serves the key. Pure.
 */
export function plan({ sitemap, built, served, keyServed }) {
  if (!served || !keyServed) {
    return { reason: served ? 'production does not serve the key yet' : 'production could not be read', urls: [...sitemap] };
  }
  const listed = new Set(sitemap);
  const urls = [];
  for (const url of sitemap) {
    const hash = built.get(url);
    // A sitemap page with no published hash cannot be compared; it is announced with every page.
    if (hash !== undefined && served.get(url) !== hash) urls.push(url);
  }
  // A page production lists that this release no longer builds was deleted: engines drop it.
  for (const url of served.keys()) if (!listed.has(url) && !built.has(url)) urls.push(url);
  return { reason: 'pages whose words changed, were added or were removed', urls };
}

async function get(url, fetchImpl) {
  const res = await fetchImpl(url, { cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) });
  return { status: res.status, body: await res.text() };
}

/** Whether `from` serves the key file holding exactly the key. */
export async function keyServedAt(from, fetchImpl = fetch) {
  try {
    const { status, body } = await get(`${from}${KEY_PATH}?for=indexnow`, fetchImpl);
    return status === 200 && body.trim() === INDEXNOW_KEY;
  } catch {
    return false;
  }
}

/** --plan: the URLs this build's release changes, compared with what `from` serves now. */
export async function planRelease({ dist, from = SITE, fetchImpl = fetch, log = console.log }) {
  const index = JSON.parse(fs.readFileSync(path.join(dist, 'api', 'pages.json'), 'utf8'));
  if (fs.readFileSync(path.join(dist, KEY_PATH.slice(1)), 'utf8').trim() !== INDEXNOW_KEY) {
    throw new Error(`indexnow: dist${KEY_PATH} does not hold the key`);
  }
  let served = null;
  try {
    const { status, body } = await get(`${from}/api/pages.json?for=indexnow`, fetchImpl);
    if (status !== 200) throw new Error(`HTTP ${status}`);
    served = wordHashes(JSON.parse(body));
    if (served.size === 0) throw new Error('no page hashes');
  } catch (error) {
    log(`indexnow: could not read ${from}/api/pages.json (${String(error)})`);
    served = null;
  }
  const keyServed = served ? await keyServedAt(from, fetchImpl) : false;
  const result = plan({ sitemap: sitemapUrls(dist), built: wordHashes(index), served, keyServed });
  log(`indexnow: ${result.urls.length} URL(s) to announce (${result.reason})`);
  for (const url of result.urls) log(`  ${url}`);
  return result;
}

/**
 * --submit: post `urls` once `from` serves the key. Returns { ok, status, message }; ok is false
 * only for a refusal that is this site's fault.
 */
export async function submit({ urls, from = SITE, endpoint = ENDPOINT, fetchImpl = fetch, dryRun = false }) {
  if (urls.length === 0) return { ok: true, status: null, message: 'nothing to announce: no page changed' };
  const foreign = urls.filter((u) => new URL(u).host !== HOST);
  if (foreign.length) return { ok: false, status: null, message: `not on ${HOST}: ${foreign.join(', ')}` };
  if (!(await keyServedAt(from, fetchImpl))) {
    return { ok: false, status: null, message: `${from}${KEY_PATH} does not answer 200 with the key; engines would refuse it (403)` };
  }
  const body = { host: HOST, key: INDEXNOW_KEY, keyLocation: `${SITE}${KEY_PATH}`, urlList: urls.slice(0, MAX_URLS) };
  if (dryRun) return { ok: true, status: null, message: `dry run: would post ${body.urlList.length} URL(s) to ${endpoint}` };
  let res;
  try {
    res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    return { ok: true, warn: true, status: null, message: `${endpoint} unreachable (${String(error)}); not announced` };
  }
  const detail = (await res.text()).slice(0, 300).replace(/\s+/g, ' ').trim();
  const posted = `${body.urlList.length} URL(s)`;
  if (res.status === 200) return { ok: true, status: 200, message: `${posted} announced` };
  if (res.status === 202) return { ok: true, status: 202, message: `${posted} received; the engine is still checking the key` };
  if (res.status === 429 || res.status >= 500) {
    return { ok: true, warn: true, status: res.status, message: `${endpoint} answered ${res.status}; not announced ${detail}` };
  }
  return { ok: false, status: res.status, message: `${endpoint} refused the request with ${res.status} ${detail}` };
}

function arg(name) {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : true;
}

async function main() {
  const from = (arg('from') || SITE).replace(/\/$/, '');
  if (arg('plan')) {
    const { urls } = await planRelease({ dist: arg('dist') || 'dist', from });
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `urls=${JSON.stringify(urls)}\n`);
    return 0;
  }
  if (arg('submit')) {
    const urls = JSON.parse(process.env.INDEXNOW_URLS || '[]');
    if (!Array.isArray(urls) || urls.some((u) => typeof u !== 'string')) throw new Error('INDEXNOW_URLS must be a JSON array of URLs');
    const result = await submit({ urls, from, dryRun: Boolean(arg('dry-run')) });
    const line = `indexnow: ${result.message}`;
    console.log(result.warn ? `::warning::${line}` : result.ok ? line : `::error::${line}`);
    for (const url of urls) console.log(`  ${url}`);
    return result.ok ? 0 : 1;
  }
  console.error('usage: node ops/indexnow.mjs --plan --dist=dist | --submit [--dry-run]');
  return 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(`::error::${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  );
}
