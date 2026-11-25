// Before and after, page by page: does this change look the same as <base> on every page?
//
// Builds <base> (a git ref, default origin/main) and the working tree, then opens every page in
// either build's sitemap plus the 404 page, at a phone (390x844) and a laptop (1280x800) width. For
// each one it compares a full-page screenshot pixel by pixel and lists the elements whose box
// moved. It prints one line per page and exits 1 when anything differs, so "nothing looks
// different" is a command and not a hand-picked list of pages (t22218 checked a list that lacked
// /developers/ and shipped that page without its hero styles).
//
// usage, from the repository root (needs `pnpm exec playwright install chromium`):
//   pnpm run compare [base-ref=origin/main] [--head=<ref>] [--engines=chromium,webkit,firefox] [--widths=390,1280]
//                    [--paths=/,/services/] [--no-build] [--motion=reduce] [--tolerance=2]
//                    [--out=test-results/compare]
//
// --head compares two commits (e.g. what a past merge changed) instead of the working tree.
// Both builds use the same settings as the test build (tests/support/build-env.ts). Each build is
// served to the browser from its dist/ through the edge Worker (ops/edge/local.mjs), routed by
// Playwright at https://automancer.uk itself, so no port is opened and no server is left behind. Turnstile is stubbed and every other outside
// request is refused, so nothing leaves the machine. Before each capture the page is scrolled
// through (scroll reveals fire as a reader's would), fonts settle, the proof strip's build stamp
// and commit are blanked (they differ in every build), the pointer rests mid-screen and every
// animation is held still. Each commit's build is cached under $COMPARE_DIR (default: the system
// temp folder) as its source and dist/, about 10 MB.
// For every page that differs, <out>/<engine>-<width>/<page>.{base,head,diff}.png are written
// (red in the diff marks changed pixels); <out>/report.json has every row.
import { chromium, firefox, webkit } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TEST_SENTRY_DSN } from '../tests/support/build-env.ts';
import { ORIGIN, routeSite } from './edge/local.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : true;
};
const baseRef = args.find((a) => !a.startsWith('--')) ?? 'origin/main';
const engines = String(flag('engines', 'chromium')).split(',');
const widths = String(flag('widths', '390,1280')).split(',').map(Number);
const onlyPaths = flag('paths', null)?.split(',');
const out = path.resolve(String(flag('out', 'test-results/compare')));
const motion = flag('motion', 'no-preference');
// Channel steps a pixel may move and still count as the same: equal builds differ by one step
// at a few antialiased corners.
const tolerance = Number(flag('tolerance', 2));
const headRef = flag('head', null);
const CONCURRENCY = 4;
const ROOT = path.resolve(import.meta.dirname, '..');
const env = { ...process.env, PUBLIC_AUT_SENTRY_WEB_DSN: process.env.PUBLIC_AUT_SENTRY_WEB_DSN ?? TEST_SENTRY_DSN };
const run = (cmd, argv, cwd) => execFileSync(cmd, argv, { cwd, env, stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();

// ── The two builds ──
/** Build a commit from `git archive` (never a checkout: this working copy and its index stay
 *  untouched), cached by commit under $COMPARE_DIR. Returns its dist/. */
function buildCommit(ref) {
  const sha = run('git', ['rev-parse', '--verify', `${ref}^{commit}`], ROOT);
  const dir = path.join(process.env.COMPARE_DIR ?? path.join(os.tmpdir(), 'automancer-site-compare'), sha);
  if (!fs.existsSync(path.join(dir, 'dist', 'index.html'))) {
    console.error(`building ${ref} (${sha.slice(0, 12)}) in ${dir}`);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    execFileSync('sh', ['-c', `git archive ${sha} | tar -x -C "${dir}"`], { cwd: ROOT, stdio: 'inherit' });
    run('pnpm', ['install', '--frozen-lockfile', '--prefer-offline', '--reporter=silent'], dir);
    run('pnpm', ['run', 'build'], dir);
    fs.rmSync(path.join(dir, 'node_modules'), { recursive: true, force: true }); // only dist/ is read again
  }
  return { sha, dist: path.join(dir, 'dist') };
}
const base = buildCommit(baseRef);
const sha = base.sha;
let headDist = path.join(ROOT, 'dist');
if (headRef) headDist = buildCommit(headRef).dist;
else if (!flag('no-build', false)) {
  console.error('building the working tree');
  run('pnpm', ['run', 'build'], ROOT);
}
const builds = { base: base.dist, head: headDist };

const sitemap = (dist) => {
  const file = path.join(dist, 'sitemap-0.xml');
  return [...fs.readFileSync(file, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
};
const paths = onlyPaths ?? [...new Set([...sitemap(builds.base), ...sitemap(builds.head), '/404.html'])];

// ── Serving a dist/ to the browser ──
// Through the edge Worker, as production serves it (ops/edge/local.mjs), at https://automancer.uk.
const TURNSTILE_STUB = 'window.turnstile={getResponse:()=>"compare-token",reset(){},render(){}};';

async function serve(context, dist) {
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.host === 'challenges.cloudflare.com') return route.fulfill({ contentType: 'text/javascript', body: TURNSTILE_STUB });
    return url.origin === ORIGIN ? route.fallback() : route.abort();
  });
  await routeSite(context, dist);
}

/** Every element's box in document coordinates, keyed by its tag:nth-of-type path. */
function boxes() {
  const key = (el) => {
    const parts = [];
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      let n = 1;
      for (let s = e.previousElementSibling; s; s = s.previousElementSibling) if (s.tagName === e.tagName) n++;
      parts.unshift(`${e.tagName.toLowerCase()}:${n}`);
    }
    return parts.join('>');
  };
  const all = {};
  for (const el of document.body.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    all[key(el)] = [r.x, r.y + scrollY, r.width, r.height].map((v) => Math.round(v * 2) / 2);
  }
  return all;
}

/** Open a page as a reader would, settle it and capture its screenshot, boxes and errors. */
async function capture(context, route) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message ?? e)));
  await page.addInitScript(() => {
    window.__refused = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__refused.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  const response = await page.goto(ORIGIN + route, { waitUntil: 'load' });
  // A still pointer in the middle of the screen: the hero glows' cursor parallax (src/scripts/main.ts) rests at zero.
  const { width, height } = page.viewportSize();
  await page.mouse.move(width / 2, height / 2);
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += innerHeight / 2) {
      scrollTo({ top: y, behavior: 'instant' });
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));
    }
    scrollTo({ top: 0, behavior: 'instant' });
    await document.fonts.ready;
    // The proof strip shows this build's time and commit: equal builds would differ there.
    for (const el of document.querySelectorAll('.proof-strip__item b')) el.textContent = 'build';
    // Hold every animation and transition still (finite ones at their end, endless ones at their
    // start) until a frame passes with nothing left running: the scroll handlers' class changes
    // land a frame or two after the scroll and start transitions of their own.
    await new Promise((r) => setTimeout(r, 300));
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    // Paused ones too: main.ts pauses offscreen effects wherever they happened to be.
    for (let round = 0; round < 20; round++) {
      const all = document.getAnimations();
      if (round > 0 && !all.some((a) => a.playState === 'running')) break;
      for (const a of all) {
        if (a.effect?.getComputedTiming().iterations === Infinity) {
          a.pause();
          a.currentTime = 0;
        } else a.finish();
      }
      await frame();
    }
  });
  const layout = await page.evaluate(boxes);
  const png = await page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide' });
  const result = { status: response?.status(), png, boxes: layout, errors, refused: await page.evaluate(() => window.__refused) };
  await page.close();
  return result;
}

// ── Pixel comparison, done in a canvas so the repository needs no image library ──
const differ = await chromium.launch();
const diffPage = await differ.newPage();
async function pixelDiff(a, b) {
  return diffPage.evaluate(async ([a64, b64, tolerance]) => {
    const load = (b64) => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = `data:image/png;base64,${b64}`;
    });
    const [a, b] = await Promise.all([load(a64), load(b64)]);
    const w = Math.max(a.width, b.width), h = Math.max(a.height, b.height);
    const pixels = (img) => {
      const c = new OffscreenCanvas(w, h);
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      return g.getImageData(0, 0, w, h).data;
    };
    const pa = pixels(a), pb = pixels(b);
    const out = new ImageData(w, h);
    let changed = 0, top = -1, bottom = -1;
    for (let i = 0; i < pa.length; i += 4) {
      const same = Math.abs(pa[i] - pb[i]) <= tolerance && Math.abs(pa[i + 1] - pb[i + 1]) <= tolerance &&
        Math.abs(pa[i + 2] - pb[i + 2]) <= tolerance && Math.abs(pa[i + 3] - pb[i + 3]) <= tolerance;
      if (same) {
        // The after image, faded, so a change shows where it sits on the page.
        const grey = (pb[i] + pb[i + 1] + pb[i + 2]) / 3;
        out.data[i] = out.data[i + 1] = out.data[i + 2] = 255 - (255 - grey) * 0.25;
        out.data[i + 3] = 255;
        continue;
      }
      changed++;
      const y = Math.floor(i / 4 / w);
      if (top < 0) top = y;
      bottom = y;
      out.data[i] = 230; out.data[i + 1] = 30; out.data[i + 2] = 30; out.data[i + 3] = 255;
    }
    if (!changed) return { changed, total: w * h };
    const c = new OffscreenCanvas(w, h);
    c.getContext('2d').putImageData(out, 0, 0);
    const blob = await c.convertToBlob({ type: 'image/png' });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { changed, total: w * h, rows: [top, bottom], sizes: [[a.width, a.height], [b.width, b.height]], png: btoa(bin) };
  }, [a.toString('base64'), b.toString('base64'), tolerance]);
}

/** The elements whose box differs, in document order, innermost first: an element that moved
 *  while none of its children did is nearer the cause than <main> growing around it. */
function moved(a, b) {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .filter((k) => !a[k] || !b[k] || a[k].some((v, i) => Math.abs(v - b[k][i]) > 0.5));
  const inner = (k) => !keys.some((o) => o.startsWith(`${k}>`));
  return [...keys.filter(inner), ...keys.filter((k) => !inner(k))]
    .map((k) => (!a[k] || !b[k] ? `${k} ${a[k] ? 'gone' : 'new'}` : `${k} [${a[k]}] -> [${b[k]}]`));
}

// ── Run ──
fs.rmSync(out, { recursive: true, force: true });
const launchers = { chromium, webkit, firefox };
const report = [];
let differing = 0;
for (const engine of engines) {
  const browser = await launchers[engine].launch();
  for (const width of widths) {
    const phone = width < 600;
    const options = {
      viewport: { width, height: phone ? 844 : 800 },
      reducedMotion: motion,
      ...(phone && engine !== 'firefox' ? { isMobile: true, hasTouch: true } : {}),
    };
    const contexts = {};
    for (const [name, dist] of Object.entries(builds)) {
      contexts[name] = await browser.newContext(options);
      await serve(contexts[name], dist);
    }
    const dir = path.join(out, `${engine}-${width}`);
    const compareOne = async (route) => {
      const [base, head] = await Promise.all([capture(contexts.base, route), capture(contexts.head, route)]);
      const diff = await pixelDiff(base.png, head.png);
      return { route, base, head, diff };
    };
    for (let i = 0; i < paths.length; i += CONCURRENCY) {
      for (const { route, base, head, diff } of await Promise.all(paths.slice(i, i + CONCURRENCY).map(compareOne))) {
        const boxMoves = moved(base.boxes, head.boxes);
        const notes = [];
        if (base.status !== head.status) notes.push(`status ${base.status} -> ${head.status}`);
        if (head.errors.length > base.errors.length) notes.push(`script errors: ${head.errors.join('; ')}`);
        if (head.refused.length > base.refused.length) notes.push(`policy refusals: ${head.refused.join('; ')}`);
        const same = diff.changed === 0 && boxMoves.length === 0 && notes.length === 0;
        report.push({ engine, width, route, same, changedPixels: diff.changed, totalPixels: diff.total, rows: diff.rows, sizes: diff.sizes, moved: boxMoves.slice(0, 20), movedCount: boxMoves.length, notes });
        if (same) {
          console.log(`same     ${engine} ${width} ${route}`);
          continue;
        }
        differing++;
        const slug = route.replace(/^\/|\/$/g, '').replace(/[/.]/g, '_') || 'home';
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, `${slug}.base.png`), base.png);
        fs.writeFileSync(path.join(dir, `${slug}.head.png`), head.png);
        if (diff.png) fs.writeFileSync(path.join(dir, `${slug}.diff.png`), Buffer.from(diff.png, 'base64'));
        const pct = ((100 * diff.changed) / diff.total).toFixed(3);
        console.log(`DIFFERS  ${engine} ${width} ${route}: ${diff.changed} px (${pct}%)${diff.rows ? `, rows ${diff.rows[0]}-${diff.rows[1]}` : ''}` +
          `${diff.sizes && diff.sizes[0][1] !== diff.sizes[1][1] ? `, height ${diff.sizes[0][1]} -> ${diff.sizes[1][1]}` : ''}` +
          `${boxMoves.length ? `, ${boxMoves.length} boxes moved, first: ${boxMoves[0]}` : ''}${notes.length ? `, ${notes.join(', ')}` : ''}`);
      }
    }
    for (const c of Object.values(contexts)) await c.close();
  }
  await browser.close();
}
await differ.close();
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ base: sha, baseRef, head: headRef ?? 'working tree', engines, widths, motion, pages: paths.length, rows: report }, null, 2));
console.log(`\n${differing ? `${differing} of ${report.length}` : `none of ${report.length}`} page views differ from ${baseRef} (${sha.slice(0, 12)}); ${paths.length} pages, ${engines.join('+')} at ${widths.join(' and ')} px. Report: ${path.relative(process.cwd(), out)}/report.json`);
process.exit(differing ? 1 : 0);
