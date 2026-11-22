// How long a click to another page waits in Firefox and Safari (WebKit), which ignore
// Speculation Rules, so nothing there is fetched before the click (t23288).
//
// Serves a built dist/ on 127.0.0.1 through the edge Worker, as production does (its caching
// headers: pages max-age=600 and `Vary: Accept-Encoding, Accept`; /_astro/ files immutable), with
// <delay> ms before every page's first byte, the wait a phone sees for a page that is not yet in
// its cache. Each round is a fresh browser: it opens /, then walks the journey through the nav,
// pointing at each link for <hover> ms before pressing it for <press> ms (a laptop: hover 300,
// press 80; a phone tap: hover 0, press 90). Each page reports when its first content was
// painted; the wait is that time minus the moment the button was pressed down.
// It also counts each page request by what asked for it: `navigate` (the click itself) or
// `fetch` (this site's own script fetching ahead of the click) or `speculation` (the browser
// acting on Speculation Rules), with its time relative to the press, and whether the click was answered from the
// browser's cache (no `navigate` request reached the server).
// Given a URL instead of a dist/, it walks that site itself (GETs only; nothing is delayed), and a
// click counts as answered from the cache when the page's HTML cost no bytes on the wire.
// Use --persistent for Firefox and WebKit: in Playwright's default throwaway context WebKit
// reuses nothing from its cache, even a page it has just shown.
// --phone walks it as a phone visitor instead (t24026): a 390 x 844 touch screen with no mouse,
// reading each page for <read> ms before tapping the link on screen (Contact sits in the header);
// a link that is in the menu is reached by tapping Menu and reading it for <menu> ms first. The
// wait is from the tap on the link itself. Its default journey is
// /contact/,/services/,/work/,/field-notes/,/about/,/ (JOURNEY overrides it, either way).
// --rules-off makes the page see a WebKit without Speculation Rules, as Safari 27 ships (Playwright's
// WebKit has them on): HTMLScriptElement.supports('speculationrules') answers false. It only
// stands for Safari 27 on the local dist/, over plain HTTP, where WebKit never acts on the rules.
// usage, from the repository root after `pnpm run build`:
//   node ops/perf/click-wait.mjs <dist|https://automancer.uk> <label> [--engine=firefox|webkit|chromium] [--rounds=5]
//                                [--delay=200] [--hover=300] [--press=80] [--persistent]
//                                [--phone] [--read=2000] [--menu=800] [--rules-off]
// Prints a JSON summary; writes per-click results to <label>.json in the current directory.
// docs/PERFORMANCE.md records the numbers it produced.
import { chromium, firefox, webkit } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { serveSite } from '../edge/local.mjs';

const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flag = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const [distArg, label] = positional;
if (!distArg || !label) throw new Error('usage: click-wait.mjs <dist> <label> [--engine=] [--rounds=] [--delay=] [--hover=] [--press=]');
const live = /^https?:\/\//.test(distArg) ? distArg.replace(/\/$/, '') : null;
const dist = live ? null : path.resolve(distArg);
const engineName = flag('engine', 'firefox');
const engine = { chromium, firefox, webkit }[engineName];
const rounds = Number(flag('rounds', 5));
const delay = Number(flag('delay', 200));
const hover = Number(flag('hover', 300));
const press = Number(flag('press', 80));
const persistent = process.argv.includes('--persistent');
const phone = process.argv.includes('--phone');
const read = Number(flag('read', 2000));
const menuRead = Number(flag('menu', 800));
const rulesOff = process.argv.includes('--rules-off');
const journey = (process.env.JOURNEY ?? (phone ? '/contact/,/services/,/work/,/field-notes/,/about/,/' : '/services/,/work/,/about/,/field-notes/,/')).split(',');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// What the page just opened reports: when it first painted (wall clock), how many bytes its HTML
// cost on the wire (0 when the browser's cache answered) and where the nav links are.
const probe = (phone) => new Promise((resolve) => {
  const read = () => {
    const f = performance.getEntriesByName('first-contentful-paint')[0];
    const n = performance.getEntriesByType('navigation')[0];
    const links = {};
    // A phone taps the link it sees on screen: any link, the header's Contact included.
    for (const e of document.querySelectorAll(phone ? 'a[href]' : 'nav a[href], a.nav__brand')) {
      const h = e.getAttribute('href');
      const b = e.getBoundingClientRect();
      if (links[h] || !e.checkVisibility() || b.top < 0 || b.bottom > innerHeight || !b.width) continue;
      links[h] = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    }
    const m = document.querySelector('summary.nav__toggle')?.getBoundingClientRect();
    const menu = m && m.width ? { x: m.x + m.width / 2, y: m.y + m.height / 2 } : null;
    resolve({ path: location.pathname, fcp: f ? performance.timeOrigin + f.startTime : null, transfer: n?.transferSize ?? null, links, menu });
  };
  const later = () => setTimeout(read, 300);
  if (document.readyState === 'complete') later();
  else addEventListener('load', later, { once: true });
});

let requests = [];
// The dist/ as production serves it, through the edge Worker (ops/edge/local.mjs), with every
// HTML page held back <delay> ms.
const local = live ? null : await serveSite({
  dist,
  delay,
  onRequest: (req) => {
    const url = new URL(req.url, 'http://x');
    if (!url.pathname.endsWith('/') && !url.pathname.endsWith('.html')) return;
    const purpose = req.headers['sec-purpose'] ?? req.headers.purpose;
    const by = purpose ? `speculation (${purpose})` : req.headers['sec-fetch-mode'] === 'navigate' ? 'navigate' : 'fetch';
    requests.push({ path: url.pathname, by, at: Date.now(), accept: req.headers.accept });
  },
});
const base = live ?? local.url;

const results = [];
for (let r = 0; r < rounds; r++) {
  // --persistent: a profile on disk, as a real browser has (an ephemeral context may keep no
  // disk cache at all).
  const profile = persistent ? fs.mkdtempSync(path.join(os.tmpdir(), 'click-wait-')) : null;
  const screen = phone
    ? { viewport: { width: 390, height: 844 }, hasTouch: true, ...(engineName === 'firefox' ? {} : { isMobile: true }) }
    : { viewport: { width: 1280, height: 800 } };
  const ctx = profile
    ? await engine.launchPersistentContext(profile, screen)
    : await (await engine.launch()).newContext(screen);
  if (rulesOff) {
    await ctx.addInitScript(() => {
      const supports = HTMLScriptElement.supports;
      HTMLScriptElement.supports = (type) => type !== 'speculationrules' && supports.call(HTMLScriptElement, type);
    });
  }
  const tab = ctx.pages()[0] ?? (await ctx.newPage());
  // Live, the page's own fetches are seen here instead of at the local server.
  if (live) tab.on('request', (q) => { if (q.resourceType() === 'fetch' && q.url().startsWith(base)) requests.push({ path: new URL(q.url()).pathname, by: 'fetch', at: Date.now(), accept: q.headers().accept }); });
  await tab.goto(`${base}/`);
  let m = await tab.evaluate(probe, phone);
  if (!phone) {
    await tab.mouse.move(5, 795);
    await sleep(1000);
  }
  for (const target of journey) {
    requests = [];
    let down;
    if (phone) {
      await sleep(read);
      if (!m.links[target] && m.menu) {
        await tab.touchscreen.tap(m.menu.x, m.menu.y);
        await sleep(menuRead);
        m = await tab.evaluate(probe, phone);
      }
      const pt = m.links[target];
      if (!pt) throw new Error(`no link to ${target} on screen at ${m.path}: ${JSON.stringify(Object.keys(m.links))}`);
      down = Date.now();
      await tab.touchscreen.tap(pt.x, pt.y);
    } else {
      const pt = m.links[target];
      if (!pt) throw new Error(`no visible link to ${target} on ${m.path}: ${JSON.stringify(m.links)}`);
      await tab.mouse.move(pt.x, pt.y);
      await sleep(hover);
      down = Date.now();
      await tab.mouse.down();
      await sleep(press);
      await tab.mouse.up();
    }
    await tab.waitForURL((u) => u.pathname === new URL(target, 'http://x').pathname);
    m = await tab.evaluate(probe, phone);
    const want = new URL(target, 'http://x').pathname;
    if (m.path !== want) throw new Error(`expected ${want}, got ${m.path}`);
    const mine = requests.filter((q) => q.path === want);
    results.push({
      round: r, target, wait: m.fcp == null ? null : Math.round(m.fcp - down),
      fromCache: live ? m.transfer === 0 : !mine.some((q) => q.by === 'navigate'), ahead: mine.filter((q) => q.by !== 'navigate').length,
      fetchedAhead: requests.filter((q) => q.by !== 'navigate' && q.at < down).length,
      requests: mine.map((q) => `${q.by} ${q.at - down} ms`),
      accept: [...new Set(mine.map((q) => `${q.by}: ${q.accept}`))],
    });
    if (!phone) {
      await tab.mouse.move(5, 795);
      await sleep(600);
    }
  }
  await ctx.close();
  await ctx.browser()?.close();
  if (profile) fs.rmSync(profile, { recursive: true, force: true });
}
await local?.close();
const med = (xs) => { const v = xs.filter((x) => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
const p75 = (xs) => { const v = xs.filter((x) => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length * 0.75)] : null; };
const summary = {
  label, engine: engineName, origin: live ?? 'local dist', rounds, delay_ms: live ? null : delay,
  ...(phone ? { phone: true, read_ms: read, menu_ms: menuRead } : { hover_ms: hover, press_ms: press }), ...(rulesOff && { rules_off: true }), clicks: results.length,
  // Every page of HTML fetched ahead of a click, opened or not: what the prefetch costs.
  fetched_ahead: results.reduce((n, x) => n + x.fetchedAhead, 0),
  from_cache: results.filter((x) => x.fromCache).length,
  median_wait_ms: med(results.map((x) => x.wait)), p75_wait_ms: p75(results.map((x) => x.wait)),
  per_target: Object.fromEntries(journey.map((t) => [t, med(results.filter((x) => x.target === t).map((x) => x.wait))])),
  accept_seen: [...new Set(results.flatMap((x) => x.accept))],
};
console.log(JSON.stringify(summary));
fs.writeFileSync(`${label}.json`, JSON.stringify({ summary, results }, null, 1));
process.exit(0);
