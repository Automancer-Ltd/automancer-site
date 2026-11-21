// What arriving on /contact/ costs a phone, and how soon the security check is ready once the
// visitor starts on the form (t21450). Fresh browser context per round; real Cloudflare Turnstile
// over a throttled connection (Slow 4G by default) and a 4x slower CPU.
// usage, from the repository root (needs `pnpm exec playwright install chromium`):
//   node ops/perf/contact-cost.mjs <dist-dir|origin> <label> [rounds=5] [cpu=4] [android,reader]
// A dist directory is served at https://automancer.uk itself through the edge Worker (Playwright
// routes it; ops/edge/local.mjs), so Turnstile sees the real site key's hostname and two builds
// compare fairly; their first-party files then skip the throttle, which applies to Cloudflare's requests in both alike.
// `android` turns site isolation off, as Chrome on Android does for most sites: Turnstile's
// cross-site frame then runs on the page's own main thread, where a visitor feels it.
// Reports medians: Cloudflare bytes and requests and main-thread long tasks up to one second
// after the load event (arrival), and over 8 s with nobody touching the page (2 s for `reader`), then (after a tap on Name) how long until the widget's frame
// is in its slot (already there: the time for the tap itself) and the slowest keystroke while
// typing a name straight after, plus any policy refusals or page errors.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { ORIGIN, routeSite } from '../edge/local.mjs';

const [target, label, roundsArg, cpuArg, mode] = process.argv.slice(2);
if (!target || !label) throw new Error('usage: contact-cost.mjs <dist-dir|origin> <label> [rounds] [cpu] [android]');
const rounds = Number(roundsArg ?? 5), cpu = Number(cpuArg ?? 4);
const android = /android/.test(mode ?? ''), reader = /reader/.test(mode ?? '');
const dist = /^https?:\/\//.test(target) ? null : path.resolve(target);
const origin = dist ? ORIGIN : target.replace(/\/$/, '');
const median = (xs) => { const s = xs.filter((x) => x != null).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };

const browser = await chromium.launch({ args: android ? ['--disable-site-isolation-trials', '--disable-features=IsolateOrigins,site-per-process'] : [] });
const out = [];
for (let i = 0; i < rounds; i++) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  if (dist) await routeSite(context, dist);
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__lt = []; window.__csp = []; window.__ev = [];
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__ev.push([e.name, e.duration, e.startTime]); }).observe({ type: 'event', durationThreshold: 16, buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true });
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1600 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  let cfBytes = 0, cfReqs = 0;
  context.on('requestfinished', async (r) => {
    if (!new URL(r.url()).host.endsWith('cloudflare.com')) return;
    try { const s = await r.sizes(); cfReqs++; cfBytes += Math.max(0, s.responseBodySize) + Math.max(0, s.responseHeadersSize); } catch {}
  });
  const t0 = Date.now();
  await page.goto(`${origin}/contact/`, { waitUntil: 'load' });
  const load = Date.now() - t0;
  // Arrival: what Cloudflare and long tasks cost by the time the page has loaded plus one second.
  await page.waitForTimeout(1000);
  const loadedAt = await page.evaluate(() => performance.getEntriesByType('navigation')[0].loadEventEnd);
  const early = await page.evaluate((until) => window.__lt.filter(([t]) => t < until), loadedAt + 1000);
  const arrive = { load, cfBytesAtLoad: cfBytes, cfReqsAtLoad: cfReqs, tbtAtLoad: Math.round(early.reduce((a, [, d]) => a + Math.max(0, d - 50), 0)), busyAtLoad: Math.round(early.reduce((a, [, d]) => a + d, 0)) };
  await page.waitForTimeout(reader ? 1000 : 7000);
  const lt = await page.evaluate(() => window.__lt);
  Object.assign(arrive, { cfBytes, cfReqs, longTasks: lt.length, busy: Math.round(lt.reduce((a, [, d]) => a + d, 0)), tbt: Math.round(lt.reduce((a, [, d]) => a + Math.max(0, d - 50), 0)) });
  // The visitor starts on the form: how long until the widget's frame sits in its slot?
  // `reader` journeys arrive, read the intro for 2 s, scroll the form's top into view, read its
  // lead-in for 2 s, then tap Name; otherwise the tap comes after the 8 s idle above.
  if (reader) {
    await page.evaluate(() => document.querySelector('.contact-grid__form').scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(2000);
  }
  const t1 = Date.now();
  await page.locator('#name').tap();
  let ready = null;
  // The widget's frame sits in a closed shadow root; its response input and frame are what show.
  try {
    await page.locator('.turnstile-slot [name="cf-turnstile-response"]').waitFor({ state: 'attached', timeout: 20000 });
    while (!page.frames().some((f) => f.url().includes('/turnstile/')) && Date.now() - t1 < 20000) await page.waitForTimeout(20);
    ready = Date.now() - t1;
  } catch {}
  // Typing the name while the check starts: the slowest keystroke from tap to paint (Event Timing).
  const typedFrom = await page.evaluate(() => performance.now());
  await page.keyboard.type('Morgan Example Ltd owner', { delay: 120 });
  const slowestKey = await page.evaluate((from) => Math.round(Math.max(0, ...window.__ev.filter(([n, , t]) => t >= from && /key|input|beforeinput/.test(n)).map(([, d]) => d))), typedFrom);
  await page.waitForTimeout(3000);
  const csp = await page.evaluate(() => window.__csp);
  out.push({ ...arrive, widgetReadyAfterTap: ready, slowestKey, cfBytesTotal: cfBytes, csp, errors }); // cfBytes has grown since arrival
  await context.close();
}
await browser.close();
const m = (k) => median(out.map((o) => o[k]));
const summary = { label, target, rounds, cpu, android, reader, median: { load: m('load'), cfBytesAtLoad: m('cfBytesAtLoad'), cfReqsAtLoad: m('cfReqsAtLoad'), tbtAtLoad: m('tbtAtLoad'), busyAtLoad: m('busyAtLoad'), cfBytesBeforeTap: m('cfBytes'), longTasks: m('longTasks'), mainThreadBusy: m('busy'), tbt: m('tbt'), widgetReadyAfterTap: m('widgetReadyAfterTap'), slowestKey: m('slowestKey'), slowestKeyWorst: Math.max(...out.map((o) => o.slowestKey)), cfBytesTotal: m('cfBytesTotal') }, csp: [...new Set(out.flatMap((o) => o.csp))], errors: [...new Set(out.flatMap((o) => o.errors))] };
console.log(JSON.stringify(summary));
fs.writeFileSync(`${label}.json`, JSON.stringify({ summary, rounds: out }, null, 1));
