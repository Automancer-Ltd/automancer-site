import { chromium } from '@playwright/test';
const base = 'http://127.0.0.1:48523';
const b = await chromium.launch();
const sm = await (await fetch(base + '/sitemap-0.xml')).text();
const paths = [...sm.matchAll(/<loc>https:\/\/automancer\.uk([^<]*)<\/loc>/g)].map(m => m[1]);
for (const w of [480, 600, 700, 768, 834, 900, 1024]) {
  const p = await b.newPage({ viewport: { width: w, height: 1000 }, reducedMotion: 'reduce' });
  for (const path of paths) {
    await p.goto(base + path, { waitUntil: 'load' });
    const bad = await p.evaluate(() => {
      const out = [];
      for (const e of document.querySelectorAll('main *')) {
        const r = e.getBoundingClientRect();
        if (e.closest('.sr-only, [hidden], [aria-hidden="true"]')) continue;
        const cs = getComputedStyle(e); if (cs.position === 'absolute' && cs.clip !== 'auto') continue;
        const txt = [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('');
        if (txt.length > 12 && r.width < 80 && r.height > 120) out.push(`${e.tagName}.${e.className} ${Math.round(r.width)}x${Math.round(r.height)} "${txt.slice(0,20)}"`);
      }
      return out.slice(0, 3);
    });
    if (bad.length) console.log(w, path, bad.join(' ; '));
  }
  await p.close();
}
await b.close();
