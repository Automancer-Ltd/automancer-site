// What the first screen costs while a visitor just reads it: renderer main-thread work per second
// once the entrance motion has finished, with nothing scrolled or touched.
// Each round opens the page in a fresh browser context (4x CPU throttle), waits <settle>
// seconds, then reads Chromium's TaskDuration (main-thread task time) over a <window>-second idle
// window and counts the animations still running and which properties they animate. A property a
// compositor can run alone (transform, translate, scale, rotate, opacity) costs the main thread nothing per frame; anything
// else (background-position, color, box-shadow) is restyled and repainted on every frame.
// usage, from the repository root (needs `pnpm exec playwright install chromium`):
//   node ops/perf/idle-screen.mjs <base-url> <label> [rounds=5] [paths=/,/services/,/about/,/field-notes/,/404.html] [phone|desktop]
// phone is 390x844 at 3x with touch; desktop is 1280x800 (the nav underline shows only there).
// Prints a JSON summary (medians per page) and writes per-round results to <label>.json in the
// current directory. docs/PERFORMANCE.md records the numbers it produced.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const [base, label, roundsArg, pathsArg, deviceArg = 'phone'] = process.argv.slice(2);
if (!base || !label) throw new Error('usage: idle-screen.mjs <base-url> <label> [rounds] [paths] [phone|desktop]');
const rounds = Number(roundsArg ?? 5);
const paths = (pathsArg ?? '/,/services/,/about/,/field-notes/,/404.html').split(',');
const device = {
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
  desktop: { viewport: { width: 1280, height: 800 } },
}[deviceArg];
if (!device) throw new Error(`device must be phone or desktop, not ${deviceArg}`);
const SETTLE_MS = 3500;
const WINDOW_MS = 5000;

const running = () =>
  document.getAnimations()
    .filter((a) => a.playState === 'running')
    .map((a) => {
      const props = new Set();
      for (const k of a.effect?.getKeyframes?.() ?? []) for (const p of Object.keys(k)) props.add(p);
      ['offset', 'easing', 'composite', 'computedOffset'].forEach((p) => props.delete(p));
      return [...props].sort().join('+');
    });

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

const browser = await chromium.launch();
const results = {};
for (let round = 0; round < rounds; round++) {
  for (const path of paths) {
    const ctx = await browser.newContext(device);
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Performance.enable');
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.goto(new URL(path, base).href, { waitUntil: 'load' });
    await page.waitForTimeout(SETTLE_MS);
    const metric = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
    const a = await metric();
    await page.waitForTimeout(WINDOW_MS);
    const b = await metric();
    const anims = await page.evaluate(running);
    const compositorOnly = anims.filter((p) => p.split('+').every((x) => ['transform', 'opacity', 'translate', 'scale', 'rotate'].includes(x))).length;
    (results[path] ??= []).push({
      mainThreadMsPerS: Math.round(((b.TaskDuration - a.TaskDuration) * 1000) / (WINDOW_MS / 1000)),
      layoutsPerS: Math.round((b.LayoutCount - a.LayoutCount) / (WINDOW_MS / 1000)),
      styleRecalcsPerS: Math.round((b.RecalcStyleCount - a.RecalcStyleCount) / (WINDOW_MS / 1000)),
      running: anims.length,
      mainThreadAnimations: anims.length - compositorOnly,
      properties: [...new Set(anims)].sort(),
    });
    await ctx.close();
  }
}
await browser.close();

const summary = Object.fromEntries(Object.entries(results).map(([path, rs]) => [path, {
  mainThreadMsPerS: median(rs.map((r) => r.mainThreadMsPerS)),
  styleRecalcsPerS: median(rs.map((r) => r.styleRecalcsPerS)),
  running: median(rs.map((r) => r.running)),
  mainThreadAnimations: median(rs.map((r) => r.mainThreadAnimations)),
  properties: rs[0].properties,
}]));
fs.writeFileSync(`${label}.json`, JSON.stringify({ base, device: deviceArg, rounds, settleMs: SETTLE_MS, windowMs: WINDOW_MS, results }, null, 2));
console.log(JSON.stringify({ label, device: deviceArg, rounds, summary }, null, 2));
