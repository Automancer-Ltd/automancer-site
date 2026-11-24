import { chromium } from '@playwright/test';
import { serveSite } from './ops/edge/local.mjs';
const [dist, label] = process.argv.slice(2);
const srv = await serveSite({ dist });
const b = await chromium.launch();
// 1. Laptop first screen of a case study, no scrolling, script running normally.
let ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
let p = await ctx.newPage();
await p.goto(srv.url + '/work/care-provider-transformation/', { waitUntil: 'networkidle' });
await p.waitForTimeout(2500);
await p.screenshot({ path: `/tmp/t25989-shots/case-1280-${label}.png` });
await ctx.close();
// 2. Phone, /services/, main.js fails to load, reader scrolls to each offer.
ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
p = await ctx.newPage();
await p.route('**/assets/js/main.js*', r => r.abort());
await p.goto(srv.url + '/services/', { waitUntil: 'networkidle' });
await p.evaluate(() => document.querySelectorAll('.offer')[1].scrollIntoView());
await p.waitForTimeout(1500);
await p.screenshot({ path: `/tmp/t25989-shots/services-noscript-390-${label}.png` });
await ctx.close();
await b.close(); await srv.close(); process.exit(0);
