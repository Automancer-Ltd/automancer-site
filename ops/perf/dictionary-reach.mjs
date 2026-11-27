// Whether a Chromium visitor's later pages really arrive compressed against the shared dictionary
// (t27582). Each round is a fresh browser context: it opens the first path, waits until the
// dictionary that page names has been fetched and stored, then opens each later path in turn and
// records how the page came (Content-Encoding: dcz or br), the edge Worker's X-Edge-Cache, and the
// bytes on the wire (CDP encodedDataLength, headers included). Pass paths no one has asked for
// since the last release to see what a visitor gets on a page's first view after a release.
// usage, from the repository root (needs `pnpm exec playwright install chromium`):
//   node ops/perf/dictionary-reach.mjs <base-url> <label> [paths=/,/services/,/work/,/about/,/contact/] [rounds=1]
// Prints a JSON summary and writes per-round results to <label>.json in the current directory.
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const [base = 'https://automancer.uk', label = 'reach', pathList = '/,/services/,/work/,/about/,/contact/', roundsArg = '1'] =
  process.argv.slice(2);
const paths = pathList.split(',');
const rounds = Number(roundsArg);
const browser = await chromium.launch();
const results = [];
for (let round = 0; round < rounds; round += 1) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  const wire = new Map();
  const urls = new Map();
  cdp.on('Network.requestWillBeSent', (e) => urls.set(e.requestId, e.request.url));
  cdp.on('Network.loadingFinished', (e) => wire.set(urls.get(e.requestId), e.encodedDataLength));
  const views = [];
  for (const [i, path] of paths.entries()) {
    const url = new URL(path, base).href;
    const stored = i === 0 ? page.waitForResponse((r) => r.url().includes('/_dictionary/'), { timeout: 15_000 }) : null;
    const res = await page.goto(url, { waitUntil: 'load' });
    if (stored) await (await stored).finished();
    // Chromium stores the dictionary a moment after it arrives.
    await page.waitForTimeout(i === 0 ? 1000 : 300);
    const headers = await res.allHeaders();
    const sent = await res.request().allHeaders();
    views.push({
      path,
      status: res.status(),
      offered: Boolean(sent['available-dictionary']),
      coding: headers['content-encoding'] ?? null,
      edge: headers['x-edge-cache'] ?? null,
      bytes: wire.get(url) ?? null,
    });
  }
  results.push(views);
  await context.close();
}
await browser.close();
writeFileSync(`${label}.json`, JSON.stringify(results, null, 2));
const later = results.flatMap((views) => views.slice(1));
const summary = {
  label,
  base,
  views: later.length,
  dcz: later.filter((v) => v.coding === 'dcz').length,
  offered: later.filter((v) => v.offered).length,
  laterPageBytes: later.reduce((sum, v) => sum + (v.bytes ?? 0), 0),
  rounds: results.map((views) => views.map((v) => `${v.path} ${v.coding}/${v.edge} ${v.bytes} B`)),
};
console.log(JSON.stringify(summary, null, 2));
