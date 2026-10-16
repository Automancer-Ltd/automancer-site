# AGENTS.md — automancer-site (`automancer.uk`)

Public website for **Automancer Ltd** (`https://automancer.uk`), built as a static Astro 7 site (`output: 'static'`) and deployed to GitHub Pages on push to `main`.

- **Read first:** [`GLOSSARY.md`](GLOSSARY.md) (canonical domain terms), [`SPEC.md`](SPEC.md) (built capabilities), [`VISION.md`](VISION.md) (**read-only — never edit**).
- **Hard rule:** Never change visible wording, layout, or design unless explicitly instructed; human HTML and machine-readable surfaces must always state the same facts, from-prices, and commitments.

## Commands

Run all build, test, typecheck, and lint commands through `checkq`:

```bash
checkq -- pnpm install --frozen-lockfile   # installs deps + runs `prepare` (`astro sync`)
checkq -- pnpm run check                   # fast gate (~5s): oxlint --type-aware + tsgo --noEmit + cached Vitest
checkq -- pnpm run test                    # full gate: fresh `astro build` -> 14 Vitest files against dist/
checkq -- pnpm run verify                  # check + test (same sequence as CI `checks`)
```

- **LSP prerequisite:** `typescript-language-server` requires `.astro/types.d.ts` and `.astro/content.d.ts`. `pnpm install` runs `astro sync` automatically via `prepare`, and `pnpm run typecheck` runs `astro sync` if `.astro/content.d.ts` is missing.
- **Visual & end-to-end verification:** Follow [`.agents/skills/verify-site/SKILL.md`](.agents/skills/verify-site/SKILL.md) (or run `.agents/skills/verify-site/scripts/verify-local.sh`) to build, preview, and drive every journey in `agent-browser` at desktop and mobile widths.

## Architecture & Single-Owner Map

```text
src/
  config/site.ts            # ENDPOINT_URL, FIELD_LIMITS, TURNSTILE_SITE_KEY, LEAD_ERROR_COPY, LEAD_ERROR_FALLBACK
  content.config.ts         # Zod schemas for `case-studies` and `field-notes` collections
  content/
    case-studies/*.md       # Long-form `/work/<slug>/` entries
    field-notes/*.md        # Long-form `/field-notes/<slug>/` articles
  data/
    business.ts             # Company facts (`business`), contact details, `services` (`ServiceOffering[]`) & `serviceById()`
    site-content.ts         # `staticPages` metadata (`PageMeta`), collection loaders, `markdownTwinPath`
    static-markdown.ts      # `staticBodies` Markdown prose for static pages + `twinRoute()` builder
    api.ts                  # `API_ENDPOINTS` registry shared by `/api/index.json`, `/openapi.json`, `/developers/`
    openapi.ts              # OpenAPI 3.1 builder for `/openapi.json`
    feeds.ts                # RSS 2.0 + JSON Feed 1.1 builders for `/work/*` and `/field-notes/*`
    jsonld.ts               # Schema.org `@graph` nodes injected by `BaseLayout.astro`
    wellknown-agent.ts      # Builder for `/agent.json` and `/.well-known/agent.json`
    wellknown-security.ts   # Builder for `/security.txt` and `/.well-known/security.txt`
  layouts/BaseLayout.astro  # Shared HTML shell, fonts, SEO meta, JSON-LD, nav, footer, Sentry init
  components/               # `SEO.astro`, `Nav.astro`, `Footer.astro`, `JsonLd.astro`
  pages/                    # `.astro` HTML routes + `.md.ts` / `.json.ts` / `.txt.ts` / `.xml.ts` endpoints
public/assets/              # Self-hosted variable `.woff2` fonts, `js/main.js`, SVG/PNG icons & OG image
tests/                      # 14 Vitest files auditing emitted `dist/` bytes (see `tests/README.md`)
ops/verify-production.sh    # Live/preview HTTP, revision SHA, Sentry project ID, legal & TLS verifier
```

## Three Core Mechanics (Fast Reference)

1. **Where a page's text comes from:**
   - **Collection pages (`/work/<slug>/`, `/field-notes/<slug>/`):** Body prose and front matter live in `src/content/case-studies/<slug>.md` and `src/content/field-notes/<slug>.md` (schema in `src/content.config.ts`), rendered into HTML by `src/pages/work/[slug].astro` and `src/pages/field-notes/[slug].astro` and emitted as Markdown twins by `src/pages/work/[slug].md.ts` and `src/pages/field-notes/[slug].md.ts`.
   - **Static pages (`/`, `/services/`, `/work/`, `/field-notes/`, `/about/`, `/contact/`, `/developers/`, `/privacy/`, `/terms/`, `/404/`):** HTML body copy is authored in `src/pages/<name>.astro` (and `src/pages/{work,field-notes}/index.astro`), page metadata (`title`, `description`, `lastUpdated`, `legalNoMirror`) comes from `staticPages` in `src/data/site-content.ts`, Markdown twin prose comes from `staticBodies` in `src/data/static-markdown.ts` (via `src/pages/<name>.md.ts`), and shared prices/company facts come from `src/data/business.ts` and `src/config/site.ts`.

2. **How a new page is added:**
   - **New Case Study or Field Note:** Add `src/content/{case-studies,field-notes}/<slug>.md` conforming to `src/content.config.ts`. HTML, `.md` twin, `/api/*.json`, RSS/JSON feeds, `llms*.txt`, and sitemap update automatically.
   - **New Static Page (`/<slug>/`):**
     1. Create `src/pages/<slug>.astro` using `BaseLayout.astro`.
     2. Add its `PageMeta` entry to `staticPages` in `src/data/site-content.ts` (enforced by `tests/agent-readiness.test.ts` against `/api/pages.json`).
     3. Unless `legalNoMirror: true`, add its Markdown body to `staticBodies` in `src/data/static-markdown.ts` and add `src/pages/<slug>.md.ts` calling `twinRoute('/<slug>/')`.
     4. Add `/<slug>/` to `ROUTES` in `ops/verify-production.sh` (and `src/components/Nav.astro` / `Footer.astro` if linked in navigation).

3. **How the contact path works:**
   - `/contact/` (`src/pages/contact.astro`) renders `#contact-form` alongside direct email (`mailto:waseem@automancer.uk`) and phone (`tel:+447451261333`) fallbacks from `src/data/business.ts`.
   - On submit, the inline script in `src/pages/contact.astro` validates required fields (`name`, `email`, `time_sink`) and `FIELD_LIMITS`, moving focus (`focus()`, `scrollIntoView()`, `aria-invalid="true"`, `aria-describedby="form-error"`) to the first invalid field without calling the network.
   - Valid submissions `POST` JSON (including `turnstileToken` and hidden `website` honeypot) with a 15-second `AbortSignal.timeout` to `ENDPOINT_URL` (`https://api.automancer.uk/api/lead`, defined in `src/config/site.ts`).
   - Backend error codes are translated through `LEAD_ERROR_COPY` and `LEAD_ERROR_FALLBACK` (`src/config/site.ts`) via `copyFor()` so raw snake_case machine codes never appear in `#form-error`; repeated 403s, timeouts, or Turnstile load errors (`window.onTurnstileError`) display human fallback copy naming `waseem@automancer.uk` (`tests/contact-errors.test.ts`).

## Invariants Enforced by `pnpm run test`

- **Zero first-party browser storage:** Same-origin scripts must never touch `localStorage`, `sessionStorage`, `document.cookie`, `indexedDB`, or `caches` (`tests/no-browser-storage.test.ts`, `tests/support/storage-sentinel.ts`).
- **Legal text integrity:** `/privacy/` and `/terms/` have `legalNoMirror: true` and SHA-256-pinned `<main>` text in `tests/legal-integrity.test.ts`.
- **Page-weight & contrast budgets:** Every layout page must stay within the byte budgets in `tests/performance.test.ts` and WCAG AA contrast ratios in `tests/contrast.test.ts`.
- **CI-gated deploy:** `.github/workflows/ci.yml` runs the single `checks` job; `.github/workflows/deploy.yml` waits for `checks` to pass on `$GITHUB_SHA` before building and deploying to GitHub Pages, then runs `ops/verify-production.sh --expected-revision "$GITHUB_SHA" https://automancer.uk`.
