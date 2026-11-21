// How long a click to another page waits in Firefox and Safari (WebKit), which ignore
// Speculation Rules, so nothing there is fetched before the click (t23288).
//
// Serves a built dist/ on 127.0.0.1 with production's caching headers (pages max-age=600 and
// `Vary: Accept-Encoding, Accept`, as the edge Worker sends them; /_astro/ files immutable) and
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
// usage, from the repository root after `pnpm run build`:
//   node ops/perf/click-wait.mjs <dist|https://automancer.uk> <label> [--engine=firefox|webkit|chromium] [--rounds=5]
//                                [--delay=200] [--hover=300] [--press=80] [--persistent]
// Prints a JSON summary; writes per-click results to <label>.json in the current directory.
// docs/PERFORMANCE.md records the numbers it produced.
import { chromium, firefox, webkit } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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
const journey = (process.env.JOURNEY ?? '/services/,/work/,/about/,/field-notes/,/').split(',');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// What the page just opened reports: when it first painted (wall clock), how many bytes its HTML
// cost on the wire (0 when the browser's cache answered) and where the nav links are.
const probe = () => new Promise((resolve) => {
  const read = () => {
    const f = performance.getEntriesByName('first-contentful-paint')[0];
    const n = performance.getEntriesByType('navigation')[0];
    const links = {};
    for (const e of document.querySelectorAll('nav a[href], a.nav__brand')) {
      const h = e.getAttribute('href');
      const b = e.getBoundingClientRect();
      if (links[h] || !e.checkVisibility() || b.top < 0 || b.bottom > innerHeight || !b.width) continue;
      links[h] = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    }
    resolve({ path: location.pathname, fcp: f ? performance.timeOrigin + f.startTime : null, transfer: n?.transferSize ?? null, links });
  };
  const later = () => setTimeout(read, 300);
  if (document.readyState === 'complete') later();
  else addEventListener('load', later, { once: true });
});

const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
let requests = [];
const server = live ? null : http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const page = p.endsWith('.html');
  const mode = req.headers['sec-fetch-mode'] ?? '?';
  const purpose = req.headers['sec-purpose'] ?? req.headers.purpose;
  const by = purpose ? `speculation (${purpose})` : mode === 'navigate' ? 'navigate' : 'fetch';
  if (page) requests.push({ path: url.pathname, by, at: Date.now(), accept: req.headers.accept });
  const f = path.join(dist, p);
  setTimeout(() => fs.readFile(f, (err, buf) => {
    if (err) { res.writeHead(404); res.end(); return; }
    const headers = { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' };
    if (page) {
      headers['cache-control'] = 'max-age=600';
      headers.vary = 'Accept-Encoding, Accept';
    } else headers['cache-control'] = p.startsWith('/_astro/') ? 'public, max-age=31536000, immutable' : 'max-age=600';
    res.writeHead(200, headers);
    res.end(buf);
  }), page ? delay : 0);
});
if (server) await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = live ?? `http://127.0.0.1:${server.address().port}`;

const results = [];
for (let r = 0; r < rounds; r++) {
  // --persistent: a profile on disk, as a real browser has (an ephemeral context may keep no
  // disk cache at all).
  const profile = persistent ? fs.mkdtempSync(path.join(os.tmpdir(), 'click-wait-')) : null;
  const ctx = profile
    ? await engine.launchPersistentContext(profile, { viewport: { width: 1280, height: 800 } })
    : await (await engine.launch()).newContext({ viewport: { width: 1280, height: 800 } });
  const tab = ctx.pages()[0] ?? (await ctx.newPage());
  // Live, the page's own fetches are seen here instead of at the local server.
  if (live) tab.on('request', (q) => { if (q.resourceType() === 'fetch' && q.url().startsWith(base)) requests.push({ path: new URL(q.url()).pathname, by: 'fetch', at: Date.now(), accept: q.headers().accept }); });
  await tab.goto(`${base}/`);
  let m = await tab.evaluate(probe);
  await tab.mouse.move(5, 795);
  await sleep(1000);
  for (const target of journey) {
    const pt = m.links[target];
    if (!pt) throw new Error(`no visible link to ${target} on ${m.path}: ${JSON.stringify(m.links)}`);
    requests = [];
    await tab.mouse.move(pt.x, pt.y);
    await sleep(hover);
    const down = Date.now();
    await tab.mouse.down();
    await sleep(press);
    await tab.mouse.up();
    await tab.waitForURL((u) => u.pathname === target);
    m = await tab.evaluate(probe);
    if (m.path !== target) throw new Error(`expected ${target}, got ${m.path}`);
    const mine = requests.filter((q) => q.path === target);
    results.push({
      round: r, target, wait: m.fcp == null ? null : Math.round(m.fcp - down),
      fromCache: live ? m.transfer === 0 : !mine.some((q) => q.by === 'navigate'), ahead: mine.filter((q) => q.by !== 'navigate').length,
      requests: mine.map((q) => `${q.by} ${q.at - down} ms`),
      accept: [...new Set(mine.map((q) => `${q.by}: ${q.accept}`))],
    });
    await tab.mouse.move(5, 795);
    await sleep(600);
  }
  await ctx.close();
  await ctx.browser()?.close();
  if (profile) fs.rmSync(profile, { recursive: true, force: true });
}
server?.close();
const med = (xs) => { const v = xs.filter((x) => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
const p75 = (xs) => { const v = xs.filter((x) => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length * 0.75)] : null; };
const summary = {
  label, engine: engineName, origin: live ?? 'local dist', rounds, delay_ms: live ? null : delay, hover_ms: hover, press_ms: press, clicks: results.length,
  from_cache: results.filter((x) => x.fromCache).length,
  median_wait_ms: med(results.map((x) => x.wait)), p75_wait_ms: p75(results.map((x) => x.wait)),
  per_target: Object.fromEntries(journey.map((t) => [t, med(results.filter((x) => x.target === t).map((x) => x.wait))])),
  accept_seen: [...new Set(results.flatMap((x) => x.accept))],
};
console.log(JSON.stringify(summary));
fs.writeFileSync(`${label}.json`, JSON.stringify({ summary, results }, null, 1));
process.exit(0);
