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
```

`check` audits whatever `dist/` already holds, so after a source change a stale `dist/` fails it
for reasons your change did not cause: run `verify` (it rebuilds) or delete `dist/` first. Tests and
the journey build alike, with monitoring on as production ships it (`tests/support/build-env.ts`),
so `check` after `journey` audits a good build; the deploy runs the same audit on the exact `dist/`
it publishes.

- **The visitor journey** (`tests/journey/`, Playwright): nav, published prices, the contact form's
  validation, send, refusal and outage paths, painted screenshots, and no word cut off on any sitemap
  page at 320px or 200% text (`reflow.spec.ts`). CI runs it on the built `dist/`;
  `deploy.yml` runs it against production (`JOURNEY_URL=https://automancer.uk`), read-only, with the
  enquiry endpoint and Turnstile stubbed so it never sends a real enquiry. Needs `build` first and a
  browser (`pnpm exec playwright install chromium`).
- **See it in the real product:** [`.agents/skills/verify-site/SKILL.md`](.agents/skills/verify-site/SKILL.md)
  (`scripts/verify-local.sh` builds, previews and drives every journey in `features/` at desktop and
  mobile widths).
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
ops/edge/                   Cloudflare Worker in front of Pages
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
  there on purpose.
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
  `charset.txt`, run `python3 -I ops/fonts/subset.py` and then `python3 -I ops/og-card/fonts.py` (the
  share cards' fonts; the build stops on a card character they lack), commit all three.

## Stack choices (t13220)

The Blueprint (Subscriptions / Tech Stack) asks TypeScript work to look for Effect, XState and TanStack. Decisions for this repository, read 1 Nov 2026:

- Effect (TS): does not fit. The site is static Astro output with no server or runtime logic.
- XState: does not fit. No page holds multi-step state.
- TanStack: does not fit. Pages are static HTML with no client data fetching, tables or client routing.
