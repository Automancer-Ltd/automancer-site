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

Run builds, tests and typechecks through `checkq` on auto-vps (`heavy -- …` for a browser walk).

```bash
checkq -- pnpm install --frozen-lockfile   # also runs `astro sync` (LSP types in .astro/)
checkq -- pnpm run check                   # fast (~5 s): oxlint, tsrs, vitest on the dist/ that exists
checkq -- pnpm run verify                  # the full verdict CI and the deploy run: lint, typecheck, build, audit
checkq -- pnpm run journey                 # visitor journey in a real browser (phone + desktop) on the built dist/
```

`check` audits whatever `dist/` already holds, so after a source change a stale `dist/` fails it
for reasons your change did not cause: run `verify` (it rebuilds) or delete `dist/` first.

- **The visitor journey** (`tests/journey/`, Playwright): nav, published prices, the contact form's
  validation, send, refusal and outage paths, painted screenshots. CI runs it on the built `dist/`;
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
- **Read production:** Sentry project `automancer-site`, UptimeRobot monitor `803613943`, the host
  timer `automancer-site-production-verify` (commands in `docs/DEPLOYMENT.md` › Watching production).

## Where things live

```text
src/data/business.ts        company facts, contact details, services and prices: the one source
src/data/site-content.ts    staticPages metadata (PageMeta) and collection loaders
src/data/static-markdown.ts Markdown twin prose for static pages, twinRoute()
src/data/api.ts             API_ENDPOINTS registry behind /api/index.json, /openapi.json, /developers/
src/config/site.ts          ENDPOINT_URL, FIELD_LIMITS, TURNSTILE_SITE_KEY, LEAD_ERROR_COPY
src/content/                case-studies/*.md and field-notes/*.md (schema: src/content.config.ts)
src/pages/                  .astro HTML routes; .md.ts / .json.ts / .txt.ts / .xml.ts endpoints
src/layouts/BaseLayout.astro shared shell, SEO, JSON-LD, nav, footer, Sentry bootstrap
tests/                      Vitest against the built dist/ (tests/README.md)
ops/verify-production.sh    production verifier (deploy job and 30-minute host timer)
ops/edge/                   Cloudflare Worker in front of Pages
ops/preview/                the non-production preview target
```

## Adding a page

- **Case study or field note:** add `src/content/{case-studies,field-notes}/<slug>.md`. HTML, twin,
  API, feeds, `llms*.txt` and sitemap follow automatically.
- **Static page `/<slug>/`:** `src/pages/<slug>.astro` on `BaseLayout.astro`; a `PageMeta` entry in
  `staticPages`; unless `legalNoMirror: true`, a `staticBodies` entry and `src/pages/<slug>.md.ts`
  calling `twinRoute('/<slug>/')`; add the route to `ROUTES` in `ops/verify-production.sh`. The
  tests catch a missing `PageMeta` entry or twin; nothing catches a missing `ROUTES` entry.

## Contracts the tests hold

- No first-party browser storage (`tests/no-browser-storage.test.ts`).
- `/privacy/` and `/terms/` are `legalNoMirror` and hash-pinned (`tests/legal-integrity.test.ts`);
  their wording changes only on Waseem's instruction.
- The contact form never shows a raw API error code (`tests/contact-errors.test.ts`).
- Page-weight and contrast budgets (`tests/performance.test.ts`, `tests/contrast.test.ts`,
  method in `docs/PERFORMANCE.md`).
