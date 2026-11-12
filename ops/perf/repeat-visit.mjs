// Repeat visit after the browser's cached copies have gone stale: what a returning visitor waits for.
// Each round is its own browser context (its own HTTP cache). Visit 1 fills the cache; after
// <wait> seconds a second visit opens the page in a new tab of the same context, and the probe
// reads first paint and, for every subresource, whether it came from the browser cache (no
// request), was revalidated (a 304 round trip) or was downloaded again.
// usage, from the repository root (needs `pnpm exec playwright install chromium`):
//   node ops/perf/repeat-visit.mjs https://automancer.uk/ <label> [rounds=5] [wait=660] [rttMs=0]
// rttMs > 0 adds that much latency per request through CDP (a phone on mobile data is ~150 ms).
// Prints a JSON summary and writes per-round results to <label>.json in the current directory.
// docs/PERFORMANCE.md records the numbers it produced.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const [url, label, roundsArg, waitArg, rttArg] = process.argv.slice(2);
if (!url || !label) throw new Error('usage: repeat-visit.mjs <url> <label> [rounds] [waitSeconds] [rttMs]');
const rounds = Number(roundsArg ?? 5);
const wait = Number(waitArg ?? 660);
const rtt = Number(rttArg ?? 0);

const probe = () =>
  new Promise((done) => {
    const finish = () =>
      setTimeout(() => {
        const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null;
        const nav = performance.getEntriesByType('navigation')[0];
        const res = performance.getEntriesByType('resource').map((r) => ({
          name: new URL(r.name).pathname,
          // transferSize 0: served from the browser cache with no request at all.
          how: r.transferSize === 0 ? 'cache' : r.encodedBodySize > 0 && r.transferSize < r.encodedBodySize ? 'revalidated' : 'downloaded',
          ms: Math.round(r.duration),
        }));
        done({ fcp: fcp && Math.round(fcp), ttfb: Math.round(nav.responseStart), load: Math.round(nav.loadEventEnd), res });
      }, 300);
    if (document.readyState === 'complete') finish();
    else addEventListener('load', finish, { once: true });
  });

const browser = await chromium.launch();
const contexts = [];
for (let i = 0; i < rounds; i++) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'load' });
  await page.close();
  contexts.push(ctx);
}
console.error(`cache filled in ${rounds} contexts; waiting ${wait}s for it to go stale`);
await new Promise((r) => setTimeout(r, wait * 1000));

const results = [];
for (const ctx of contexts) {
  const page = await ctx.newPage();
  if (rtt > 0) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: rtt, downloadThroughput: -1, uploadThroughput: -1 });
  }
  await page.goto(url, { waitUntil: 'load' });
  results.push(await page.evaluate(probe));
  await ctx.close();
}
await browser.close();

const median = (xs) => { const s = xs.filter((x) => x != null).sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const count = (how) => median(results.map((r) => r.res.filter((x) => x.how === how).length));
const summary = {
  label, url, rounds, waitSeconds: wait, rttMs: rtt, at: new Date().toISOString(),
  medianFcpMs: median(results.map((r) => r.fcp)),
  medianTtfbMs: median(results.map((r) => r.ttfb)),
  medianLoadMs: median(results.map((r) => r.load)),
  subresources: { fromCache: count('cache'), revalidated: count('revalidated'), downloaded: count('downloaded') },
};
fs.writeFileSync(`${label}.json`, JSON.stringify({ summary, results }, null, 2));
console.log(JSON.stringify(summary, null, 2));
