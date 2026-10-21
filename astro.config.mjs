// @ts-check
import { defineConfig } from 'astro/config';
import { readFileSync } from 'node:fs';
import sitemap from '@astrojs/sitemap';

/**
 * Sitemap <lastmod>, read from the built /api/pages.json so the two cannot
 * disagree. Only case studies and field notes carry a real date; any other
 * page would get the build time, which is not when it changed, so it gets no
 * lastmod at all. The sitemap is written after every page, so the file exists.
 */
/** @type {Map<string, string> | undefined} */
let entryDates;
/** @param {import('@astrojs/sitemap').SitemapItem} item */
function withLastmod(item) {
  entryDates ??= new Map(
    JSON.parse(readFileSync(new URL('./dist/api/pages.json', import.meta.url), 'utf8'))
      .pages.filter((/** @type {{type: string}} */ p) => p.type === 'CaseStudy' || p.type === 'BlogPosting')
      .map((/** @type {{url: string, lastModified: string}} */ p) => [p.url, p.lastModified])
  );
  const lastmod = entryDates.get(item.url);
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

// https://astro.build/config
export default defineConfig({
  site: 'https://automancer.uk',
  output: 'static',
  // Legacy URLs from the pre-2026 hand-written site; emitted as meta-refresh
  // pages so old inbound links and search entries keep resolving.
  redirects: {
    // Targets carry the trailing slash GitHub Pages serves, so an old link
    // takes one hop, not two.
    '/services.html': '/services/',
    '/about.html': '/about/',
    '/book.html': '/contact/',
    '/privacy.html': '/privacy/',
    '/terms.html': '/terms/',
  },
  // Draft case studies / field notes (draft: true) are excluded from the
  // production build at page-generation time (see getStaticPaths in
  // work/[slug].astro + field-notes/[slug].astro and both index pages), so a
  // draft is never emitted as a page and therefore never enters the sitemap.
  integrations: [sitemap({ serialize: withLastmod }), wellKnownRoutes],
});
