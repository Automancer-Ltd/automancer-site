/**
 * Shared loader for the production build output (dist/).
 *
 * WHY node-html-parser: the suite needs a small, dependency-light parser
 * with CSS-selector support to audit static HTML. node-html-parser is a
 * single-purpose, fast, forgiving HTML parser with zero transitive deps —
 * ideal for read-only structural assertions. linkedom was the alternative,
 * but it is a much larger DOM-compatibility layer aimed at *running* web
 * platform APIs, which this suite does not need; and neither shim can host
 * axe-core anyway (axe requires a real `window`/`document`, see
 * tests/a11y.test.ts for what we do instead).
 *
 * All pages are parsed exactly once per test process and cached at module
 * scope; the build itself happens once in tests/global-setup.ts.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, type HTMLElement as ParsedElement } from 'node-html-parser';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const DIST = join(ROOT, 'dist');
export const SITE_URL = 'https://automancer.uk';
export const SITE_HOST = new URL(SITE_URL).host;

/** A parsed HTML file emitted into dist/. */
export interface BuiltPage {
  /** URL path as served, e.g. `/`, `/about/`, `/404/`. */
  route: string;
  /** dist-relative POSIX path of the source file, e.g. `about/index.html`. */
  file: string;
  html: string;
  doc: ParsedElement;
  /** The custom 404 page (`dist/404.html`). */
  is404: boolean;
  /**
   * Meta-refresh stub emitted for astro.config.mjs `redirects`
   * (e.g. `/services.html/`). These exist only so old inbound links keep
   * resolving: no SEO/a11y guarantees apply to them, but their links are
   * still checked by tests/links.test.ts.
   */
  isRedirectStub: boolean;
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
function relToDist(absolutePath: string): string {
  return absolutePath.slice(DIST.length + 1).split(/[\\/]/).join('/');
}

/**
 * Map a dist-relative .html file to the route it serves under Astro's
 * default `format: 'directory'` build:
 *   index.html                -> /
 *   about/index.html          -> /about/
 *   404.html                  -> /404/
 *   services.html/index.html  -> /services.html/   (redirect stub)
 */
export function routeFor(relFile: string): string {
  if (relFile === 'index.html') return '/';
  return '/' + relFile.replace(/\/?index\.html$/, '').replace(/\.html$/, '') + '/';
}

let cachedPages: BuiltPage[] | null = null;

/** Every emitted .html file in dist/, parsed once per process. */
export function allHtmlFiles(): BuiltPage[] {
  // Guard against the whole suite passing while examining nothing.
  //
  // Most assertions here are `for (const page of allHtmlFiles())` or
  // `refs.filter(...)`. If this returned an empty array, every one of those
  // would pass VACUOUSLY — zero iterations, an empty offenders list, green.
  // tests/links.test.ts in particular has three assertions and no count of its
  // own, so an empty dist/ would have proved nothing while reporting success.
  //
  // The guard belongs HERE rather than in each test file, because the risk is
  // shared and a per-file check only protects the files that remember it.
  if (!cachedPages) {
    cachedPages = walk(DIST)
      .filter((f) => f.endsWith('.html'))
      .map((f) => {
        const file = relToDist(f);
        // Redirect stubs are emitted as `<name>.html/index.html`.
        const isRedirectStub =
          /(^|\/)[^/]+\.html\/index\.html$/.test(file) && file !== 'index.html';
        const html = readFileSync(f, 'utf8');
        return {
          file,
          route: routeFor(file),
          html,
          doc: parse(html),
          is404: file === '404.html',
          isRedirectStub,
        } satisfies BuiltPage;
      })
      .sort((a, b) => a.route.localeCompare(b.route));
  }
  if (cachedPages.length === 0) {
    throw new Error(
      `No HTML files found in ${DIST}. The production build produced nothing, so ` +
        'every page-level assertion in this suite would pass without examining ' +
        'anything. Run `pnpm run build` and check it succeeded.'
    );
  }
  return cachedPages;
}

/** Pages listed as content (excludes the utility 404 and redirect stubs). */
export function contentPages(): BuiltPage[] {
  return allHtmlFiles().filter((p) => !p.is404 && !p.isRedirectStub);
}

/** Full-layout pages that need SEO and accessibility checks, including the 404. */
export function pageCheckPages(): BuiltPage[] {
  return allHtmlFiles().filter((p) => !p.isRedirectStub);
}

/** Read any emitted file relative to dist/, or null if absent. */
export function readDistFile(relPath: string): string | null {
  const full = join(DIST, relPath);
  return existsSync(full) && statSync(full).isFile()
    ? readFileSync(full, 'utf8')
    : null;
}

/** Does an emitted file exist at this dist-relative path? */
export function distHasFile(relPath: string): boolean {
  const full = join(DIST, relPath);
  return existsSync(full) && statSync(full).isFile();
}

/**
 * Resolve one href/src value against dist/.
 * Returns the dist-relative path of the matching emitted file, or null if
 * nothing was emitted for it (a broken internal reference). Absolute URLs
 * on other origins are not internal — they resolve to null here but are
 * policy-checked separately in tests/links.test.ts.
 */
export function resolveInDist(fromPageFile: string, rawHref: string): string | null {
  let target = rawHref.trim();
  if (!target) return null; // empty href means "this page" — handled by caller

  // Absolute URLs: treat our own origin as internal, anything else external.
  if (/^https?:\/\//i.test(target)) {
    const url = new URL(target);
    if (url.host !== SITE_HOST) return null;
    target = url.pathname + url.search + url.hash;
  }

  // Strip fragment + query; fragments are validated separately.
  target = target.split('#')[0].split('?')[0];
  if (target === '') return fromPageFile; // href="#…" / href="?…" → current page

  try {
    target = decodeURIComponent(target);
  } catch {
    /* malformed escape sequence — resolve the raw bytes instead */
  }

  const base = target.startsWith('/') ? DIST : dirname(join(DIST, fromPageFile));
  const joined = join(base, target);

  // Candidates cover Astro's directory format, plain files, and .html names.
  const candidates = target.endsWith('/')
    ? [join(joined, 'index.html')]
    : [joined, join(joined, 'index.html'), joined + '.html'];

  // GitHub Pages serves the custom not-found page (dist/404.html) for any
  // unmatched route, so links/canonicals pointing at /404 do resolve there.
  if (/\/404\/?$/.test(target)) candidates.push(join(DIST, '404.html'));

  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return relToDist(candidate);
    }
  }
  return null;
}
