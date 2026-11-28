// What a new visitor's browser waits for after the page itself (t28262): every file the page
// loads from automancer.uk (logo, page-load module, fonts, the compression dictionary it takes
// while idle), each with how long the server took to start answering, who answered it and the
// Content-Encoding it came in. Each round is a fresh Chromium context (nothing cached in the
// browser), with no throttling, so the wait is the real network's.
//   cf-cache-status HIT      kept at this Cloudflare data centre
//   cf-cache-status DYNAMIC  not kept at the edge: fetched from GitHub Pages (x-cache says
//                            whether GitHub's own cache, which keeps a file ten minutes at most,
//                            still had it)
// usage, from the repository root (needs `pnpm exec playwright install chromium`):
//   node ops/perf/asset-wait.mjs <page-url> <label> [rounds=1]
// One round right after another warms GitHub's cache, so to see what a visitor arriving after a
// quiet spell waits for, run one round, or space rounds more than ten minutes apart.
// Prints a JSON summary and writes per-file results to <label>.json in the current directory.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const [url, label, roundsArg] = process.argv.slice(2);
if (!url || !label) throw new Error('usage: asset-wait.mjs <page-url> <label> [rounds]');
const rounds = Number(roundsArg ?? 1);
const origin = new URL(url).origin;

const browser = await chromium.launch();
const files = [];
for (let i = 0; i < rounds; i++) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const answered = new Map();
  page.on('response', async (res) => {
    if (!res.url().startsWith(origin) || res.request().resourceType() === 'document') return;
    const h = await res.allHeaders();
    answered.set(res.url(), {
      status: res.status(),
      edge: h['cf-cache-status'] ?? null,
      github: h['x-cache'] ?? null,
      colo: (h['cf-ray'] ?? '').split('-')[1] ?? null,
      encoding: h['content-encoding'] ?? null,
    });
  });
  await page.goto(url, { waitUntil: 'load' });
  // The dictionary is fetched while the browser is idle, after load.
  await page.waitForLoadState('networkidle');
  const timing = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => ({
    url: e.name,
    wait: Math.round(e.responseStart - e.requestStart),
    end: Math.round(e.responseEnd),
    bytes: e.transferSize,
  })));
  for (const t of timing) {
    if (!t.url.startsWith(origin)) continue;
    files.push({ round: i + 1, path: new URL(t.url).pathname, ...t, url: undefined, ...answered.get(t.url) });
  }
  await context.close();
}
await browser.close();
fs.writeFileSync(`${label}.json`, JSON.stringify(files, null, 2));
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};
const byEdge = {};
for (const f of files) (byEdge[f.edge ?? 'none'] ??= []).push(f.wait);
console.log(JSON.stringify({
  label,
  url,
  files: files.map(({ round, path, wait, end, edge, github, colo, encoding }) => ({ round, path, wait, end, edge, github, colo, encoding })),
  medianWaitByEdge: Object.fromEntries(Object.entries(byEdge).map(([k, v]) => [k, { files: v.length, medianWaitMs: median(v) }])),
}, null, 2));
