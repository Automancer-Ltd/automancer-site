# AGENTS.md — automancer-site (`automancer.uk`)

Public website for **Automancer Ltd**: a static Astro site (`output: 'static'`) deployed to GitHub
Pages on every merge to `main`, behind a Cloudflare edge Worker.

- **Read first:** [`GLOSSARY.md`](GLOSSARY.md) (the domain's words, used the same way in code).
  [`VISION.md`](VISION.md) is what the site is for and is **read-only: never edit it**.
- **When planning a slice:** [`SPEC.md`](SPEC.md) (what is built) and [`HANDOVER.md`](HANDOVER.md)
  (last slice, next ones, open questions).
- **Hard rule:** never change visible wording, layout or design unless explicitly instructed. Human
  HTML and machine-readable surfaces must state the same facts, from-prices and commitments; the
  dist-level tests in `tests/` fail when they disagree.

## Commands

Run builds, tests and typechecks through `checkq` on auto-vps.

```bash
checkq -- pnpm install --frozen-lockfile   # also runs `astro sync` (LSP types in .astro/)
checkq -- pnpm run check                   # quick (~6 s): oxlint, tsrs, the audit; rebuilds dist/ first only if the tree changed since
checkq -- pnpm run verify                  # the verdict CI and the deploy run: lint, tsrs, build, then the audit with astro check beside it
checkq -- pnpm run journey                 # visitor journey in a real browser (phone + desktop) on the built dist/
checkq -- pnpm run compare                 # every sitemap page, phone + laptop, screenshot-compared with origin/main
pnpm run serve                             # the built dist/ as production serves it, through the edge Worker
```

Both are `ops/verify.mjs` (t28204). `check` rebuilds `dist/` when it is missing or older than a file
the build reads (`src/`, `public/`, `ops/`, the root config), so it never audits bytes your change
did not make; it leaves out astro check (about 5 s). `verify` always builds, then runs astro check
(`--noSync`: it only reads the `.astro/` types the build just wrote) beside the audit, and reports
both. Tests and the journey build alike, with monitoring on as production ships it
(`auditBuildEnv` in `tests/support/build-env.ts`), so `check` after `journey` audits a good build.
`SKIP_BUILD=1` skips the build in all three: the deploy runs `SKIP_BUILD=1 pnpm run verify` on the
exact `dist/` it publishes, and `SKIP_BUILD=1 pnpm run journey` serves the `dist/` already there,
as CI does straight after `verify`, so the journey reads the audited bytes.

- **The visitor journey** (`tests/journey/`, Playwright): nav, published prices, the contact form's
  validation, send, refusal and outage paths, the edge Worker's headers, painted screenshots, and no
  word cut off on any sitemap page at 320px or 200% text (`reflow.spec.ts`). CI runs it on the built
  `dist/`, served through the edge Worker on a free port (`ops/edge/local.mjs`, below);
  `deploy.yml` runs it against production (`JOURNEY_URL=https://automancer.uk`), read-only, with the
  enquiry endpoint and Turnstile stubbed so it never sends a real enquiry. Needs `build` first and a
  browser (`pnpm exec playwright install chromium`).
- **What a change looks like:** `pnpm run compare [base-ref]` (`ops/compare-builds.mjs`) builds
  `origin/main` (or any ref; `--head=<ref>` compares two commits) and the working tree, and
  compares every sitemap page and the 404 at 390 and 1280 px, screenshot and element boxes. It
  prints `same` or `DIFFERS` per page and exits 1 on any difference, with base, head and diff
  images in `test-results/compare/`. Run it on every change that claims "nothing looks different"
  and attach the diffs for one that changes a page on purpose; do not hand-pick pages (t22218 missed
  `/developers/` that way).
- **See it in the real product:** [`.agents/skills/verify-site/SKILL.md`](.agents/skills/verify-site/SKILL.md)
  (the journey and the comparison, how to run them on a loaded machine, and `features/`: each
  visitor journey and the tests that prove it).
- **Serve a build as production does:** `ops/edge/local.mjs` runs `ops/edge/worker.js` unchanged
  over a GitHub Pages stand-in that reads `dist/`, so a local copy answers with production's
  headers, 301s, Markdown twins and error bodies. The journey, `pnpm run compare`, `pnpm run serve`
  and the `ops/perf/` probes all use it (`serveSite` for a port, `routeSite` for a Playwright
  context at `https://automancer.uk`); a new tool that needs the built site uses it too, rather than
  its own file server. When Pages' own answers change, change its stand-in there.
- **Deploy, verify, roll back, watch production:** [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).
  Merge is the deploy; `deploy.yml` re-verifies the merged commit, deploys, and checks production
  serves it. Record the estate-watch `deploy.verify` run (product `site`) in the PR.
- **Rehearse anything risky** on the preview target, never on `main`:
  `ops/preview/deploy-preview.sh <ref> --verify`.
- **Read production:** Sentry project `automancer-site`, UptimeRobot monitor `803613943`, the
  estate-watch schedule `siteVerify` (commands in `docs/DEPLOYMENT.md` › Watching production).

## Where things live

```text
src/data/business.ts        company facts, contact details, services and prices: the one source
src/data/site-content.ts    staticPages metadata (PageMeta) and collection loaders
src/data/static-markdown.ts Markdown twin prose for static pages, twinRoute()
src/data/page-words.ts      lists a page and its twin both show (home ladder, service offers, FAQs, About's rules)
src/data/api.ts             API_ENDPOINTS registry behind /api/index.json, /openapi.json, /developers/
src/config/site.ts          ENDPOINT_URL, FIELD_LIMITS, TURNSTILE_SITE_KEY, SECURITY_CHECK_URL, LEAD_ERROR_COPY
src/content/                case-studies/*.md and field-notes/*.md (schema: src/content.config.ts)
src/scripts/                the browser code pages load: TypeScript, linted and type-checked; Astro puts
                            each page's own script in the page (assetsInlineLimit in astro.config.mjs).
                            Every page shares one page-load module (BaseLayout.astro: sentry.ts,
                            prefetch.ts, main.ts), a content-hashed /_astro/ file while Sentry is on;
                            code every page needs goes there, never in a new file under public/
src/lib/og-card.ts          share cards: each note's and case study's og:image, drawn at build (src/pages/og/)
src/pages/                  .astro HTML routes; .md.ts / .json.ts / .txt.ts / .xml.ts endpoints
src/layouts/BaseLayout.astro shared shell, SEO, JSON-LD, nav, footer, Sentry bootstrap
tests/                      Vitest against the built dist/ (tests/README.md)
ops/ci/beside.sh            runs a CI step that only waits beside the steps after it, then reports it
ops/verify-production.sh    production verifier (deploy job; estate-watch siteVerify every 30 min)
ops/edge/                   Cloudflare Worker in front of Pages; local.mjs serves dist/ through it
ops/preview/                the non-production preview target
ops/contract/               what production promises machines, and the check a release keeps it
ops/carry-forward.mjs       adds earlier releases' scripts and dictionary to a release (/_carried.json)
ops/indexnow.mjs            tells search engines (IndexNow) which pages each release changed
```

## Adding a page

- **Case study or field note:** add `src/content/{case-studies,field-notes}/<slug>.md`. HTML, twin,
  API, feeds, `llms*.txt`, sitemap and its share card follow automatically.
- **Static page `/<slug>/`:** `src/pages/<slug>.astro` on `BaseLayout.astro`; a `PageMeta` entry in
  `staticPages`; unless `legalNoMirror: true`, a `staticBodies` entry and `src/pages/<slug>.md.ts`
  calling `twinRoute('/<slug>/')`. The tests catch a missing `PageMeta` entry or twin. Production
  verification needs no edit: `ops/verify-production.sh` reads every page and twin from the served
  sitemap and `/api/pages.json`. Add a page to `ROUTES` there only if it must never leave the
  sitemap (keep that line's shape: estate-watch's `siteVerify` parses it).

## Contracts the tests hold

- No first-party browser storage (`tests/no-browser-storage.test.ts`).
- Pages may contact only this site; `/contact/` adds the enquiry API and the security check frame
  on `check.automancer.uk`. No page runs a script from another origin: Cloudflare Turnstile runs
  only in that frame, which the edge Worker serves (`securityCheck()`, t27305), so it can never
  read the form; the form takes only `loaded`/`token`/`expired`/`error` from that frame's window
  and origin (`docs/DEPLOYMENT.md` › The security check runs on its own origin). Deploy the Worker
  before merging a change to the frame or its messages
  (`tests/csp.test.ts` across all 37 HTML files including redirect stubs, `security.csp` in
  `astro.config.mjs`, SVG/XML edge CSP in `ops/edge/worker.js`, and live verification in
  `ops/verify-production.sh`). A new third-party request needs its origin added there on purpose.
  Error reports go to this site too: the Sentry SDK posts to `/_errors` (`tunnel`), and the edge
  Worker passes them on to the one Sentry project without the visitor's IP address (`ERROR_TUNNEL`,
  `errorReport()`, t24432). Deploy the Worker before merging a change to that path, or every
  report is lost; `check_error_tunnel` in `ops/verify-production.sh` fails without it. Only the
  Worker holds a key Sentry takes, the Worker secret `SENTRY_KEY`, and it signs each report with it;
  the DSN in the bundle holds none, and `/_errors` is rate-limited per visitor (`ERROR_REPORTS`,
  t24883). The Worker reads at most 64 KiB and signs one exception or empty verifier diagnostic
  per request, so a batch cannot turn one counted request into many reports (t25486).
  `ops/edge/deploy.sh` carries both bindings, and `check_error_tunnel_signs` and
  `check_page_key_refused` fail if either half breaks. Never put a Sentry key in the repository. No response may carry `NEL`, `Report-To` or `Reporting-Endpoints`: they make the
  browser report to a server for days, outside the CSP (Cloudflare zone setting `nel` stays off;
  the Worker strips them and `ops/verify-production.sh` fails on one).
- The edge Worker reads the site from its Pages project address (`automancer-ltd.github.io/automancer-site`),
  never from `automancer.uk`: the Pages site has no custom domain, and no name of the site may point at
  GitHub (`tests/edge-worker.test.ts`; `check_no_github_dns` and `check_www_redirect` in
  `ops/verify-production.sh`; `docs/DEPLOYMENT.md` › The origin). Never put `automancer.uk` back as the
  Pages custom domain: every page would answer 502.
- The GitHub Pages copy at `automancer-ltd.github.io/automancer-site` has none of the Worker's
  headers, so the first script in every page's `<head>` sends a reader on any `*.github.io` host to
  the same page on `automancer.uk` (t23224; `tests/off-site-guard.test.ts`, journey test in
  `tests/journey/security.spec.ts`). Keep it the first script, after the CSP meta and before any
  `<link>`, and never widen it to hosts other than `*.github.io` (the preview target, localhost and
  translation proxies must keep working).
- A frame sandboxed without `allow-scripts` never runs that script, so every built page also
  carries `OFFSITE_LOCK` (`ops/edge/worker.js`), a `<style>` that hides it, straight after the
  script; the edge Worker takes it out of every page it serves (t23484; `tests/off-site-guard.test.ts`,
  `tests/edge-worker.test.ts`, `check_homepage_anchor`). Anything that serves a built page without
  the Worker must take it out too (`ops/perf/nav-journey.mjs`). Deploy
  the Worker before merging a change to the lock, or every page is blank.
- Production must run the reviewed Worker (t25749): `ops/edge/deploy.sh` binds the SHA-256 of
  the bytes it uploads as `EDGE_SOURCE`, every response names it in `X-Edge-Source`, and the
  release verifier (`check_edge_source`) fails unless it is `ops/edge/worker.js` at the merged
  commit. So deploy a `worker.js` change from its branch before merging it, and deploy only
  through `deploy.sh` (`docs/DEPLOYMENT.md` › Which Worker is live).
- Pages are kept at the edge (t25774): `keptPage()` in `ops/edge/worker.js` answers a browser's
  GET from the data centre's cache and fetches the page again after answering. A copy dated
  before the newest release the data centre has fetched a page from is fetched again instead of
  served (`RELEASE_KEY`, t26545): it reads Pages' `Last-Modified`, so keep the kept headers. The
  view that teaches a data centre a new release keeps every page the sitemap lists there too
  (`warmRelease()`, t26986), so keep every page in the sitemap. Keep only HTML pages there: twins, the API and feeds are read by machines
  and by the build (`page-dates.ts`), which must never get an older copy (`tests/edge-worker.test.ts`).
- The Worker sends GitHub Pages only the method, `If-None-Match`, `If-Modified-Since`, `Range` and
  `If-Range` (`pagesRequest()` in `ops/edge/worker.js`, t23955). Never pass the visitor's `Request`
  to `fetch()`: that forwards their IP address, cookies and Referer to GitHub
  (`tests/edge-worker.test.ts`). Honor ranges only for files served byte-for-byte.
  HTML loses `OFFSITE_LOCK` and must be served whole (t25022).
- A browser that takes Brotli gets the build's own `<file>.br` (`src/integrations/precompress.ts`,
  written last, HTML with `OFFSITE_LOCK` already out), sent untouched by the Worker
  (`brotliCopy()`, t24283). An integration that changes `dist/` must run before `precompress()`,
  or visitors read the old bytes: `tests/precompress.test.ts` decodes every copy through the
  Worker and fails on any difference from the file.
- A browser holding the release's compression dictionary gets the build's own `<page>.dcz` (t26098,
  RFC 9842). `compressionDictionary()` (`src/integrations/compression-dictionary.ts`) writes one
  dictionary per build under `/_dictionary/` (the served home page without its `<main>` or build
  provenance) and names it in every page's `<head>`; `precompress()` compresses each page against
  it. A stable home page frame keeps the same dictionary URL across releases. The Worker
  sends the `.dcz` only when `Available-Dictionary` is the hash the copy starts with, and Brotli
  otherwise; `keptPage()` keeps it apart from the Brotli copy and never makes a visitor wait for it
  when a Brotli copy is already kept, so `warmRelease()` keeps both copies of every page (t27582). Only Chromium takes `dcz` today. The dictionary file and the
  `.dcz` copies must come from the same build, and the Worker must be live before a build that names
  a dictionary (`tests/precompress.test.ts`, `tests/edge-worker.test.ts`,
  `tests/journey/dictionary.spec.ts`).
- Each release also serves the files under `/_astro/` and `/_dictionary/` that releases from the
  last 8 days built (t26531): a page kept at the edge, in a browser or in an open tab can be that
  old and names them. The deploy adds them after the audit (`ops/carry-forward.mjs`, reading
  production's `/_carried.json`), so the audit and budgets see only this build's own files; the
  journey job checks every listed file answers (`tests/carry-forward.test.ts`). A new
  content-named directory a page loads from belongs in `CARRIED_DIRS` there.
- Pages are fetched ahead of a click only by Chromium's Speculation Rules (`BaseLayout.astro`) and,
  in browsers that cannot prerender, by `src/scripts/prefetch.ts`: on a mouse hover (t23288), and
  on a touch screen for a link kept on screen half a second (t24026). Reading warms up to three
  destinations per view, excluding the footer and header logo. Opening the mobile menu has its
  own budget of five. Only eligible same-origin pages are warmed (`tests/speculation-rules.test.ts`).
  Keep the prefetch's `Accept` equal to the request the click makes, a
  navigation's, or `*/*` in a WebKit that acts on the rules (its press-time prefetch): the
  Worker's `Vary: Accept` otherwise stops the click from reusing it.
- Every identifier `/api/stability.json` promises machines stays from one release to the next
  (t25827): `ops/contract/check-surface.mjs` reads production's endpoint paths, operationIds,
  response field names (payload or schema), service ids, page URLs (inventory and sitemap) and
  enum values, and fails a build that drops one. CI runs it strictly; the deploy runs it on the
  `dist/` it uploads. To remove or rename one, publish the replacement, list the old path (and
  `field`, as a payload path like `releases[].notes`) in `DEPRECATIONS` in `src/data/stability.ts`,
  release that, and remove it only after its sunset, at least 90 days later. A page that moves
  leaves a redirect at its old URL. `tests/published-contract.test.ts` holds the check to the rules.
- Each release announces the pages whose words it added, changed or removed to the IndexNow
  engines (Bing and those sharing its submissions) once it is live (t26811; `ops/indexnow.mjs`, the
  key file `src/pages/[indexnowKey].txt.ts`, `tests/indexnow.test.ts`; `docs/DEPLOYMENT.md` › Search
  engines). The plan reads `contentSha256` in `/api/pages.json`, so keep that hash on every page.
- A page and its Markdown twin say the same sentences, both ways (t27008;
  `tests/twin-parity.test.ts`): a sentence a person reads in `<main>` is in the twin, and a sentence
  in the twin is on the page. Words are compared, not formatting or link targets. A sentence added
  to a page goes in its twin too (`src/data/static-markdown.ts` for the hand-authored pages,
  `studyMarkdown()` / `noteMarkdown()` in `src/data/site-content.ts` for case studies and notes);
  a list both show is written once in `src/data/page-words.ts`. Navigation is exempt (`<nav>`,
  `data-page-words="skip"`, button and arrow links); any other exception is named in the test with
  how often it occurs and why.
- `/privacy/` and `/terms/` are `legalNoMirror` and hash-pinned (`tests/legal-integrity.test.ts`);
  their wording changes only on Waseem's instruction.
- The contact form never shows a raw API error code (`tests/contact-errors.test.ts`).
- A case-study figure the claims registry backs links to its evidence wherever a page states it: its row on the study (`/work/<slug>/#source-<first-claim-id>`) or the study's `#sources` (`tests/figure-sources.test.ts`, t23577). A new claim needs a pattern in that test's `MENTIONS` and a place on a study (`stats` or `facts`), or the build stops. Every number a case study states (page, home and `/work/` cards, description) must be a registered claim, a published from-price, a date or a phase, or be named in `NOT_A_FIGURE` with its reason (t25118): a new number fails until its claim is copied from automancer-bd `data/claims.toml`. The same holds for every field note and every page a buyer reads before getting in touch (home, services, work, about, contact, the field-notes index, the 404; t25645): a number there is a claim, a from-price or another fact `business.ts` publishes, a date, a phase or an item label, or it is named in that test's `NOT_A_FIGURE` (not a claim, with why) or `UNBACKED` (a fact still waiting for its registry claim), each with how often its passage appears. Shrink `UNBACKED`; never add to it. `/api/field-notes.json` names each note's claims (`CLAIM_MENTIONS` in `src/data/claims.ts`, the patterns both use).
- Page dates: `lastModified` in `/api/pages.json` and the sitemap is when a page's words last
  changed live, carried forward from production by the deploy (`src/integrations/page-dates.ts`,
  `tests/page-dates.test.ts`). Keep build-varying text (the deploy clock, the commit) out of `<main>`.
- Page-weight and contrast budgets (`tests/performance.test.ts`, `tests/contrast.test.ts`,
  method in `docs/PERFORMANCE.md`).
- The web fonts carry only the characters in `ops/fonts/charset.txt` (`tests/fonts.test.ts`). A
  page showing a new character (an accented letter, a fraction) fails it: add the character to
  `charset.txt`, run `python3 -I ops/fonts/subset.py`, `python3 -I ops/fonts/fallbacks.py` (re-sizes
  the fallback faces to the new files; needs the Liberation fonts) and then
  `python3 -I ops/og-card/fonts.py` (the share cards' fonts; the build stops on a card character
  they lack), commit all four.
- Text keeps its place while the web fonts load: each family has a `<family> Fallback` face (Arial)
  and a `<family> Android Fallback` face (Roboto) sized to it, generated by `ops/fonts/fallbacks.py`
  (`tests/fonts.test.ts` fails when a font file no longer matches the one its fallback was sized
  from, or a stack lacks either face). `node ops/perf/font-swap.mjs` measures how far every page
  moves when the fonts arrive; with `FONTCONFIG_FILE` from `python3 -I ops/perf/android-fonts.py`
  and `--dpr=3` it measures an Android phone (`docs/PERFORMANCE.md`).
  Firefox uses the faces only because the first thing in `<body>` asks for them (a hashed inline
  script in `BaseLayout.astro`, t23138): keep it after every `@font-face` and before any text.

## Stack choices (t13220)

The Blueprint (Subscriptions / Tech Stack) asks TypeScript work to look for Effect, XState and TanStack. Decisions for this repository, read 1 Nov 2026:

- Effect (TS): does not fit. The site is static Astro output with no server or runtime logic.
- XState: does not fit. No page holds multi-step state.
- TanStack: does not fit. Pages are static HTML with no client data fetching, tables or client routing.
