import { chromium } from '@playwright/test';
import { serveSite } from './ops/edge/local.mjs';
const srv = await serveSite({ dist: 'dist' });
const b = await chromium.launch();
const paths = (await (await fetch(srv.url + '/api/pages.json')).json()).pages.map(p => new URL(p.url).pathname);
const block = process.argv[2] === 'block';
let tot = 0, hid = 0;
for (const path of paths) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  if (block) await p.route('**/assets/js/main.js*', r => r.abort());
  await p.goto(srv.url + path, { waitUntil: 'networkidle' });
  // scroll through like a reader
  const H = await p.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < H; y += 600) { await p.evaluate(y => scrollTo(0, y), y); await p.waitForTimeout(60); }
  await p.waitForTimeout(1200);
  const r = await p.evaluate(() => {
    let all = 0, hidden = 0; const w = document.createTreeWalker(document.querySelector('main'), NodeFilter.SHOW_TEXT);
    while (w.nextNode()) { const t = w.currentNode.textContent.trim(); if (!t) continue; const el = w.currentNode.parentElement;
      if (el.closest('details:not([open]) > :not(summary)')) continue;
      let op = 1; for (let e = el; e; e = e.parentElement) op *= +getComputedStyle(e).opacity;
      if (el.getClientRects().length === 0) continue;
      all += t.length; if (op < 0.05) hidden += t.length; }
    return { all, hidden };
  });
  tot += r.all; hid += r.hidden;
  if (r.hidden) console.log(path, r.hidden, '/', r.all);
  await ctx.close();
}
console.log(block ? 'BLOCKED' : 'NORMAL', 'hidden chars', hid, 'of', tot, 'pages', paths.length);
await b.close(); await srv.close(); process.exit(0);
