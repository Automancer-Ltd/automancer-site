// How far the page moves when the web fonts arrive (t23013).
//
// Every font is `font-display: swap`, so a visitor on a slow connection reads the page in a local
// fallback face first and the text re-flows when Syne, Space Grotesk, Outfit and JetBrains Mono land.
// This holds every .woff2 back, records each text block's box in the fallback face, releases the
// fonts, waits for them, and records the boxes again. Per page and width it prints:
//   cls      layout shift the browser scored while the fonts swapped (what Core Web Vitals counts;
//            only what moves inside the first screen)
//   height   how much the whole page grew or shrank, in px
//   moved    median distance, in px, that a heading, paragraph or list item moved vertically
//            (what a reader who has already scrolled sees)
// usage, from the repository root (needs `pnpm run build` and `pnpm exec playwright install chromium`):
//   node ops/perf/font-swap.mjs [dist=dist] [--engine=chromium|firefox|webkit] [--widths=390,1280]
//                               [--paths=/,/services/] [--json=out.json] [--live]
// --live reads every page from https://automancer.uk itself (its served sitemap) instead of a dist/,
// holding back only the fonts; nothing but GETs to the site is sent.
// Headless Chromium on Linux rounds each glyph's advance to whole pixels at reading sizes (an
// installed Liberation Sans line comes out about 2% wider at 19 px than at 1000 px), which macOS,
// iOS and Windows do not; Firefox lays out with fractional advances, so it is the closer stand-in
// for those visitors. The fallbacks need Arial or Liberation Sans and Mono installed to be seen.
import { chromium, firefox, webkit } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const dist = path.resolve(args.find((a) => !a.startsWith('--')) ?? 'dist');
const widths = flag('widths', '390,1280').split(',').map(Number);
const engine = { chromium, firefox, webkit }[flag('engine', 'chromium')];
const ORIGIN = 'https://automancer.uk';
const live = args.includes('--live');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.xml': 'application/xml' };
const sitemapXml = live ? await (await fetch(`${ORIGIN}/sitemap-0.xml`)).text() : fs.readFileSync(path.join(dist, 'sitemap-0.xml'), 'utf8');
const sitemap = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((m) => new URL(m[1]).pathname);
const paths = flag('paths', null)?.split(',') ?? [...sitemap, live ? '/not-a-page/' : '/404.html'];

function blocks() {
  const out = [];
  for (const el of document.querySelectorAll('main h1, main h2, main h3, main p, main li, main dt, main dd, main a.btn, footer p')) {
    const r = el.getBoundingClientRect();
    if (r.height > 0) out.push(r.top + scrollY);
  }
  return { tops: out, height: document.documentElement.scrollHeight };
}

const browser = await engine.launch();
const rows = [];
for (const width of widths) {
  for (const p of paths) {
    const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 800 }, reducedMotion: 'reduce' });
    let release;
    const fontsHeld = new Promise((r) => { release = r; });
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== ORIGIN) return route.abort();
      if (live) {
        if (url.pathname.endsWith('.woff2')) await fontsHeld;
        return route.continue();
      }
      let file = decodeURIComponent(url.pathname);
      if (file.endsWith('/')) file += 'index.html';
      const full = path.join(dist, file);
      if (!full.startsWith(dist + path.sep) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
        return route.fulfill({ status: 404, contentType: TYPES['.html'], body: fs.readFileSync(path.join(dist, '404.html')) });
      }
      if (full.endsWith('.woff2')) await fontsHeld;
      return route.fulfill({ contentType: TYPES[path.extname(full)] ?? 'application/octet-stream', body: fs.readFileSync(full) });
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.__cls = 0;
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; })
        .observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto(ORIGIN + p, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    const clsBefore = await page.evaluate(() => window.__cls);
    const before = await page.evaluate(blocks);
    release();
    await page.evaluate(async () => { await document.fonts.ready; await new Promise((r) => setTimeout(r, 300)); });
    const after = await page.evaluate(blocks);
    const cls = await page.evaluate(() => window.__cls) - clsBefore;
    const n = Math.min(before.tops.length, after.tops.length);
    const moves = Array.from({ length: n }, (_, i) => Math.abs(after.tops[i] - before.tops[i])).sort((a, b) => a - b);
    rows.push({ path: p, width, cls: Number(cls.toFixed(4)), height: after.height - before.height,
      moved: Math.round(moves[Math.floor(n / 2)] ?? 0), blocks: n });
    await context.close();
  }
}
await browser.close();
const json = flag('json', null);
if (json) fs.writeFileSync(json, JSON.stringify(rows, null, 2));
for (const r of rows) console.log(`${String(r.width).padStart(4)}  ${r.path.padEnd(72)} cls ${r.cls.toFixed(4)}  height ${String(r.height).padStart(5)}  moved ${r.moved}`);
for (const width of widths) {
  const w = rows.filter((r) => r.width === width);
  const med = (xs) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  console.log(`${engine.name()} ${width}px: ${w.length} pages, CLS sum ${w.reduce((a, r) => a + r.cls, 0).toFixed(3)}, max ${Math.max(...w.map((r) => r.cls)).toFixed(3)}, ` +
    `median |height change| ${med(w.map((r) => Math.abs(r.height)))} px, median moved ${med(w.map((r) => r.moved))} px`);
}
