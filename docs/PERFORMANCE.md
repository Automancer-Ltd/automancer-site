# Performance — page weight

`tests/performance.test.ts` is the gate and holds the measured values and their dates. Every
layout page ships the shared layout assets plus its own HTML and styles. One default total
budget covers every page the build emits. A new page needs no entry.
Budget = measured + max(1024 B, 2%).

- A page that genuinely needs more gets a `LAYOUT_EXCEPTIONS` entry with its measured value and a
  reason. A stale exception fails the suite.
- A page whose HTML grows with what it publishes (`/releases/`, the whole changelog) is in
  `GROWS_WITH_CONTENT`: it skips only the total, keeps the JS and font checks.
- To re-derive after a deliberate change to the shared payload: `pnpm run test` (it builds),
  `node tests/support/perf-cli.ts --csv`, update the measured constants and their date in the test.

Measurements use the build the tests make: monitoring on, with the dummy DSN in
`tests/support/build-env.ts`, the same shape production ships. `deploy.yml` runs the budgets on the
exact `dist/` it publishes, so a heavier production build fails the release instead of shipping.

## Decisions behind the numbers

- **Case cards link the evidence behind their figures (t23577, 21 Nov 2026).**
  The home page's case cards now carry a Sources link beside "Read", which needs the title's link
  stretched over the card instead of the whole card being one link (a link cannot hold another).
  That is 1,651 B more on `/` (markup and about 1 KB of inline card CSS), 155,082 → 156,733 B, so
  `LAYOUT_MEASURED` was re-measured at 156,733 B. Main had already grown 2,208 B past the old
  figure (152,874 B) through the day's footer link and hover prefetch, inside its headroom.

- **Link preview images take half the bytes (t23539, 21 Nov 2026).**
  The build passes resvg's RGBA pixels straight to Sharp's lossless PNG encoder. Compression
  level 9 without adaptive filtering worked best for the repeated colours in the glows.
  Across 31 cards, all 1200×630 decoded pixel buffers match the previous build exactly.
  The cards total 3,620,050 → 1,796,578 B, and the largest is 66,919 B. The dist audit caps
  each card at 80,000 B.

  For each page below, the probe fetched its HTML, followed its `og:image` and timed the
  image request through Chromium's decode. Five interleaved cold image loads per build
  through the local edge Worker, 300 ms latency and 400 kbps, medians:

  | Shared page | PNG bytes before → after | Time to decoded image before → after |
  | --- | ---: | ---: |
  | Home | 134,020 → 66,919 | 3.01 → 1.69 s |
  | Services | 130,188 → 66,319 | 2.95 → 1.66 s |
  | What does an AI agent actually cost? | 120,389 → 60,048 | 2.74 → 1.54 s |

- **Page-to-page clicks are quick in Firefox and Safari too (t23288, 21 Nov 2026).**
  Firefox and Safari do not act on the Speculation Rules below, so every click there waited a
  whole round trip for the next page's HTML. `src/scripts/prefetch.ts` (in the page-load module)
  now fetches a page's HTML into the browser's own cache once a mouse rests on a link to it for
  65 ms, in any browser that cannot prerender (`'prerendering' in document` is false). It fetches
  exactly what the rules prefetch: this site's pages, never a file, never a `download`,
  `target=_blank` or `nofollow` link or the page already open, each once per page view, nothing on
  Save-Data (`tests/speculation-rules.test.ts` holds it to the rules on every built link). The
  request carries the navigation's own `Accept`, because the Worker sends `Vary: Accept`: with
  fetch()'s default `*/*` the click would not reuse it. Two traps found while measuring: Safari's
  WebKit answers `HTMLScriptElement.supports('speculationrules')` with true yet fetched nothing for
  these rules, so that is not the test; and a tap is shorter than the page's round trip, while
  neither engine hands a fetch still under way to the click, so fetching on a press or tap only
  downloaded the page twice. Taps and presses therefore fetch nothing, and the tap figures below
  are unchanged. Measured with `ops/perf/click-wait.mjs` (`dist/` served locally with production's
  cache headers and 200 ms before each page's first byte; 5 fresh browsers with a profile on disk,
  `--persistent`, 5 nav clicks each; time from pressing the button to the next page's first paint):

  | Click to first paint, median (p75) | before | after | from the cache |
  | --- | ---: | ---: | ---: |
  | Firefox 159, 300 ms hover (auto-bee) | 365 (383) ms | 117 (139) ms | 5 → 25 of 25 |
  | Safari's WebKit 27.2, 300 ms hover (m6) | 327 (330) ms | 120 (124) ms | 5 → 25 of 25 |
  | Firefox 159, tap (no hover, 90 ms press) | 331 ms | 332 ms | 5 → 5 of 25 |
  | WebKit 27.2, tap | 336 ms | 336 ms | 5 → 5 of 25 |

  Chromium is unchanged: the script stops at once there, and its prerendered or prefetched clicks
  measure 135 ms in the same harness. Cost: about 1,160 B of script on every page (about 500 B
  gzipped; `MEASURED_JS` re-pinned) and, per hovered link, one page of HTML the visitor may not
  open (about 17 KB compressed), as Chromium's rules already cost. Phones gain nothing yet: no
  hover, and a tap is too short.

- **Firefox keeps the page's shape while the web fonts load (t23138, 21 Nov 2026).**
  Firefox never starts a `local()` fallback face by itself while the web font before it is
  pending: it drew the waiting text in its default font, so t23013's and t23067's faces did
  nothing there and every line re-wrapped when the fonts landed. The first thing in `<body>` is
  now one hashed inline script that calls `load()` on every `* Fallback` face. It runs after the
  head's styles are parsed and before any text. It fetches nothing (the faces are `local()` only);
  a face whose font is not installed (Roboto on a Mac) fails quietly, and a browser without
  `document.fonts` skips it. `tests/fonts.test.ts` fails if a page lacks it or declares a face
  after it. Measured with `ops/perf/font-swap.mjs --engine=firefox` on m6 (Mac, Firefox 159), all
  32 pages:

  | Firefox, all 32 pages | 390 px before → after | 1280 px before → after |
  | --- | ---: | ---: |
  | Page height change, median | 87 → 23 px | 99 → 63 px |
  | A text block moved, median | 45 → 1 px | 68 → 1 px |

  Firefox now matches Chromium and WebKit (23 px and 62-63 px height, 0 px moved); those two are
  unchanged (Chromium 390 px layout shift sum 0.058, 1280 px 0.140). Firefox reports no layout
  shift score. Settled pages are unchanged: `pnpm run compare` found none of 192 views (Chromium,
  Firefox, WebKit at 390 and 1280 px) differing from main. Cost: 231 B of HTML per page.

- **Android text keeps its place when the web fonts arrive (t23067, 21 Nov 2026).**
  t23013's fallback faces are drawn in Arial, which Android does not have, so an Android phone
  skipped them and drew the waiting text in Roboto at its own size; every line re-wrapped when
  the fonts landed. Each web font now has a second face right after the first,
  `<family> Android Fallback`: Roboto (Droid Sans Mono for JetBrains Mono) sized the same way by
  `ops/fonts/fallbacks.py`, from the copies in `ops/fonts/stand-ins/`. `local()` names both
  Android 5-11's static files and Android 12's one variable `Roboto-Regular` (Chrome draws its
  bold through the weight axis: checked with only that file installed, bold widths within 1%).
  A device with Arial never reaches the Android face. The hero headline gets it after its own
  `Syne Hero Fallback`. Measured with `ops/perf/android-fonts.py` (a fontconfig with only
  Android's fonts) and `ops/perf/font-swap.mjs --dpr=3`, headless Chromium, all 32 pages:

  | Android phone, all 32 pages | 390 px before → after | 412 px before → after |
  | --- | ---: | ---: |
  | Layout shift, sum | 1.536 → 0.100 | 1.456 → 0.178 |
  | Layout shift, worst page | 0.296 → 0.028 | 0.181 → 0.058 |
  | Pages over 0.1 (Google's "needs improvement") | 4 → 0 | 4 → 0 |
  | Page height change, median | 151 → 61 px | 144 → 58 px |
  | A text block moved, median | 102 → 39 px | 115 → 36 px |

  Home at 390 px: the page grew 607 px when the fonts landed, now 31 px; /developers/ scored
  0.296 (Google's "poor" starts at 0.25), now 0.002. What still moves is a line close to wrapping
  that flips, as on desktop: the same Linux measurement of t23013's Arial faces gives 0.136 and
  58 px, where a Mac measured almost nothing, so the remainder is partly Linux's glyph rounding.
  Settled pages are unchanged: `pnpm run compare` found no view differing from main, with the
  normal fonts and again with `FONTCONFIG_FILE` set to the Android fonts. Cost: 3,065 B of inline
  CSS on every page (about 270 B gzipped); `LAYOUT_MEASURED` and the `/contact/` exception were
  re-pinned. Not yet seen on a physical Android phone.

- **Text keeps its place when the web fonts arrive (t23013, 21 Nov 2026).**
  Every font is `font-display: swap`, so a visitor on a slow connection first reads the page in
  an installed font, and every line used to re-wrap when Syne, Space Grotesk, Outfit and JetBrains
  Mono landed. Each web font now has a `<family> Fallback` face right after it in the stacks: Arial
  (or Liberation Sans, Arimo) or Courier New scaled with `size-adjust` to the web font's average
  letter width in the site's own words, kerning included, with its ascent and descent.
  `ops/fonts/fallbacks.py` writes them into `src/styles/fonts.css`; Syne gets one per weight
  (its 800 is half as wide again as its 700). Each face's `unicode-range` is its web font's
  characters, so once the fonts load every character renders as before (`pnpm run compare`: no
  view differs). `ops/perf/font-swap.mjs` holds the fonts back on every sitemap page, then
  releases them, and measures the move. All 32 pages, medians, run on a Mac (m6, real Arial):

  | Engine, width | Layout shift, sum of 32 pages | Page height change | A text block moved |
  | --- | ---: | ---: | ---: |
  | Chromium, 390 px | 0.900 → 0.058 | 93 → 23 px | 67 → 0 px |
  | Chromium, 1280 px | 0.711 → 0.133 | 127 → 62 px | 89 → 0 px |
  | WebKit, 390 px | (not reported) | 91 → 23 px | 70 → 0 px |
  | WebKit, 1280 px | (not reported) | 103 → 63 px | 84 → 0 px |

  What still moves is a line that sat within a fraction of a percent of wrapping and flips (the
  Syne 700 "Sounds like your Tuesday?" heading at 1280 px). Headless Chromium on Linux rounds
  glyph advances to whole pixels at reading sizes, which skews its absolute numbers (a field note
  on a phone went from shrinking 532 px to 65 px there). Firefox did not start loading a local
  fallback face while the web font was pending, so it drew its default font and gained
  nothing until t23138; Android has no Arial and falls through to Roboto as before. Cost: 3,518 B of inline CSS
  on every page, about 450 B gzipped; `LAYOUT_MEASURED` and the `/contact/` exception were
  re-pinned. Measured with the fonts held until the page settled, not on a network: what a
  visitor sees on a slow connection, without timing claims.
- **Every page paints without a stylesheet request (t22772, 21 Nov 2026).**
  Astro embeds the compiled CSS and adds its hash to each page's CSP. On
  seven interleaved visits per build over local HTTP/2 with Brotli (390 px
  Chromium, 300 ms latency, 400 kbps), median first content appeared at:

  | Visit | Before | After |
  | --- | ---: | ---: |
  | Services, cold | 1,336 ms | 716 ms |
  | Field Notes, cold | 1,264 ms | 668 ms |
  | Work, cold | 1,264 ms | 684 ms |
  | Home, cold | 732 ms | 712 ms |
  | Services after Home | 860 ms | 564 ms |
  | Field Notes after About | 428 ms | 512 ms |

  Cold visits to Services, Field Notes and Work sent 0.6–1.1 KB less.
  Moving from About to Field Notes sent 5.1 KB more because the separate
  stylesheet had already been cached. While waiting for fonts on cold visits,
  layout shift went from 0.022 to 0.035 on Services and 0 to 0.029 on Work.
  The settled styles are byte-identical in cascade order.
- **The homepage paints without a stylesheet request (t22482, 20 Nov 2026).**
  The build embedded Astro's compiled homepage stylesheet in its cascade position
  and added its SHA-256 hash to the page CSP. Other pages still shared
  the content-hashed file at the time. On seven interleaved cold Chromium phone visits per
  build (390 px, 300 ms latency, 400 kbps, local HTTP/2 with Brotli), median
  first and largest paint both fell from 1,368 to 728 ms. The median layout
  shift was 0 before and 0.0004 after. An immediate second navigation to
  `/services/` in the same browser context now fetches the common CSS, adding
  108 ms to median first paint (804 → 912 ms). Across that two-page test, the
  median sum of the two first-paint waits fell from 2,148 to 1,688 ms.
- **/contact/ carries the service choice (t22871, 21 Nov 2026).** The form asks "What
  are you interested in?" with one card per published service and its from-price, picked in
  advance from `?service=<id>` when the visitor comes from an offer's button. The markup, its
  styles and the script add 4,887 B, so /contact/ (153,881 B) has its own entry in
  `LAYOUT_EXCEPTIONS`; every other page keeps the 148,994 B default.
- **The browser starts stylesheet requests at the start of the head (t22318, 20 Nov
  2026).** Astro emits the stylesheet links after page metadata and inline CSS.
  The static build now emits preload hints for those same hashed files just after
  the viewport and CSP tags, with the two existing font hints first to keep the
  home headline steady as it paints. The stylesheet links keep their original
  cascade order and cache URLs. The policy and the blocks it hashes retain their
  exact bytes. The dist audit checks that every layout page, including the custom
  404, gives the browser the right hints early in the head.
- **JetBrains Mono keeps its slash ligatures (t22274, 20 Nov 2026).** The site
  uses `//` in URLs and labels. The subset keeps the rules for repeated
  slashes and drops the other programming ligatures. The font fell
  from 24,836 to 10,232 B. The four fonts now total 68,440 B, and the heaviest
  fixed-budget page is 148,994 B (/contact/).
- **Page styles load where they are used (t22218, 20 Nov 2026).** Shared layout and
  design tokens stay in `src/styles/global.css`. A page's own selectors live in
  its Astro template. Routes import the styles they share, such as the home
  and developer hero, prose, and case cards. Astro inlines small stylesheets and
  links the larger ones at content-hashed URLs. The weight audit counts inline
  CSS in HTML and follows its asset references. The heaviest fixed-budget page
  is now 163,598 B (/contact/), so the total budget was tightened to match.
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
- **The SDK chunk carries only what the site uses (t21303, 20 Nov 2026).** Taking the dynamic
  import as a namespace (`.then((Sentry) => Sentry.init(…))`) stopped Rollup tree-shaking it, so the
  first error on a page downloaded all of `@sentry/browser`: session replay, the feedback widget, the
  offline transport (IndexedDB) and linked traces (sessionStorage), none of them enabled. Naming the
  seven exports in the import's destructuring cut that chunk from 423,059 B (140,298 B gzip) to
  90,703 B (31,002 B gzip), and it now references no storage API. Nothing caught it because the
  tests built without a DSN and never saw the chunk; they now build with monitoring on, and
  `tests/performance.test.ts` pins the chunk's size.
- **Internal links carry their trailing slash.** GitHub Pages answers `/contact` with a 301 to
  `/contact/`, one round trip per click. `tests/links.test.ts` ("internal page links") fails on
  any slashless internal `href`.
- **The contact page's security check loads after the page (t21450, 20 Nov 2026).** Turnstile's
  `api.js` used to load from `<head>`, so arriving on `/contact/` started ~250 KB of Cloudflare
  downloads and their scripts while the page itself was still loading. On a phone at 400 kbps that
  traffic held up the page's own fonts (text set at 3.0 s against 2.5 s on `/services/`, live,
  `ops/perf/cold-visit.mjs`); on Android, where Chrome keeps a cross-site frame on the page's own
  main thread, it blocked that thread for ~0.5 s. It also kept `/contact/` out of hover
  prerendering. `contact.astro` now injects `api.js?render=explicit` and renders the widget into
  its reserved slot on the first scroll, the first focus, tap or keystroke in the form, the check
  coming within 400 px of the screen, or 2 s after the load event, whichever comes first. The scroll
  trigger is deliberate: loading on the first keystroke alone moved Turnstile's work into typing
  and slowed the slowest keystroke 40 → 272 ms on that Android profile; a phone scrolls off the main
  thread, so work started there has finished before most visitors type. The 2 s fallback covers a
  visitor who reads, never scrolls, and taps the first field. Submit before the check has loaded
  asks for the check, as it did before a token arrived. Measured with `ops/perf/contact-cost.mjs`
  (both builds served at the production address by Playwright, real Turnstile over Slow 4G, 4x CPU,
  Android site isolation off, 7 rounds, medians):

  | `/contact/` on a phone | before | after |
  | --- | --- | --- |
  | Cloudflare bytes by load + 1 s | 248 KB (3 requests) | 0 |
  | Main-thread blocking by load + 1 s | 521 ms (busy 740 ms) | 54 ms (busy 104 ms) |
  | Slowest keystroke, typing at 8 s without scrolling | 48 ms (worst 56) | 48 ms (worst 80) |
  | Slowest keystroke, reader who scrolls to the form then types | 40 ms (worst 224) | 64 ms (worst 96) |

  Hovering a link to `/contact/` now prerenders it (`ops/perf/nav-journey.mjs` with
  `JOURNEY=/contact/,/services/,/contact/,/about/,/contact/,/`, 5 rounds, 200 ms first byte): 30 of 30
  clicks served from a prerendered page (was 15 of 30), `/contact/` perceived LCP 120 → 69 ms.
  `tests/speculation-rules.test.ts` now holds the reason prerendering is safe: no prerendered page
  loads anything from another site as it renders. The widget, once loaded, is the same
  (screenshots identical). The privacy notice already describes Turnstile as running on the
  contact page while it defends the form; a visitor who leaves within two seconds of the page
  loading, without scrolling, now gets none of it.
- **Page-to-page clicks are instant in Chromium browsers (t18679, 12 Nov 2026).** `BaseLayout.astro`
  publishes Speculation Rules: a page's HTML is fetched when the pointer first touches a link to it
  (`eager`: on desktop a short hover), and the page is prerendered after a 200 ms hover or a press
  (`moderate`), reusing that fetch. Same origin only: no request goes anywhere a click would not.
  `/contact/` was fetched but not prerendered until t21450 moved its third-party security check
  after the page load. Files (`*.md`, `*.json`, `*.txt`, `*.xml`,
  images) are never speculated. `main.js` waits for `prerenderingchange`, so reveals and the typed
  line play when the page is seen, as on a normal load. Firefox and Safari ignore the rules.
  Measured in headed Chromium with no DevTools attached (DevTools disables prerendering, so a
  Playwright or CDP-driven test never sees it), on a local copy with a 200 ms first-byte delay as
  production showed: five-click journey, 300 ms hover, 25 clicks a side, median perceived LCP
  344 ms → 96 ms (p75 368 → 142 ms); with a 400 ms delay 532 → 202 ms. Every click was served
  from a prerendered page, and only hovered pages were fetched. Re-measure with
  `ops/perf/nav-journey.mjs` (usage in its header), never with a Playwright test. Firefox and
  Safari get a hover prefetch instead (t23288, above).
- **Send on the contact form pays only for the POST (t20932, 19 Nov 2026).** The form posts JSON
  to `api.automancer.uk`, another host, so a cold Send first opened a connection and waited for a
  CORS preflight (`OPTIONS`, answered by the API's single Durable Object in ~200-300 ms) before the
  POST could leave. When the visitor starts on the form (`focusin` or `input`), `contact.astro`
  sends an empty `OPTIONS` to the endpoint: the browser opens the connection and caches the
  preflight's answer, which allows POST with `Content-Type`, so Send makes the POST alone. It
  carries no form data, stores nothing, and repeats at most once a minute while they write (Safari
  keeps a preflight for ten minutes; an idle connection can close after a few minutes). Measured
  live with `ops/perf/send-probe.mjs` (fresh browser per round, from auto-bee in London, body `{}`
  so the API rejects it at validation and nothing is stored): typing then Send three seconds later,
  median of 9, 505 → 224 ms, and the requests Send costs went from `OPTIONS` + `POST` to `POST`
  alone. The after figure served the built page at the production address (the probe's `html`
  argument), so it ran against the real API from the real origin before the merge. A real Send adds
  the API's Turnstile check and storage, which this does not change. After a minute with no typing
  two of nine rounds took ~1.3 s: the connection had gone, which is why the warm-up repeats. Sending the POST as `text/plain` would skip the preflight
  without a warm-up, but the API's contract is JSON; it is not changed from this side.
  Considered and left out the same day: inlining the stylesheet (Astro `inlineStylesheets: 'always'`)
  painted a cold phone visit 250 ms sooner on Slow 4G (first paint 608 → 360 ms on a local HTTP/2
  copy), but at 300 ms / 400 kbps text painted before the fonts arrived and the home page's layout
  shift went from 0.009 to as much as 0.165, and every later page view carried the stylesheet again
  (+56 ms on Slow 4G where nothing is prerendered). Narrowing each variable font to its declared
  weight range saved nothing (83,044 → 83,308 B): every weight in each range is rendered somewhere.
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
- **Offscreen decoration stops using the renderer while someone reads (t21709).** An
  `IntersectionObserver` pauses CSS animations when their section or decoration leaves the
  viewport and resumes them at the same point when it returns. On a 390px viewport in Chromium
  with 4× CPU throttling, the old build spent about 1.3 s on renderer tasks in a 2.2 s pause at
  the home page's service prices, and about 0.9 s in the middle of a field note. Animations in
  view keep their original timing. The visitor journey checks that a field note's glow pauses
  offscreen and resumes on return.
- **The decoration a visitor reads beside runs on the compositor (t21746, 20 Nov 2026).** The
  spectrum glow behind every hero animated `color`, and the spectral rules, the hero fold line and
  the nav's current-page underline animated `background-position`, so the main thread restyled and
  repainted them on every frame for as long as they were on screen. The glow
  (`SpectrumGlow.astro`) is now one static layer per colour, crossfaded by opacity and summed with
  `plus-lighter`, which is the same sRGB interpolation; the lines slide a strip four host-widths
  wide by `transform` inside a clipping host. Frozen-frame screenshots of main and this change at
  the same animation times (home, about, services, a field note, a case study, contact,
  /developers/, the 404 page; 390 and 1280 px; normal and reduced motion) differ only in a few
  antialiased pixels. `ops/perf/idle-screen.mjs` (390 px phone, 4x CPU throttle, 5 rounds,
  medians; main-thread task time over 5 s after the entrance motion), main → this change, in ms per
  second: about 11 → 0, services 16 → 1, releases 23 → 0, a field note 17 → 0, a case study
  12 → 0, contact 57 → 12, 404 41 → 15, home 25 → 29 (unchanged within noise). Style
  recalculations on the four article-type pages fell from 13-16 a second to 0. Headless Chromium
  draws about 15 frames a second, so a 60 Hz phone did four times the "before" work. What still
  repaints: the spectral word (`.spectral-text`, a text-clipped background a compositor cannot
  move) and the small beads (`.eyebrow--live`, `.sys--spectral`, `.live-dot`, the proof-strip
  dot), which pulse a `box-shadow`; together they keep home, /developers/, contact, privacy,
  terms, /work/ and the 404 page drawing on the main thread. The layers cost 1,605 B of shared
  CSS and about 90 B of HTML per glow; `/contact/` is 188,339 B (re-measured with `perf-cli.ts`,
  which also re-pinned `MEASURED_JS` to the 7,236 B `main.js` t21709 left). The journey test
  "decorative motion on interior pages runs on the compositor" fails on main at both widths.
- **Every first screen is quiet while a visitor reads (t21966, 20 Nov 2026).** The effects t21746
  left repainting now run on the compositor too. Each pulsing bead (`Bead.astro`: the hero
  eyebrow, the `.sys--spectral` labels, the case-study `.live-dot`, the proof-strip dot) is a
  clipped strip sliding by `transform` plus a white ring behind it. The ring scales on each axis
  from the bead's own box (container units) to 4px larger all round and fades .35 → 0 on the old
  `box-shadow` pulse's eased keyframes, so its edge sits where the shadow's did. The hero's
  spectral word (home "oblivion", /developers/ "data") clips the shared sliding strip to its
  glyphs with `mask-clip: text`. It is an inline-block because WebKit clips only an inline-block's
  contents to its text. Firefox, which lacks `mask-clip: text`, keeps `spectral-pan`, as do the
  phrases that can wrap (the footer tagline, the home page's "the same tools…"), which main.js
  pauses offscreen. The service price's underline is a clipping host for the sliding strip.
  `ops/perf/idle-screen.mjs` (390 px phone, 4x CPU throttle, main and this change interleaved for
  5 rounds, medians; main-thread ms per second / style recalculations per second): home 14 / 15
  → 0 / 0, /developers/ 12 / 15 → 0 / 0, contact 7 / 14 → 0 / 0, /work/ 10 / 17 → 0 / 0,
  privacy 10 / 15 → 0 / 0, terms 7 / 15 → 0 / 0, the 404 page 8 / 16 → 0 / 0. Headless Chromium
  draws about 15 frames a second, so a 60 Hz phone saved about four times that.
  Frozen-frame screenshots of both builds at the same animation times (nine pages; 390 and
  1280 px; normal and reduced motion; Chromium, WebKit and Firefox) differ only in the beads, by up
  to one device pixel where the composited layer snaps, and in the footer's build clock. With
  reduced motion the phone shots are identical. Every element's box matched to a thousandth of a
  pixel on ten page/width pairs, apart from the hero word's own span. All 30 `contentSha256`
  values are unchanged. Cost: shared CSS +288 B (+197 B gzip), about +300 B of HTML (+30 B gzip)
  on pages with beads; both stay inside the budgets' headroom. The journey test "decorative
  motion runs on the compositor" now covers home, /developers/, contact, /work/, privacy, terms,
  the 404 page and a /services/ price, and fails on main at both widths. One visible difference,
  accepted: when a visitor selects the hero headline, the word shows its spectrum letters on the
  page's dark background inside the white highlight, where it used to show black letters on white,
  because the word's mask also clips the selection box.
- **A field note's contents list costs every page 2.7 KB (t21607, 20 Nov 2026).** The contents
  rail and its phone disclosure (`ArticleContents.astro`) add 1,845 B to the shared stylesheet and
  870 B to `main.js` (the scroll marker), unminified as `main.js` always is. Re-measured with
  `perf-cli.ts` against main built the same way: `/contact/` 182,433 → 185,148 B, JS 9,761 →
  10,631 B; nothing else moved. Putting the CSS in a field-note-only stylesheet would save other
  pages the 1.8 KB but add a request to every note; the shared file is already cached after the
  first page.
  Case studies reuse it (t21875): nested parts and the lit section add 476 B of unminified source
  CSS and 205 B to `main.js` (7,236 → 7,441 B, the marker now follows the headings the list links
  to). Both stay inside the budgets' headroom, so neither measure was re-pinned.
