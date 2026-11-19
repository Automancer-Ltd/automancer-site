// What pressing Send on /contact/ costs on the network, measured live (t20932).
// The POST body is "{}": the API rejects it with 400 at validation, before it
// rate-limits, checks Turnstile or stores anything, so no enquiry is created.
// Each round is a fresh browser: cold DNS, connection and CORS-preflight caches.
//   cold : POST exactly as the form does, straight after the page loads.
//   form : type into the form first (which fires the page's own warm-up), wait
//          <gapMs> as a visitor writing would, then the same POST.
// Prints the median and every round's time, and which requests the POST cost
// ("OPTIONS" there is a CORS preflight paid on Send).
// [html] serves a built page (dist/contact/index.html) at <url> instead of production's, so a
// change can be measured against the real API, from the real origin, before it is merged.
// usage, from the repository root (needs `pnpm exec playwright install chromium`):
//   node ops/perf/send-probe.mjs <cold|form> [rounds=5] [gapMs=3000] [url=https://automancer.uk/contact/] [html]
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const [mode, roundsArg = '5', gapArg = '3000', url = 'https://automancer.uk/contact/', html] = process.argv.slice(2);
if (mode !== 'cold' && mode !== 'form') throw new Error('usage: send-probe.mjs <cold|form> [rounds] [gapMs] [url]');
const endpoint = 'https://api.automancer.uk/api/lead';

const rounds = [];
for (let i = 0; i < Number(roundsArg); i++) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  const sent = [];
  cdp.on('Network.requestWillBeSent', (e) => { if (e.request.url.startsWith(endpoint)) sent.push(e.request.method); });
  if (html) {
    // Intercept only the document through CDP: Playwright's page.route intercepts every request,
    // and then reports CORS preflights the browser would not otherwise send.
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: url, resourceType: 'Document', requestStage: 'Request' }] });
    cdp.on('Fetch.requestPaused', (e) => cdp.send('Fetch.fulfillRequest', {
      requestId: e.requestId, responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }],
      body: Buffer.from(fs.readFileSync(html)).toString('base64'),
    }));
  }
  await page.goto(url, { waitUntil: 'load' });
  if (mode === 'form') await page.fill('#contact-form [name="name"]', 'Probe');
  await page.waitForTimeout(Number(gapArg));
  const before = sent.length;
  const r = await page.evaluate(async (u) => {
    const t = performance.now();
    const res = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', body: '{}' });
    await res.text();
    return { ms: Math.round(performance.now() - t), status: res.status };
  }, endpoint);
  await page.waitForTimeout(200);
  rounds.push({ ...r, requests: sent.slice(before) });
  await browser.close();
}
const ms = rounds.map((x) => x.ms).sort((a, b) => a - b);
console.log(JSON.stringify({ mode, page: html ?? url, gapMs: Number(gapArg), median: ms[Math.floor(ms.length / 2)], rounds }));
