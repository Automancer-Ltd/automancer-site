# Performance — page weight

`tests/performance.test.ts` is the gate and holds the measured values and their dates. Every
layout page ships the same shared payload (CSS, `main.js`, four variable woff2 fonts, favicons)
plus its own HTML, so one default total budget covers every page the build emits; a new page
needs no entry. Budget = measured + max(1024 B, 2%).

- A page that genuinely needs more gets a `LAYOUT_EXCEPTIONS` entry with its measured value and a
  reason. A stale exception fails the suite.
- A page whose HTML grows with what it publishes (`/releases/`, the whole changelog) is in
  `GROWS_WITH_CONTENT`: it skips only the total, keeps the JS and font checks.
- To re-derive after a deliberate change to the shared payload: `pnpm run build` without a DSN,
  `node tests/support/perf-cli.ts --csv`, update the measured constants and their date in the test.

Measurements use a build without `PUBLIC_AUT_SENTRY_WEB_DSN`, the build CI tests. Production adds
only the Sentry bootstrap described below.

## Decisions behind the numbers

- **Fonts are four variable woff2 files**, one per family, reachable from
  `public/assets/css/fonts.css`. In August 2026 26 static files cost ~87% of every page;
  collapsing them cut a cold visit by ~450 KB. `BaseLayout.astro` preloads exactly the two used
  above the fold on every page (Space Grotesk 400, Syne 800).
- **Sentry loads on the first error, not on page load.** `src/scripts/sentry.ts` registers two
  listeners and imports `@sentry/browser` (~30 KB gzip) only when an uncaught error or rejection
  happens, queueing errors while it loads. Page-load scripts went from 32 KB to 3 KB gzip. The DSN
  stays in the page-load module, where `ops/verify-production.sh` checks its project id. To
  measure with a DSN, build with the dummy
  `PUBLIC_AUT_SENTRY_WEB_DSN='https://0000000000000000@o1.ingest.de.sentry.io/4511769898647632'`
  and sum the gzip size of every `<script src>` in `dist/index.html`.
- **Internal links carry their trailing slash.** GitHub Pages answers `/contact` with a 301 to
  `/contact/`, one round trip per click. `tests/links.test.ts` ("internal page links") fails on
  any slashless internal `href`.
- **Images cannot shift layout:** the only `<img>` elements are the nav and footer logos, both
  with explicit dimensions.
