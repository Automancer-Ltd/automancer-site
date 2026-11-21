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
checkq -- pnpm run check                   # fast (~5 s): oxlint, tsrs, vitest on the dist/ that exists
checkq -- pnpm run verify                  # the full verdict CI runs: lint, typecheck, build, audit
checkq -- pnpm run journey                 # visitor journey in a real browser (phone + desktop) on the built dist/
checkq -- pnpm run compare                 # every sitemap page, phone + laptop, screenshot-compared with origin/main
pnpm run serve                             # the built dist/ as production serves it, through the edge Worker
```

`check` audits whatever `dist/` already holds, so after a source change a stale `dist/` fails it
for reasons your change did not cause: run `verify` (it rebuilds) or delete `dist/` first. Tests and
the journey build alike, with monitoring on as production ships it (`tests/support/build-env.ts`),
so `check` after `journey` audits a good build; the deploy runs the same audit on the exact `dist/`
it publishes.

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
src/data/api.ts             API_ENDPOINTS registry behind /api/index.json, /openapi.json, /developers/
src/config/site.ts          ENDPOINT_URL, FIELD_LIMITS, TURNSTILE_SITE_KEY, LEAD_ERROR_COPY
src/content/                case-studies/*.md and field-notes/*.md (schema: src/content.config.ts)
src/lib/og-card.ts          share cards: each note's and case study's og:image, drawn at build (src/pages/og/)
src/pages/                  .astro HTML routes; .md.ts / .json.ts / .txt.ts / .xml.ts endpoints
src/layouts/BaseLayout.astro shared shell, SEO, JSON-LD, nav, footer, Sentry bootstrap
tests/                      Vitest against the built dist/ (tests/README.md)
ops/verify-production.sh    production verifier (deploy job; estate-watch siteVerify every 30 min)
ops/edge/                   Cloudflare Worker in front of Pages; local.mjs serves dist/ through it
ops/preview/                the non-production preview target
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
- Pages may contact only this site and the bundled Sentry DSN's origin; `/contact/` adds the
  enquiry API and Turnstile's frame (`tests/csp.test.ts` across all 37 HTML files including redirect
  stubs, `security.csp` in `astro.config.mjs`, SVG/XML edge CSP in `ops/edge/worker.js`, and live
  verification in `ops/verify-production.sh`). A new third-party request needs its origin added
  there on purpose. No response may carry `NEL`, `Report-To` or `Reporting-Endpoints`: they make the
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
  the Worker must take it out too (the preview target's `mark`, `ops/perf/nav-journey.mjs`). Deploy
  the Worker before merging a change to the lock, or every page is blank.
- Pages are fetched ahead of a click only by Chromium's Speculation Rules (`BaseLayout.astro`) and,
  in browsers that cannot prerender, by the hover prefetch in `src/scripts/prefetch.ts` (t23288),
  both same-origin pages only (`tests/speculation-rules.test.ts` holds them to the same links).
  Keep the prefetch's `Accept` equal to a navigation's: the Worker's `Vary: Accept` otherwise
  stops the click from reusing it.
- `/privacy/` and `/terms/` are `legalNoMirror` and hash-pinned (`tests/legal-integrity.test.ts`);
  their wording changes only on Waseem's instruction.
- The contact form never shows a raw API error code (`tests/contact-errors.test.ts`).
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
