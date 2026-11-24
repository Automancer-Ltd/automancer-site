import { chromium } from '@playwright/test';
import { serveSite } from './ops/edge/local.mjs';
const [dist, label] = process.argv.slice(2);
const srv = await serveSite({ dist });
const b = await chromium.launch();
const pages = { '/work/care-provider-transformation/': '.statband', '/work/debiaser-ai-product/': '.statband', '/work/manufacturer-trade-portal/': '.statband', '/contact/': '.promise', '/work/': '.honesty' };
const out = {};
for (const [path, sel] of Object.entries(pages)) {
  const runs = [];
  for (let i = 0; i < 5; i++) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    const p = await ctx.newPage();
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8 * 0.9, uploadThroughput: 750e3 / 8 * 0.9 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await p.addInitScript((sel) => {
      const rec = { first: null, full: null, dipAfterFull: false, samples: 0 };
      window.__rec = rec;
      const tick = () => {
        const el = document.querySelector(sel);
        const t = el && (el.matches('.reveal-stagger') ? el.firstElementChild : el);
        if (t) { const o = +getComputedStyle(t).opacity; rec.samples++;
          if (o > 0.01 && rec.first == null) rec.first = performance.now();
          if (o >= 0.99 && rec.full == null) rec.full = performance.now();
          if (rec.full != null && o < 0.99) rec.dipAfterFull = true; }
        if (performance.now() < 8000) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, sel);
    await p.goto(srv.url + path, { waitUntil: 'load' });
    await p.waitForTimeout(4000);
    const r = await p.evaluate(() => ({ ...window.__rec, fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime }));
    runs.push(r); await ctx.close();
  }
  const med = (k) => { const v = runs.map(r => r[k]).filter(x => x != null).sort((a, b) => a - b); return v.length ? Math.round(v[Math.floor(v.length / 2)]) : null; };
  out[path] = { fcp: med('fcp'), firstVisible: med('first'), fullyVisible: med('full'), dips: runs.filter(r => r.dipAfterFull).length };
}
console.log(label, JSON.stringify(out, null, 1));
await b.close(); await srv.close(); process.exit(0);
