// The first uncaught error on a page, on a throttled phone: how long until its report leaves,
// and what the visitor downloads for it. src/scripts/sentry.ts fetches the Sentry SDK chunk only
// then, so this is the whole cost of the error path. Each round is a fresh browser context with an
// empty cache. CDP throttles the network (latency per request, download and upload throughput) and
// the CPU (4x, Lighthouse's phone). Report delivery is intercepted and answered locally, so nothing
// reaches Sentry; the synthetic error carries no visitor data.
// usage, from the repository root (needs `pnpm exec playwright install chromium`):
//   node ops/perf/first-error.mjs <page-url> <label> [rounds=7] [rttMs=150] [kbps=1600]
// Defaults are Lighthouse's "Slow 4G" phone profile. Prints a JSON summary of medians and writes
// per-round results to <label>.json in the current directory. docs/PERFORMANCE.md records the
// numbers it produced.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const [url, label, roundsArg, rttArg, kbpsArg] = process.argv.slice(2);
if (!url || !label) throw new Error('usage: first-error.mjs <page-url> <label> [rounds] [rttMs] [kbps]');
const rounds = Number(roundsArg ?? 7);
const rtt = Number(rttArg ?? 150);
const kbps = Number(kbpsArg ?? 1600);

const median = (xs) => {
  const s = xs.filter((x) => x != null).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};

const browser = await chromium.launch();
const results = [];
for (let i = 0; i < rounds; i++) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  let reported;
  const delivered = new Promise((resolve) => { reported = resolve; });
  // Production's ingest host or the tests' dummy destination (tests/support/build-env.ts).
  await page.route(/https:\/\/(?:[^/]*sentry\.io|example\.invalid)\//, async (route) => {
    reported(Date.now());
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: rtt, downloadThroughput: (kbps * 1024) / 8, uploadThroughput: (750 * 1024) / 8,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(1000);
  const before = await page.evaluate(() => performance.getEntriesByType('resource').length);
  const thrown = Date.now();
  await page.evaluate(() => {
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('first-error probe') }));
  });
  const at = await Promise.race([delivered, page.waitForTimeout(30000).then(() => null)]);
  const fetched = await page.evaluate((n) => performance.getEntriesByType('resource').slice(n)
    .filter((e) => new URL(e.name).pathname.endsWith('.js'))
    .map((e) => ({ name: new URL(e.name).pathname, bytes: e.transferSize, decoded: e.decodedBodySize, ms: Math.round(e.duration) })), before);
  results.push({
    reportMs: at && at - thrown,
    wireBytes: fetched.reduce((a, e) => a + e.bytes, 0),
    decodedBytes: fetched.reduce((a, e) => a + e.decoded, 0),
    fetched,
  });
  await context.close();
}
await browser.close();
fs.writeFileSync(`${label}.json`, JSON.stringify({ url, rtt, kbps, cpu: 4, results }, null, 2));
const keys = ['reportMs', 'wireBytes', 'decodedBytes'];
console.log(JSON.stringify({ label, url, rounds, rtt, kbps, median: Object.fromEntries(keys.map((k) => [k, median(results.map((x) => x[k]))])) }));
