// First visit with an empty cache on a throttled phone connection: what a new visitor waits for.
// Each round is a fresh browser context. CDP throttles the network (latency per request,
// download and upload throughput) and the probe reads first paint, largest paint, when the
// last web font arrived, layout shift, and every request the page made with its bytes on the wire.
// usage, from the repository root (needs `pnpm exec playwright install chromium`):
//   node ops/perf/cold-visit.mjs <url> <label> [rounds=7] [rttMs=150] [kbps=1600]
// Defaults are Lighthouse's "Slow 4G" phone profile. Prints a JSON summary of medians and writes
// per-round results to <label>.json in the current directory. docs/PERFORMANCE.md records the
// numbers it produced.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const [url, label, roundsArg, rttArg, kbpsArg] = process.argv.slice(2);
if (!url || !label) throw new Error('usage: cold-visit.mjs <url> <label> [rounds] [rttMs] [kbps]');
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
  await page.addInitScript(() => {
    window.__lcp = 0;
    window.__cls = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: rtt, downloadThroughput: (kbps * 1024) / 8, uploadThroughput: (750 * 1024) / 8,
  });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const res = performance.getEntriesByType('resource').map((e) => ({
      name: new URL(e.name).pathname, start: Math.round(e.startTime), end: Math.round(e.responseEnd), bytes: e.transferSize,
    }));
    return {
      ttfb: Math.round(nav.responseStart),
      fcp: Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? NaN),
      lcp: Math.round(window.__lcp),
      // When the last web font finished arriving (the page's text is then in its final face).
      fonts: Math.max(0, ...res.filter((e) => e.name.endsWith('.woff2')).map((e) => e.end)),
      fontBytes: res.filter((e) => e.name.endsWith('.woff2')).reduce((a, e) => a + e.bytes, 0),
      load: Math.round(nav.loadEventEnd),
      cls: Number(window.__cls.toFixed(4)),
      requests: res.length + 1,
      bytes: nav.transferSize + res.reduce((a, e) => a + e.bytes, 0),
      res,
    };
  });
  results.push(r);
  await context.close();
}
await browser.close();
fs.writeFileSync(`${label}.json`, JSON.stringify({ url, rtt, kbps, results }, null, 2));
const keys = ['ttfb', 'fcp', 'lcp', 'fonts', 'load', 'cls', 'requests', 'bytes', 'fontBytes'];
console.log(JSON.stringify({ label, url, rounds, rtt, kbps, median: Object.fromEntries(keys.map((k) => [k, median(results.map((x) => x[k]))])) }));
