# Agent-readiness — automancer.uk against is-agentic.com

Status: **shipped on `main` in `v2026.08.22.1`** (merge `4f2e4a8`, 22 August 2026).
Last reviewed: 31 August 2026.

## Measured baseline & response — official is-agentic.com scan, 2026-08-22

`npx is-agentic automancer.uk` measured **63/100** ("Important blockers remain"):
Essential **48.9/80** (5 of 9 checks), Recommended **11.5/20** (7 of 14), Bonus **+2.1**.
What follows is what we changed in response, and — just as important — what we
deliberately did not fake.

### Fixed

| Finding | Was | Response |
| --- | --- | --- |
| OpenAPI spec published | FAIL (Essential) | New **`/openapi.json`**: a real OpenAPI 3.1 document describing all six `/api/*.json` GET endpoints — unique `operationId` per operation, per-operation description, explicit empty `parameters`, typed response schemas (`components/schemas`), root-level `security: []` documenting that no authentication exists. Generated from the same registry as the endpoints themselves (`src/data/api.ts`) plus `business.ts`, so spec, discovery document and payloads cannot drift; tests validate every emitted payload against its declared schema. |
| Agent instruction / when-to-use guidance | FAIL (Recommended) | New **"When to use Automancer"** section in `/llms.txt`: concrete jobs drawn only from the published services (`src/data/business.ts`) and real delivered work (`src/content/` — care provider, trade portal, debiaser productisation, fast websites), each tied to named offerings and published prices, followed by an explicit when-to-look-elsewhere list (services outside automation/AI/websites, enterprise-scale procurement, non-UK on-site work, instant-SLA support). No generic marketing copy. |
| Developer resource discoverability + API/docs linked from homepage | FAIL/PARTIAL (Recommended) | New human-readable documentation page at **`/developers`**: covers every endpoint with example requests, the `.md` twin convention, feeds, `/agent.json`, `/openapi.json`, sitemap, security.txt — and states plainly that the API needs **no authentication** and is **read-only**. Linked from the homepage (a dedicated section), `llms.txt`, `robots.txt`, `/api/index.json` (`related`) and `agent.json`. |
| JSON-LD Person node completeness | PARTIAL | The founder Person node already carried `name`, `jobTitle` and `url` in this tree (the scanner most plausibly measured a deploy predating them); we added a truthful `description` so the node is complete on all four axes. The ProfessionalService node already carries name, legalName, url, description, address and contact points. **`sameAs` is deliberately absent**: this repo publishes no public social-profile URLs anywhere, and inventing one would be fabrication. A test enforces that any future `sameAs` value must exist verbatim in `src/data/`. |
| Agent-friendly 404s | PARTIAL (Essential) | A genuine HTTP 404 was already served; the 404 page gained a compact recovery block pointing agents at `/sitemap-index.xml`, `/llms.txt`, `/llms-full.txt` and `/developers` with one-line descriptions. It stays fully visible and useful to humans — it doubles as a "go deeper" list rather than a hidden comment. |

### Not attempted — host limitations, faking them would be worse than failing

| Finding | Why it cannot pass on GitHub Pages |
| --- | --- |
| Markdown content negotiation (`Accept: text/markdown` → markdown body + `Vary: Accept`) | GitHub Pages serves static files only: no content negotiation, no custom response headers. Our `.md` twins at explicit URLs are the best available equivalent on this host. Any workaround would be a fabrication, not a fix. |
| Brand-name discoverability | A search-index outcome, not a property of this codebase. |

The dot-path serving constraint documented below remains in force and affects
scoring similarly: `/.well-known/*` copies are emitted but 404 live, which is
why every advertisement points at the servable non-dot paths instead.

## Host constraint: GitHub Pages does not serve dot-prefixed paths

Measured live against production on 2026-08-22, with `.nojekyll` present in
the deployed artifact:

| Path | Live status |
| --- | --- |
| `/.well-known/agent.json` | 404 |
| `/.well-known/security.txt` | 404 |
| `/.nojekyll` | 404 (so `.nojekyll` alone does not fix it) |
| `/api/index.json` (same build, same deploy, non-dot) | 200 |

A file can therefore be present and correct in `dist/`, pass every dist/-only
check, deploy green — and still never be served. That is exactly what shipped
first time: both manifests were advertised in `llms.txt`, `robots.txt` and the
API discovery document while returning 404 to every agent that followed them.
An advertisement that resolves to a 404 is worse than no advertisement.

The response, now enforced in code and tests:

1. **Canonical copies are served at non-dot paths** — `/agent.json` and
   `/security.txt` at the site root. These are what agents can actually
   fetch on this host today.
2. **The `/.well-known/` routes stay emitted** (`/.well-known/agent.json`,
   `/.well-known/security.txt`). They cost nothing, they are the standardised
   locations, and they start working the day the host serves dot-paths. Both
   pairs render from one builder each (`src/data/wellknown-agent.ts`,
   `src/data/wellknown-security.ts`) and are asserted byte-identical, so the
   copies cannot drift.
3. **Everything advertises the servable URLs.** `llms.txt`, `robots.txt`,
   `api/index.json` and `agent.json` itself point at `/agent.json` and
   `/security.txt`. A `/.well-known/` mention may appear only after the
   working URL and clearly marked secondary. `security.txt`'s `Canonical`
   names `/security.txt` — RFC 9116 requires Canonical to be a URL the file
   is actually served from; one resolving to a 404 makes the document
   non-conformant.
4. **Production is checked, not just the artifact.** `ops/verify-production.sh`
   asserts `/agent.json` answers 200 with parseable JSON and `/security.txt`
   answers 200 satisfying RFC 9116 (including that `Canonical` matches the
   served URL). It runs post-deploy and on the auto-vps 30-minute timer.

## How is-agentic.com scores

- **80 points — Essential pool**, applied to every site: server-rendered
  content, correct HTTP status codes, clear document structure, error
  recovery, usable interactive controls.
- **20 points — Conditional Recommended pool**, which only activates where a
  site genuinely offers machine-readable capability.
- **5 points — additive bonus** for emerging formats.

The Conditional pool is earned, not assumed: it activates because this site
actually ships JSON endpoints, feeds and Markdown twins — not because we
declared them.

## Essential pool (80 points)

| Check | Status | Implemented in | Notes |
| --- | --- | --- | --- |
| Server-rendered content | Done | `astro build` static output (`output: 'static'`) in `astro.config.mjs` | Every page is complete HTML at deploy time. No client-side rendering of content anywhere; the only runtime JS is the contact form, Sentry and small visual effects. |
| Every content URL serves real HTML | Done | `src/pages/**` | 22 pages built: home, services, work index + 4 case studies, field-notes index + 9 articles, about, contact, privacy, terms, 404, plus legacy `.html` meta-refresh pages. |
| Correct HTTP status codes | Done / verified live | `astro.config.mjs` redirects | GitHub Pages serves `200` for every emitted page and a real `404` via `dist/404.html`. Legacy `/services.html` etc. return a real `301`, then a `200` meta-refresh page that Astro emits with a canonical link, `robots noindex`, and a real anchor a no-JS agent can follow. **Verified against live production on 2026-08-21; deliberately left untouched.** |
| Canonical URLs | Done | `src/components/SEO.astro` | `<link rel="canonical">` on every page, absolute URLs normalised through `src/data/urls.ts` so HTML, JSON-LD, APIs, twins and feeds cannot disagree. |
| Clear document structure | Done | `src/layouts/BaseLayout.astro`, `src/styles/global.css` | One `<h1>` per page, ordered heading hierarchy, semantic `<article>`/`<section>`, skip-link, `lang="en-GB"`, descriptive link text. |
| Structured data | Done | `src/components/JsonLd.astro` + `src/data/jsonld.ts` | One schema.org JSON-LD `@graph` per page: Organization + WebSite + WebPage subtype, Article nodes on field notes; all `@id`s absolute. |
| Error recovery (404) | Done | `src/pages/404.astro` | States plainly what happened, links every top-level section with descriptions, lists recent field notes and every case study, gives email/phone/form contact routes. Static, fully server-rendered. |
| Usable interactive controls without JS | Partial (honest gap) | `src/pages/contact.astro`, `/agent.json` | All navigation works without JS. The contact form requires JavaScript plus a Cloudflare Turnstile check — there is no pure-HTML fallback form. Mitigation: the 404 page, footer, `agent.json`, `llms.txt` and `contact.md` all surface direct `mailto:` and phone routes, and `agent.json` tells agents to prefer email. Residual gap accepted: a no-JS agent can always reach a human by mailto. |
| Sitemap | Done | `@astrojs/sitemap` | `sitemap-index.xml` + page sitemaps generated at build; drafts never enter it. |

## Conditional Recommended pool (20 points) — machine-readable capability

Activated because the site genuinely offers these surfaces. All are generated
at build time from shared data modules (`src/data/business.ts`,
`site-content.ts`, `feeds.ts`, `urls.ts`, `build.ts`) so they cannot drift
from each other or from the HTML pages.

| Check | Status | File(s) | Notes |
| --- | --- | --- | --- |
| `llms.txt` | Done | `src/pages/llms.txt.ts` | Business summary, when-to-use guidance, pricing, contact, sitemap, and a "machine-readable surfaces" section advertising everything below. |
| Full-text file | Done | `src/pages/llms-full.txt.ts` | Whole site's text in one file; every section headed with its canonical URL; legal pages listed as metadata + pointer only. |
| JSON API | Done | `src/pages/api/*.json.ts`, `src/data/api.ts` | Six endpoints: `index.json` (discovery), `business.json`, `services.json`, `case-studies.json`, `field-notes.json` (full body text), `pages.json` (inventory incl. twin URLs + last-modified). The endpoint list is one shared registry (`src/data/api.ts`) consumed by the discovery document, the OpenAPI spec and `/developers`. |
| OpenAPI 3.1 spec | Done | `src/data/openapi.ts` rendered at `/openapi.json` (`src/pages/openapi.json.ts`) | Every operation: unique `operationId`, summary + description, explicit empty parameters, typed response schema; root `security: []` (no auth). Payloads are validated against the declared schemas by tests. |
| Developer documentation | Done | `src/pages/developers.astro` at `/developers` | Human-readable docs for every endpoint (with example requests), twins, feeds, manifests and policies; states no-authentication/read-only plainly. Linked from homepage, llms.txt, robots.txt, api/index.json and agent.json. |
| Feeds | Done | `src/data/feeds.ts`, `src/pages/{work,field-notes}/{rss.xml,feed.json}.ts` | RSS 2.0 with full `content:encoded`, and JSON Feed 1.1 with full `content_text` — not excerpts. |
| `agent.json` (capability manifest) | Done | `src/data/wellknown-agent.ts` rendered at BOTH `/agent.json` (`src/pages/agent.json.ts`, served by GitHub Pages) and `/.well-known/agent.json` (injected in `astro.config.mjs`) | Byte-identical copies, asserted. Capability manifest: contact routes (with JS caveats stated), every endpoint, policy, permissions, legal-page stance, and a pointer to `/security.txt`. |
| `security.txt` (RFC 9116) | Done | `src/data/wellknown-security.ts` rendered at BOTH `/security.txt` (`src/pages/security.txt.ts`, served) and `/.well-known/security.txt` (injected) | RFC 9116 valid: `Contact`, `Expires` (generated at build, ~1 year out — can never silently expire), `Preferred-Languages`, and `Canonical: https://automancer.uk/security.txt` — the URL the file actually resolves at on this host. Byte-identical copies, asserted. |
| robots.txt welcoming AI crawlers | Done | `src/pages/robots.txt.ts` | Generated. No Disallow rules for content; major AI crawlers explicitly Allowed; machine-readable surfaces advertised in comments; sitemap declared. |

### Markdown twins convention

Every content page is also available at its own path plus `.md`, served as
`text/markdown; charset=utf-8`, with YAML front matter carrying title,
description, url, canonical, type, and dates where known.

| Page kind | Twin source | Files |
| --- | --- | --- |
| Case studies (`/work/<slug>.md`) | Derived directly from the collection entry (`studyMarkdown`) — never retyped | `src/pages/work/[slug].md.ts`, `src/data/site-content.ts` |
| Field notes (`/field-notes/<slug>.md`) | Derived directly from the collection entry (`noteMarkdown`) — never retyped | `src/pages/field-notes/[slug].md.ts`, `src/data/site-content.ts` |
| Collection indexes (`/work.md`, `/field-notes.md`) | Listings derived from the collections | `src/data/static-markdown.ts` |
| Hand-authored pages (`/index.md`, `/services.md`, `/about.md`, `/contact.md`) | Curated renditions assembled in `static-markdown.ts`; facts (prices, names, contact details) come from `src/data/business.ts`, not retyping | `src/pages/*.md.ts` |

Known limitation, stated honestly: the hand-authored twins are renditions, not
scrapes of the rendered HTML. If an `.astro` page's prose changes without the
twin generator being touched, the twin can lag until updated. Prices, service
names, contact details and promises are immune (single-sourced from
`business.ts`). Collection twins cannot lag at all.

### Legal pages — deliberate non-mirroring (hard rule)

The bodies of `/privacy/` and `/terms/` are **never transcribed** into any
Markdown twin, JSON endpoint, feed or `llms-full.txt`. Those are compliance
pages that changed upstream recently; a transcribed copy would drift silently
and could republish a superseded privacy notice — a real liability.

Choice made: emit **metadata only** — title, description, canonical URL,
last-updated date (privacy), plus an explicit pointer to fetch the canonical
HTML for the authoritative text. This choice is stated in `llms.txt`,
`llms-full.txt`, `/agent.json` (`legalPagesPolicy`) and here.
Enforced in code by `legalNoMirror` in `src/data/site-content.ts`
(`markdownTwinPath()` returns `null` for those pages).

## Emerging-formats bonus (5 points)

| Check | Status | Notes |
| --- | --- | --- |
| `llms.txt` / `llms-full.txt` | Done | See above. |
| `agent.json` capability manifest | Done | Ahead of most sites; schemaVersion'd, additive-change policy stated. Served at `/agent.json` (and the conventional dot-path twin). |
| Content negotiation-style twins (`.md`) | Done | Path-convention twins rather than Accept-header negotiation — deliberate, because the site is static files on GitHub Pages and cannot vary responses by header. |
| JSON Feed alongside RSS | Done | Both formats per collection. |

## Build & provenance

- `pnpm run build` must be clean before deploy; all surfaces above are
  prerendered static files in `dist/`.
- `src/data/build.ts` records the real build timestamp and git SHA;
  `agent.json`, `llms-full.txt` and the footer carry genuine values only.
- Draft collection entries never reach production pages, sitemap, APIs,
  feeds or twins (same filter everywhere, via `site-content.ts`).

## Residual gaps (summary)

1. Contact form needs JavaScript + Turnstile; mitigated with mailto/phone
   everywhere an agent looks, and stated in `agent.json`.
2. Hand-authored page twins are curated renditions (see limitation above);
   collection twins and all facts are single-sourced.
3. Legal page bodies are intentionally available only as canonical HTML.
4. Legacy `.html` URLs resolve via Astro's meta-refresh pages rather than raw
   server redirects after the first hop — correct and verified live in
   production (canonical + noindex + followable anchor present); untouched.
5. The `/.well-known/` locations of the agent manifest and security.txt are
   emitted but 404 on this host until GitHub Pages serves dot-prefixed paths;
   the canonical copies at `/agent.json` and `/security.txt` are what is
   actually served and advertised (see the host-constraint section above).
   If that host behaviour ever changes, re-pointing is a one-line change per
   advertiser plus this document — the tests pin the current arrangement.
6. Markdown content negotiation (`Accept: text/markdown`, `Vary: Accept`) is
   impossible on a static host; path-convention `.md` twins are the ceiling
   here (see the not-attempted table in the measured-baseline section).
7. Brand-name discoverability is a search-index outcome, outside this repo's
   control.
