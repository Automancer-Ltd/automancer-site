import { chromium } from '@playwright/test';
import { serveSite } from './ops/edge/local.mjs';
const srv = await serveSite({ dist: 'dist' });
const b = await chromium.launch();
const paths = (await (await fetch(srv.url + '/api/pages.json')).json()).pages.map(p => new URL(p.url).pathname);
paths.push('/no-such-page/');
for (const [w,h] of [[390,844],[1280,800],[1024,768],[320,568]]) {
  let n = 0;
  for (const path of paths) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    const p = await ctx.newPage();
    await p.route('**/assets/js/main.js*', r => r.abort());
    await p.goto(srv.url + path, { waitUntil: 'load' });
    const r = await p.evaluate(() => [...document.querySelectorAll('.reveal, .reveal-stagger')].filter(e => { const b = e.getBoundingClientRect(); return b.top < innerHeight && b.bottom > 0; }).map(e => e.className.slice(0,40)));
    if (r.length) { n++; console.log(w, path, r); }
    await ctx.close();
  }
  console.log(w, 'pages with reveal in first viewport:', n);
}
await b.close(); await srv.close(); process.exit(0);
