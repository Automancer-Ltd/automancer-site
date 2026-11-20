// @ts-check
import { defineConfig } from 'astro/config';
import { readFileSync, writeFileSync } from 'node:fs';
import sitemap from '@astrojs/sitemap';
import { pageDates } from './src/integrations/page-dates';
import { preloadStylesheets } from './src/integrations/preload-stylesheets';

/**
 * Where browser error reports go: the origin of the Sentry DSN this build
 * bakes into src/scripts/sentry.ts, or nothing when the build has no DSN
 * (development and preview builds). Every page may send to it and to its
 * own origin, and nowhere else; tests/csp.test.ts fails if a built page's
 * policy and the bundled DSN disagree.
 */
const SENTRY_DSN = process.env.PUBLIC_AUT_SENTRY_WEB_DSN;
const reportOrigin = SENTRY_DSN ? new URL(SENTRY_DSN).origin : null;

/**
 * Sitemap <lastmod>, read from the built /api/pages.json so the two cannot
 * disagree. Every page there carries a real date: when its words last changed
 * on the live site (src/integrations/page-dates.ts dates the file first). The
 * sitemap is written after every page and after that hook, so the file exists.
 */
/** @type {Map<string, string> | undefined} */
let pageDatesByUrl;
/** @param {import('@astrojs/sitemap').SitemapItem} item */
function withLastmod(item) {
  pageDatesByUrl ??= new Map(
    JSON.parse(readFileSync(new URL('./dist/api/pages.json', import.meta.url), 'utf8')).pages.map(
      (/** @type {{url: string, lastModified: string}} */ p) => [p.url, p.lastModified]
    )
  );
  const lastmod = pageDatesByUrl.get(item.url);
  return lastmod ? { ...item, lastmod } : item;
}

/**
 * /.well-known/ endpoints.
 *
 * Astro's page scanner ignores dotted directories, so these two routes are
 * injected explicitly. The handlers live in src/data/ next to the modules
 * they are generated from (business facts, build provenance).
 *
 * Until 22 Oct 2026 the deploy's artifact upload dropped dot-prefixed paths,
 * so /.well-known/ answered 404 and the non-dot twins /agent.json and
 * /security.txt (ordinary pages in src/pages/) became the advertised copies.
 * Both copies render from the same data modules — one source, no drift.
 */
/** @type {import('astro').AstroIntegration} */
const wellKnownRoutes = {
  name: 'well-known-routes',
  hooks: {
    'astro:config:setup': ({ injectRoute }) => {
      injectRoute({
        pattern: '/.well-known/agent.json',
        entrypoint: './src/data/wellknown-agent.ts',
        prerender: true,
      });
      injectRoute({
        pattern: '/.well-known/security.txt',
        entrypoint: './src/data/wellknown-security.ts',
        prerender: true,
      });
      injectRoute({
        pattern: '/.well-known/ard.json',
        entrypoint: './src/data/wellknown-ard.ts',
        prerender: true,
      });
      injectRoute({
        pattern: '/.well-known/api-catalog',
        entrypoint: './src/data/wellknown-api-catalog.ts',
        prerender: true,
      });
    },
  },
};

const REDIRECTS = {
  // Targets carry the trailing slash GitHub Pages serves. Pages itself
  // answers /x.html with a 301 to /x.html/ and then this stub; the edge
  // Worker (ops/edge/worker.js LEGACY_REDIRECTS) answers one real 301
  // instead. tests/edge-worker.test.ts keeps the two lists in step.
  '/services.html': '/services/',
  '/about.html': '/about/',
  '/book.html': '/contact/',
  '/privacy.html': '/privacy/',
  '/terms.html': '/terms/',
};

// Astro's security.csp only injects <meta> policies into .astro pages, not into
// generated meta-refresh redirect stubs. Stamp the stubs too so every HTML file
// in dist/ enforces default-src 'none' and Trusted Types even if GitHub Pages
// is reached directly (for example while DNS-only during cert renewal).
const STUB_CSP =
  '<meta http-equiv="content-security-policy" content="default-src \'none\'; base-uri \'self\'; form-action \'none\'; script-src-attr \'none\'; style-src-attr \'unsafe-inline\'; require-trusted-types-for \'script\'; trusted-types \'none\'">';

/** @type {import('astro').AstroIntegration} */
const stubCsp = {
  name: 'redirect-stub-csp',
  hooks: {
    'astro:build:done': ({ dir }) => {
      for (const route of Object.keys(REDIRECTS)) {
        const file = new URL(`${route.slice(1)}/index.html`, dir);
        const html = readFileSync(file, 'utf8');
        if (!html.includes('http-equiv="content-security-policy"')) {
          writeFileSync(file, html.replace('<title>', `${STUB_CSP}<title>`));
        }
      }
    },
  },
};

// https://astro.build/config
export default defineConfig({
  site: 'https://automancer.uk',
  output: 'static',
  // Astro and InlineScript authorize approved script bytes at build time. Unhashed
  // inline JavaScript and eval stay blocked; the external application script
  // and lazy Sentry modules load from our origin. Turnstile is the only
  // third-party script source, added only by contact.astro.
  //
  // Everything else a page may load or send to is listed too, starting from
  // nothing (default-src 'none'), so the browser itself enforces "no
  // tracking": a page can talk only to this site and the error-report origin.
  // contact.astro adds the enquiry API and the Turnstile frame for that page
  // alone. The edge Worker's header adds frame-ancestors, which a <meta>
  // policy cannot carry. Method and checks: docs/DEPLOYMENT.md.
  //
  // Trusted Types (require-trusted-types-for): the browser refuses any plain
  // string written into a place that turns text into HTML or code (innerHTML,
  // insertAdjacentHTML, document.write, a script's src or text, on* attributes).
  // An injected string can then add no markup, link, form or script at all, even
  // through code the policy lets run. BaseLayout names the policies a page may
  // create: none, except /contact/'s one-URL Turnstile loader.
  security: {
    csp: {
      directives: [
        "default-src 'none'",
        `connect-src 'self'${reportOrigin ? ` ${reportOrigin}` : ''}`,
        "img-src 'self' data:",
        "font-src 'self'",
        "manifest-src 'self'",
        "form-action 'self'",
        "base-uri 'self'",
        "require-trusted-types-for 'script'",
      ],
      scriptDirective: {
        resources: [
          "'self'",
          { resource: "'none'", kind: 'attribute' },
        ],
      },
      // Existing pages and animation code use inline style attributes. Allow
      // those separately, while keeping <style> elements hash-protected.
      styleDirective: {
        resources: ["'self'", { resource: "'unsafe-inline'", kind: 'attribute' }],
      },
    },
  },
  // Legacy URLs from the pre-2026 hand-written site; emitted as meta-refresh
  // pages so old inbound links and search entries keep resolving.
  redirects: REDIRECTS,
  // Draft case studies / field notes (draft: true) are excluded from the
  // production build at page-generation time (see getStaticPaths in
  // work/[slug].astro + field-notes/[slug].astro and both index pages), so a
  // draft is never emitted as a page and therefore never enters the sitemap.
  // pageDates must come before sitemap: its build:done hook dates
  // dist/api/pages.json, which the sitemap's build:done hook then reads.
  integrations: [pageDates(), sitemap({ serialize: withLastmod }), wellKnownRoutes, stubCsp, preloadStylesheets()],
});
