// A visitor's first page on automancer.uk, every page in the sitemap once (t25774).
// Each page opens in a fresh browser context (nothing cached) on a throttled phone connection
// (Lighthouse's Slow 4G by default) and reports how long the server took to start answering
// (navigation responseStart - requestStart, which includes the throttled round trip), first
// contentful paint, and the edge Worker's X-Edge-Cache header (hit, miss, reload; none before
// t25774). Each page is asked for once, so it measures what a visitor who arrives some time after
// the last one waits: run ops/perf/edge-wait.sh from another machine to warm nothing here.
// Chromium's emulated latency overlaps the real wait (a response arrives no sooner than rttMs
// after the request, however long the server took inside it), so a server wait shorter than
// rttMs does not show at all. `0 0` turns the throttling off and measures the real network.
// usage, from the repository root (needs `pnpm exec playwright install chromium`):
//   node ops/perf/first-page.mjs <base-url> <label> [rttMs=150] [kbps=1600]
// Prints a JSON summary of medians and p75 and writes per-page results to <label>.json.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const [base, label, rttArg, kbpsArg] = process.argv.slice(2);
if (!base || !label) throw new Error('usage: first-page.mjs <base-url> <label> [rttMs] [kbps]');
const rtt = Number(rttArg ?? 150);
const kbps = Number(kbpsArg ?? 1600);
const origin = base.replace(/\/$/, '');
const sitemap = await (await fetch(`${origin}/sitemap-0.xml`)).text();
const paths = [...sitemap.matchAll(/<loc>https:\/\/automancer\.uk([^<]*)<\/loc>/g)].map((m) => m[1]);

const at = (xs, q) => {
  const s = xs.filter((x) => x != null).sort((a, b) => a - b);
  return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(q * s.length))]) : null;
};
const browser = await chromium.launch();
const results = [];
for (const path of paths) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  if (rtt || kbps) {
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false, latency: rtt, downloadThroughput: (kbps * 1024) / 8, uploadThroughput: (750 * 1024) / 8,
    });
  }
  const response = await page.goto(`${origin}${path}`, { waitUntil: 'load' });
  const timing = await page.evaluate(async () => {
    const nav = performance.getEntriesByType('navigation')[0];
    const fcp = await new Promise((resolve) => {
      new PerformanceObserver((l) => resolve(l.getEntries()[0]?.startTime)).observe({ type: 'paint', buffered: true });
      setTimeout(() => resolve(null), 5000);
    });
    return { wait: nav.responseStart - nav.requestStart, fcp };
  });
  results.push({ path, status: response?.status(), edge: response?.headers()['x-edge-cache'] ?? null, ...timing });
  await context.close();
}
await browser.close();
fs.writeFileSync(`${label}.json`, JSON.stringify(results, null, 2));
const waits = results.map((r) => r.wait);
const fcps = results.map((r) => r.fcp);
console.log(JSON.stringify({
  label, pages: results.length, rtt, kbps,
  edge: Object.fromEntries([...new Set(results.map((r) => r.edge))].map((e) => [e, results.filter((r) => r.edge === e).length])),
  serverWait: { median: at(waits, 0.5), p75: at(waits, 0.75), max: at(waits, 1) },
  firstPaint: { median: at(fcps, 0.5), p75: at(fcps, 0.75), max: at(fcps, 1) },
}));
