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

- **Fonts are four variable woff2 files**, one per family, declared in `src/styles/fonts.css`
  and bundled into the page stylesheet. In August 2026 26 static files cost ~87% of every page;
  collapsing them cut a cold visit by ~450 KB. `BaseLayout.astro` preloads exactly the two used
  above the fold on every page (Space Grotesk, Syne).
- **The fonts carry only the characters the site shows (t19380, 12 Nov 2026).** The Google Fonts
  latin files held ~225 characters each, mostly accented letters no page uses.
  `ops/fonts/subset.py` cuts the full files in `ops/fonts/source/` down to
  `ops/fonts/charset.txt` (printable ASCII plus the punctuation, currency and symbols the pages
  use), keeping every weight (still variable), hinting, kerning, ligatures and the numeral forms the
  CSS asks for. The four files went 120,620 → 83,044 B; heaviest page 214,010 → 174,317 B.
  They are Vite assets now, so each has a content-hashed `/_astro/` URL kept for a year, and the
  separate render-blocking `fonts.css` request is gone. Full-page screenshots of all 31 pages at
  1280 and 390 px were pixel-identical before and after, apart from the footer's live deploy clock.
  `tests/fonts.test.ts` reads each built font's character map and fails when a page shows a
  character the full font has but the subset dropped (a field note with "é", say): add it to
  `charset.txt`, rerun the script, commit both. Measured on production before and after the merge
  (`ops/perf/cold-visit.mjs`, headless Chromium from omarchy, 390 px phone, fresh cache each round,
  medians of 9 rounds on Slow 4G 150 ms / 1.6 Mbps and 7 rounds on 300 ms / 400 kbps):

  | Cold phone visit | Slow 4G before → after | 400 kbps before → after |
  | --- | --- | --- |
  | Home: bytes, requests | 116.2 → 87.3 KB, 9 → 8 | same |
  | Home: first / largest paint | 720 / 920 → 672 / 872 ms | 1644 / 2128 → 1620 / 1892 ms |
  | Home: last font arrived | 1011 → 931 ms | 2988 → 2490 ms |
  | Home: layout shift | 0 → 0 | 0.049 → 0 |
  | Field note: bytes | 148.7 → 110.1 KB | same |
  | Field note: first paint | 712 → 668 ms | 1640 → 1604 ms |
  | Field note: last font arrived | 1172 → 1055 ms | 3663 → 2930 ms |

  Preloading JetBrains Mono as well (it is on every page) was tried and left out: the fonts
  finished sooner, but it competed with the stylesheet and delayed first paint by ~100 ms.
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
- **Page-to-page clicks are instant in Chromium browsers (t18679, 12 Nov 2026).** `BaseLayout.astro`
  publishes Speculation Rules: a page's HTML is fetched when the pointer first touches a link to it
  (`eager`: on desktop a short hover), and the page is prerendered after a 200 ms hover or a press
  (`moderate`), reusing that fetch. Same origin only: no request goes anywhere a click would not.
  `/contact/` is fetched but never prerendered, because rendering it would load the third-party
  security check before the visitor chose the form. Files (`*.md`, `*.json`, `*.txt`, `*.xml`,
  images) are never speculated. `main.js` waits for `prerenderingchange`, so reveals and the typed
  line play when the page is seen, as on a normal load. Firefox and Safari ignore the rules.
  Measured in headed Chromium with no DevTools attached (DevTools disables prerendering, so a
  Playwright or CDP-driven test never sees it), on a local copy with a 200 ms first-byte delay as
  production showed: five-click journey, 300 ms hover, 25 clicks a side, median perceived LCP
  344 ms → 96 ms (p75 368 → 142 ms); with a 400 ms delay 532 → 202 ms. Every click was served
  from a prerendered page, and only hovered pages were fetched. Re-measure with
  `ops/perf/nav-journey.mjs` (usage in its header), never with a Playwright test.
- **Returning visitors paint from their own cache (t18923, 12 Nov 2026).** GitHub Pages sends
  `max-age=600` on every file, so a visit more than ten minutes after the last one re-asked for all
  eight files the home page loads (stylesheets, fonts, scripts, logo) before painting. The edge
  Worker's `cachePolicy` keeps content-addressed files (`/_astro/*`, `main.js?v=<commit>`) for a year
  as `immutable` and unversioned fonts, images and `fonts.css` for a day with a week of
  `stale-while-revalidate`, in browsers and at the Cloudflare edge; pages keep ten minutes.
  Measured on production with `ops/perf/repeat-visit.mjs` (headless Chromium, 390 px, 7 rounds,
  second visit 11 minutes after the first): requests on the repeat visit 8 → 0; median first
  paint 192 → 112 ms direct from auto-bee, and 404 → 208 ms with 150 ms added per request (a phone
  on mobile data), where the load event moved 547 → 197 ms.
- **Images cannot shift layout:** the only `<img>` elements are the nav and footer logos, both
  with explicit dimensions.
