// Visitor journey in a real headed Chromium with NO DevTools attached (DevTools disables
// prerendering). Runs under Xvfb; xdotool moves the mouse, hovers ~300 ms, clicks.
// Each page reports its own timings by beacon (script injected into a bench copy of dist only):
// perceived FCP/LCP = paint time minus activationStart (web-vitals / Chrome field-data convention).
// usage, from the repository root after `pnpm run build` (copy dist/ first to compare two builds):
//   xvfb-run -a -s "-screen 0 1280x900x24" node ops/perf/nav-journey.mjs dist after 5 200
// or against a live origin through a local proxy that adds the probe (delay is then ignored):
//   xvfb-run -a -s "-screen 0 1280x900x24" node ops/perf/nav-journey.mjs https://automancer.uk live 5
// Prints a JSON summary; writes per-click results to <label>.json in the current directory.
// docs/PERFORMANCE.md records the numbers it produced.
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [distArg, label, roundsArg, delayArg] = process.argv.slice(2);
const upstream = /^https?:\/\//.test(distArg) ? distArg.replace(/\/$/, '') : null; // live origin through a local probe proxy
const distSrc = upstream ? '' : path.resolve(distArg);
const rounds = Number(roundsArg ?? 5);
const delay = Number(delayArg ?? 200);
const CHROME = createRequire(new URL('../../package.json', import.meta.url))('@playwright/test').chromium.executablePath();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PROBE = `<script>(function(){
function send(){var n=performance.getEntriesByType('navigation')[0],a=n.activationStart||0,f=performance.getEntriesByName('first-contentful-paint')[0],l=0;
new PerformanceObserver(function(x){x.getEntries().forEach(function(e){l=e.startTime})}).observe({type:'largest-contentful-paint',buffered:true});
var links={};document.querySelectorAll('nav a[href], a.nav__brand').forEach(function(e){var h=e.getAttribute('href');if(links[h]||!e.checkVisibility())return;var b=e.getBoundingClientRect();if(b.top<0||b.bottom>innerHeight)return;links[h]={x:b.x+b.width/2,y:b.y+b.height/2}});
setTimeout(function(){navigator.sendBeacon('/__m',JSON.stringify({path:location.pathname,prerendered:a>0,act:a,fcp:f?Math.max(0,f.startTime-a):null,lcp:Math.max(0,l-a),links:links,sx:window.screenX,sy:window.screenY,oh:window.outerHeight-window.innerHeight}))},700)}
function go(){if(document.readyState==='complete')send();else addEventListener('load',send,{once:true})}
if(document.prerendering)document.addEventListener('prerenderingchange',go,{once:true});else go();})();</script>`;

const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
let waiter = null;
const purposes = [];
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/__m') {
    let body = ''; req.on('data', (c) => (body += c)); req.on('end', () => { res.end(); waiter?.(JSON.parse(body)); });
    return;
  }
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  if (p.endsWith('.html')) purposes.push(`${url.pathname} ${req.headers['sec-purpose'] ?? 'navigate'}`);
  if (upstream) {
    fetch(upstream + url.pathname + url.search).then(async (up) => {
      let buf = Buffer.from(await up.arrayBuffer());
      const type = up.headers.get('content-type') ?? 'application/octet-stream';
      if (type.startsWith('text/html')) buf = Buffer.from(buf.toString().replace('</head>', PROBE + '</head>'));
      res.writeHead(up.status, { 'content-type': type, 'cache-control': up.headers.get('cache-control') ?? 'no-store' });
      res.end(buf);
    }, () => { res.writeHead(502); res.end(); });
    return;
  }
  const f = path.join(distSrc, p);
  setTimeout(() => fs.readFile(f, (err, buf) => {
    if (err) { res.writeHead(404); res.end(); return; }
    if (f.endsWith('.html')) buf = Buffer.from(buf.toString().replace('</head>', PROBE + '</head>'));
    res.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream', 'cache-control': 'max-age=600' });
    res.end(buf);
  }), delay);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const next = (ms = 15000) => new Promise((resolve, reject) => { const t = setTimeout(() => reject(new Error('no beacon from the page')), ms); waiter = (m) => { clearTimeout(t); waiter = null; resolve(m); }; });
const xdo = (...a) => execFileSync('xdotool', a.map(String));

const journey = ['/services/', '/work/', '/about/', '/field-notes/', '/'];
const results = [];
for (let r = 0; r < rounds; r++) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'xjourney-'));
  const first = next(30000);
  const proc = spawn(CHROME, [`--user-data-dir=${profile}`, '--window-position=0,0', '--window-size=1280,800', '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--password-store=basic', `--app=${base}/`], { stdio: 'ignore' });
  let m = await first;
  xdo('mousemove', 5, 795); await sleep(1500);
  for (const target of journey) {
    const pt = m.links[target];
    if (!pt) { console.error(JSON.stringify(m)); throw new Error(`no visible link to ${target} on ${m.path}`); }
    const X = Math.round(pt.x + m.sx), Y = Math.round(pt.y + m.sy + m.oh);
    const arrive = next();
    xdo('mousemove', X, Y); await sleep(300);
    xdo('click', 1);
    m = await arrive;
    if (m.path !== target) throw new Error(`expected ${target}, got ${m.path}`);
    results.push({ round: r, target, prerendered: m.prerendered, fcp: m.fcp, lcp: m.lcp });
    xdo('mousemove', 5, 795); await sleep(600);
  }
  proc.kill(); await sleep(500);
  fs.rmSync(profile, { recursive: true, force: true });
}
server.close();
const med = (xs) => { const v = xs.filter((x) => x != null).sort((a, b) => a - b); return v.length ? Math.round(v[Math.floor(v.length / 2)]) : null; };
const summary = {
  label, rounds, delay_ms: upstream ? null : delay, origin: upstream ?? 'local dist', clicks: results.length,
  prerendered: results.filter((x) => x.prerendered).length,
  median_fcp_ms: med(results.map((x) => x.fcp)),
  median_lcp_ms: med(results.map((x) => x.lcp)),
  p75_lcp_ms: (() => { const v = results.map((x) => x.lcp).sort((a, b) => a - b); return Math.round(v[Math.floor(v.length * 0.75)]); })(),
  per_target_lcp: Object.fromEntries(journey.map((t) => [t, med(results.filter((x) => x.target === t).map((x) => x.lcp))])),
  html_requests: Object.entries(purposes.reduce((a, k) => ((a[k.split(' ')[1]] = (a[k.split(' ')[1]] ?? 0) + 1), a), {})),
};
console.log(JSON.stringify(summary));
fs.writeFileSync(`${label}.json`, JSON.stringify({ summary, results, purposes }, null, 1));
process.exit(0);
