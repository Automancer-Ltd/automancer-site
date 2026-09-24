/**
 * Page-weight measurement engine.
 *
 * Measures REAL bytes off the built output in dist/ — never estimates — so
 * that PERFORMANCE.md tables and tests/performance.test.ts budgets are
 * derived from exactly what GitHub Pages serves.
 *
 * What counts towards each column, per page:
 *   html   — the page's own .html bytes, INCLUDING inline <style>, inline
 *            <script> and JSON-LD (they ship inside the HTML; counting them
 *            again under css/js would double-count).
 *   css    — every external stylesheet the page links (<link rel=stylesheet>),
 *            plus stylesheets pulled in via @import.
 *   js     — every external <script src> on the page's own origin.
 *   fonts  — every woff2 reachable from the page's CSS closure (url() targets)
 *            plus <link rel=preload as=font> hrefs: anything the browser could
 *            be made to fetch as a font when loading this page.
 *   images — <img src>, srcset candidates on <img>/<source>, favicon-style
 *            <link rel=icon|apple-touch-icon>, and preload as=image.
 *            og:image meta is deliberately NOT counted: social crawlers fetch
 *            it, visitors' browsers do not, so it is not page weight.
 *
 * Shared assets count once per page that references them (a first-time
 * visitor pays for each asset on every cold page load), which is the metric
 * that matters for this site's phone-heavy audience.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'node-html-parser';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const DIST = join(ROOT, 'dist');

export interface PageMeasurement {
  /** URL path as served, e.g. `/`, `/about/`. */
  route: string;
  /** dist-relative POSIX path of the .html file. */
  file: string;
  htmlBytes: number;
  cssBytes: number;
  jsBytes: number;
  fontBytes: number;
  imageBytes: number;
  totalBytes: number;
  /**
   * Referenced asset paths that do NOT exist in dist/ — always must be empty.
   * A dangling font url() after a prune, or a renamed image, fails loudly here.
   */
  missing: string[];
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** dist-relative POSIX path of an absolute path inside dist/. */
function relToDist(absolute: string): string {
  return absolute.slice(DIST.length + 1).split(/[\\/]/).join('/');
}

function byteSizeIfExists(distRelative: string): number | null {
  const full = join(DIST, distRelative);
  try {
    return statSync(full).isFile() ? statSync(full).size : null;
  } catch {
    return null;
  }
}

/**
 * Resolve a raw href/src/url() value to a dist-relative path, or null when it
 * is not a fetchable same-origin file reference (external origin, data:, …).
 */
function resolveAssetRef(raw: string): string | null {
  let target = raw.trim().replace(/^["']|["']$/g, '');
  if (!target) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) {
    if (!/^https?:/i.test(target)) return null; // data:, mailto:, tel:, …
    let url: URL;
    try {
      url = new URL(target);
    } catch {
      return null;
    }
    if (url.host !== 'automancer.uk') return null;
    target = url.pathname;
  }
  // Strip query/fragment; assets don't use either today but be safe.
  target = target.split('#')[0].split('?')[0];
  if (!target.startsWith('/')) return null; // relative refs unused in this build
  const decoded = (() => {
    try {
      return decodeURIComponent(target);
    } catch {
      return target;
    }
  })();
  const normalized = posix.normalize(decoded.slice(1));
  return normalized === '' ? null : normalized;
}

interface CssRefResult {
  css: Set<string>;
  fonts: Set<string>;
  images: Set<string>;
  missing: string[];
}

/** Parse one CSS file (already read) for url() references and @imports. */
function scanCssText(text: string, result: CssRefResult): void {
  // Follow one level of @import chains (guarding cycles via the css set).
  for (const m of text.matchAll(/@import\s+(?:url\()?["']?([^"')\s]+)/g)) {
    const ref = resolveAssetRef(m[1]);
    if (ref && ref.endsWith('.css') && !result.css.has(ref)) {
      const size = byteSizeIfExists(ref);
      if (size === null) {
        result.missing.push(ref);
        continue;
      }
      result.css.add(ref);
      scanCssText(readFileSync(join(DIST, ref), 'utf8'), result);
    }
  }
  for (const m of text.matchAll(/url\(\s*([^)]+?)\s*\)/g)) {
    // data: URIs are resolved-and-rejected inside resolveAssetRef.
    const ref = resolveAssetRef(m[1]);
    if (!ref) continue;
    if (ref.endsWith('.woff2')) {
      result.fonts.add(ref);
      if (byteSizeIfExists(ref) === null) result.missing.push(ref);
    } else if (/\.(png|jpe?g|webp|avif|gif|ico|svg)$/i.test(ref)) {
      result.images.add(ref);
      if (byteSizeIfExists(ref) === null) result.missing.push(ref);
    }
  }
}

function newCssRefResult(): CssRefResult {
  return { css: new Set(), fonts: new Set(), images: new Set(), missing: [] };
}

/** srcset attribute value → candidate URL list. */
function srcsetCandidates(value: string): string[] {
  // Split on commas not inside a URL: our build uses plain URLs, so splitting
  // on commas followed by whitespace-or-descriptor boundaries is safe.
  return value
    .split(/,(?=\s*(?:https?:\/|\/|\.{0,2}\/))/)
    .map((candidate) => candidate.trim().split(/\s+/)[0])
    .filter(Boolean);
}

/** Measure one built HTML file. `route`/`file` come from the caller's walk. */
function measureHtmlFile(absolutePath: string, route: string, file: string): PageMeasurement {
  const htmlBytes = statSync(absolutePath).size;
  const doc = parse(readFileSync(absolutePath, 'utf8'));
  const refs = newCssRefResult();

  // Stylesheets (+ their @import/url() closures).
  for (const link of doc.querySelectorAll('link[href]')) {
    const rel = (link.getAttribute('rel') ?? '').toLowerCase();
    const href = link.getAttribute('href') ?? '';
    if (rel.split(/\s+/).includes('stylesheet')) {
      const ref = resolveAssetRef(href);
      if (!ref) continue;
      if (ref.endsWith('.css')) {
        const size = byteSizeIfExists(ref);
        if (size === null) {
          refs.missing.push(ref);
          continue;
        }
        refs.css.add(ref);
        scanCssText(readFileSync(join(DIST, ref), 'utf8'), refs);
      }
    } else if (rel.split(/\s+/).some((r) => ['icon', 'apple-touch-icon'].includes(r))) {
      const ref = resolveAssetRef(href);
      if (!ref) continue;
      refs.images.add(ref);
      if (byteSizeIfExists(ref) === null) refs.missing.push(ref);
    } else if (rel === 'preload' && (link.getAttribute('as') ?? '') === 'font') {
      const ref = resolveAssetRef(href);
      if (!ref) continue;
      refs.fonts.add(ref);
      if (byteSizeIfExists(ref) === null) refs.missing.push(ref);
    } else if (rel === 'preload' && (link.getAttribute('as') ?? '') === 'image') {
      const ref = resolveAssetRef(href);
      if (!ref) continue;
      refs.images.add(ref);
      if (byteSizeIfExists(ref) === null) refs.missing.push(ref);
    }
  }

  // External scripts.
  const jsRefs = new Set<string>();
  for (const script of doc.querySelectorAll('script[src]')) {
    const ref = resolveAssetRef(script.getAttribute('src') ?? '');
    if (!ref) continue;
    jsRefs.add(ref);
    if (byteSizeIfExists(ref) === null) refs.missing.push(ref);
  }

  // Content images.
  for (const img of doc.querySelectorAll('img[src], source[src]')) {
    const ref = resolveAssetRef(img.getAttribute('src') ?? '');
    if (!ref) continue;
    refs.images.add(ref);
    if (byteSizeIfExists(ref) === null) refs.missing.push(ref);
  }
  for (const el of doc.querySelectorAll('img[srcset], source[srcset]')) {
    for (const candidate of srcsetCandidates(el.getAttribute('srcset') ?? '')) {
      const ref = resolveAssetRef(candidate);
      if (!ref) continue;
      refs.images.add(ref);
      if (byteSizeIfExists(ref) === null) refs.missing.push(ref);
    }
  }

  const sum = (paths: Iterable<string>): number =>
    [...paths].reduce((total, p) => total + (byteSizeIfExists(p) ?? 0), 0);

  const cssBytes = sum(refs.css);
  const jsBytes = sum(jsRefs);
  const fontBytes = sum(refs.fonts);
  const imageBytes = sum(refs.images);

  return {
    route,
    file,
    htmlBytes,
    cssBytes,
    jsBytes,
    fontBytes,
    imageBytes,
    totalBytes: htmlBytes + cssBytes + jsBytes + fontBytes + imageBytes,
    missing: [...new Set(refs.missing)].sort(),
  };
}

function routeFor(relFile: string): string {
  if (relFile === 'index.html') return '/';
  if (relFile === '404.html') return '/404/';
  // Redirect stubs are emitted as <name>.html/index.html; keeping the .html
  // in the route keeps them distinct from the real page at /<name>/.
  const withSlash = relFile.replace(/\/index\.html$/, '/');
  if (withSlash !== relFile) return '/' + withSlash;
  return '/' + relFile.replace(/\.html$/, '.html/');
}

let cachedMeasurements: PageMeasurement[] | null = null;

/** Every emitted .html page in dist/, measured against real bytes on disk. */
export function measureAllPages(): PageMeasurement[] {
  // Guard against the whole suite passing while examining nothing.
  //
  // tests/performance.test.ts budgets are `for (const p of layoutPages)` and
  // `pages.flatMap(...)`. If this returned an empty array, every one of those
  // would pass VACUOUSLY — zero iterations, an empty offenders list, green.
  // The stub-size check has its own count, but the layout budgets and the
  // dangling-asset assertion do not, so an empty dist/ would have proved
  // nothing while reporting success.
  //
  // Same shape as tests/support/dist.ts allHtmlFiles(): belong HERE rather
  // than in each test, because the risk is shared.
  if (!cachedMeasurements) {
    cachedMeasurements = walk(DIST)
      .filter((f) => f.endsWith('.html'))
      .map((f) => {
        const file = relToDist(f);
        return measureHtmlFile(f, routeFor(file), file);
      })
      .sort((a, b) => a.route.localeCompare(b.route));
  }
  if (cachedMeasurements.length === 0) {
    throw new Error(
      `No HTML files found in ${DIST}. The production build produced nothing, so ` +
        'every page-level assertion in this suite would pass without examining ' +
        'anything. Run `pnpm run build` and check it succeeded.'
    );
  }
  return cachedMeasurements;
}
