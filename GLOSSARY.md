# Domain Glossary

<!-- Canonical terms for this repository. When code, docs, or prompts disagree with this file, fix the code or update this file in the same commit. -->

## Agent Manifest
**Definition:** The machine-readable JSON capability document describing Automancer Ltd, its services, content endpoints, feeds, and contact paths for autonomous agents.
**In code:** `renderAgentManifest()` in `src/data/wellknown-agent.ts`, emitted at `/agent.json` (`src/pages/agent.json.ts`) and `/.well-known/agent.json` (injected in `astro.config.mjs`). Its endpoint list comes from `API_ENDPOINTS` (`src/data/api.ts`).
**Not to be confused with:** `openapi.json` (`src/data/openapi.ts`), which is the OpenAPI 3.1 schema for the `/api/*.json` endpoints.
**Invariants:** Both `/agent.json` and `/.well-known/agent.json` must be byte-identical, and every advertised same-origin URL uses the non-dot paths (see Non-Dot Twin Route).

## Automancer
**Definition:** Automancer Ltd (UK company number `17060907`, ICO registration `ZC180569`, trading as Automancer), an AI and workflow automation consultancy for UK small businesses led by founder Waseem Ilyas.
**In code:** `business` in `src/data/business.ts` (`legalName`, `tradingName`, `companyNumber`, `icoRegistration`, `email`, `phone`, `phoneTel`, `address`).
**Invariants:** Legal identity (`Automancer Ltd`, company number `17060907`, registered office `62 Beckfield Road, Bingley, BD16 1QS`) and contact details (`waseem@automancer.uk`, `+44 7451 261333`) must come from `src/data/business.ts` and match across HTML pages, JSON-LD, `/api/business.json`, and legal pages.

## Case Study
**Definition:** A published client or product delivery write-up under `/work/<slug>/` showing the problem, what was built, and measured outcomes.
**In code:** Markdown entries in `src/content/case-studies/*.md` validated by the `case-studies` collection schema in `src/content.config.ts`; rendered as HTML by `src/pages/work/[slug].astro` and as a Markdown twin by `src/pages/work/[slug].md.ts`.
**Not to be confused with:** `Field Note` (`src/content/field-notes/*.md`), which is an advisory article rather than a delivery engagement write-up.

## Content Page
**Definition:** Any built HTML page in `dist/` that renders the full site layout (`BaseLayout.astro`), SEO metadata, landmarks, and JSON-LD `@graph`—every emitted HTML page except `/404/` (`dist/404.html`) and legacy redirect stubs (`/*.html/index.html`).
**In code:** `contentPages()` in `tests/support/dist.ts`.

## Field Note
**Definition:** A practical long-form article under `/field-notes/<slug>/` written for UK small-business owners on automation, operations, software buying, or AI governance.
**In code:** Markdown entries in `src/content/field-notes/*.md` validated by the `field-notes` collection schema in `src/content.config.ts`; rendered as HTML by `src/pages/field-notes/[slug].astro` and as a Markdown twin by `src/pages/field-notes/[slug].md.ts`.
**Not to be confused with:** `Case Study` (`src/content/case-studies/*.md`).

## From-Price
**Definition:** The published starting price in GBP (ex VAT) for each commercial offering on the Service Ladder (`£450`, `£1,950`, `£4,500`, and `£495/month`).
**In code:** `ServiceOffering.priceFrom`, `ServiceOffering.priceUnit`, `serviceById()`, and `formatGBP()` in `src/data/business.ts`; audited across all built HTML, Markdown, and text outputs by `tests/agent-readiness.test.ts`.
**Invariants:** Every from-price quoted in human HTML (`src/pages/index.astro`, `src/pages/services.astro`, `src/components/Footer.astro`) or machine surfaces (`/api/services.json`, `/services/` schema.org Offers, `index.md`, `services.md`, `llms.txt`) must match `services` in `src/data/business.ts`. Structured prices explicitly identify themselves as from-prices excluding VAT; monthly prices also publish their billing unit.

## Intake Endpoint
**Definition:** The first-party HTTP endpoint (`https://api.automancer.uk/api/lead`) that receives contact-form JSON `POST` submissions from `/contact/`.
**In code:** `ENDPOINT_URL` and `FIELD_LIMITS` in `src/config/site.ts`; called by the inline submit handler in `src/pages/contact.astro`.
**Invariants:** Client-side validation runs before `fetch`; every request carries a 15-second `AbortSignal` timeout; any Turnstile load failure, HTTP error, or network timeout preserves the visitor's input and offers the direct `mailto:waseem@automancer.uk` fallback.

## Lead Error Copy
**Definition:** The allowlisted mapping from backend snake_case error codes (such as `turnstile_failed` or `rate_limited`) to complete human-written sentences displayed in `#form-error` on `/contact/`.
**In code:** `LEAD_ERROR_COPY` and `LEAD_ERROR_FALLBACK` in `src/config/site.ts`; enforced behaviourally against the built contact script by `tests/contact-errors.test.ts`.
**Invariants:** Raw snake_case machine error codes from the Intake Endpoint must never be rendered to a visitor.

## Legal No-Mirror Policy
**Definition:** The rule that legal notices (`/privacy/` and `/terms/`) are published only as canonical HTML and are never transcribed into `.md` twins or `llms-full.txt` bodies, preventing wording drift between two copies of a legal commitment.
**In code:** `PageMeta.legalNoMirror` in `src/data/site-content.ts`; enforced by `tests/agent-readiness.test.ts` and `tests/legal-integrity.test.ts` (which pins SHA-256 hashes of the rendered `<main>` text alongside `lastUpdated`).

## Markdown Twin
**Definition:** A plain-Markdown (`text/markdown; charset=utf-8`) sibling emitted alongside a Content Page so agents and tools can read the page with YAML front matter (`title`, `description`, `url`, `canonical`) without parsing HTML chrome.
**In code:** `markdownTwinPath()` in `src/data/site-content.ts`, `staticBodies` and `twinRoute()` in `src/data/static-markdown.ts`, static route files `src/pages/*.md.ts`, and collection route files `src/pages/{work,field-notes}/[slug].md.ts`.
**Invariants:** Every Content Page except `/privacy/`, `/terms/` (`legalNoMirror: true`), and `/developers/` (the API reference page) emits a `.md` twin whose front-matter `title` and `description` match the HTML page's fitted `<title>` and `<meta name="description">`.

## Non-Dot Twin Route
**Definition:** The root-level `/agent.json` and `/security.txt` routes emitted alongside `/.well-known/agent.json` and `/.well-known/security.txt`. They became the advertised addresses while the deploy dropped dot-prefixed paths (fixed 22 Oct 2026; `ops/verify-production.sh` now checks the `/.well-known/` copies serve), and stay advertised because published identifiers are promises.
**In code:** `src/pages/agent.json.ts`, `src/pages/security.txt.ts`, `src/data/wellknown-agent.ts`, and `src/data/wellknown-security.ts`.

## One-Week Meeting Promise
**Definition:** The public service-level commitment stated verbatim across human pages and machine surfaces: `"We promise a meeting within one week of first contact."`
**In code:** `MEETING_PROMISE` in `tests/agent-readiness.test.ts`, enforced across `src/pages/*.astro`, `src/data/site-content.ts`, `src/data/static-markdown.ts`, `src/data/wellknown-agent.ts`, and `src/pages/llms.txt.ts`.

## Page-Weight Budget
**Definition:** The measured byte ceiling on total payload (`html + css + js + fonts + images`), JavaScript bytes, and font bytes for every layout page in `dist/`.
**In code:** `LAYOUT_MEASURED`, `MEASURED_JS`, `MEASURED_FONTS` in `tests/performance.test.ts` and `measureAllPages()` in `tests/support/perf.ts` (CLI table in `tests/support/perf-cli.ts`, methodology in `docs/PERFORMANCE.md`).

## Production Verifier
**Definition:** The shell verification script that checks live `https://automancer.uk` (or a preview URL) for HTTP 200 across all routes, real HTTP 404 on unknown paths, `.proof-strip` commit SHA match, Sentry bundle project ID (`4511769898647632`), legal footer anchor, and TLS certificate expiry (`>= 21` days).
**In code:** `ops/verify-production.sh`, invoked post-deploy by `.github/workflows/deploy.yml` and every 30 minutes by `ops/systemd/user/automancer-site-production-verify.{service,timer}`.

## Redirect Stub
**Definition:** A small (`<= 1024 B`) HTML meta-refresh page emitted at legacy `.html` URLs (`/about.html`, `/book.html`, `/privacy.html`, `/services.html`, `/terms.html`) so pre-Astro inbound links continue to resolve.
**In code:** `redirects` in `astro.config.mjs` and `BuiltPage.isRedirectStub` in `tests/support/dist.ts`.

## Service Ladder
**Definition:** Automancer's four ordered commercial offerings published in `src/data/business.ts`: `Automation Opportunity Audit` (`£450`), `Workflow Sprint` (`£1,950`), `System / Agent Build` (`£4,500`), and `AI Ops Partner` (`£495/month`).
**In code:** `services` (`ServiceOffering[]`) and `serviceById()` in `src/data/business.ts`.

## Static Page Registry
**Definition:** The single-source-of-truth array of metadata (`path`, `title`, `description`, `type`, `lastUpdated`, `legalNoMirror`) for hand-authored top-level pages, consumed by HTML pages, Markdown twins, `/api/pages.json`, `/llms.txt`, and `/llms-full.txt`.
**In code:** `staticPages` (`PageMeta[]`) in `src/data/site-content.ts` and `staticBodies` in `src/data/static-markdown.ts`.

## Storage Sentinel
**Definition:** The static and runtime (`happy-dom`) verification harness proving that loading any built page on `automancer.uk` touches zero first-party browser storage APIs (`localStorage`, `sessionStorage`, `document.cookie`, `indexedDB`, `caches`, `navigator.storage`), backing `/privacy/`'s no-cookie/no-storage legal statement.
**In code:** `runPage()` in `tests/support/storage-sentinel.ts`, `tests/no-browser-storage.test.ts`, and `tests/storage-sentinel.test.ts`.

## Forbidden Synonyms

| Never use | Use instead | Why |
|---|---|---|
| `blog post` / `article` (for `/field-notes/*`) | `Field Note` (`field-notes`) | Matches the Astro collection name (`src/content/field-notes/`) and public URL `/field-notes/`. |
| `portfolio item` / `project` (for `/work/*`) | `Case Study` (`case-studies`) | Matches the Astro collection name (`src/content/case-studies/`) and `/api/case-studies.json`. |
| `lead webhook` / `formspree` | `Intake Endpoint` (`ENDPOINT_URL`) | Submissions go exclusively to the first-party intake endpoint in `src/config/site.ts`. |
| `markdown mirror` (for `/privacy/` or `/terms/`) | `Legal No-Mirror Policy` (`legalNoMirror`) | Legal pages deliberately never emit `.md` twins. |
| `tier` / `package` (in `src/data/`) | `ServiceOffering` (`services` in `src/data/business.ts`) | Matches the exported TypeScript interface `ServiceOffering` and `/api/services.json`. |
