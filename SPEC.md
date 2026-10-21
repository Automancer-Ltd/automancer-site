# Automancer Site — Living Specification

> Internal living spec. Update the relevant module section in the SAME branch
> as any behaviour change. Last verified against the code: 2026-10-20.

## North star

Provide a truthful public front door for Automancer. Give people and machines the same current facts. Keep the site fast, accessible, and free from visitor tracking.

## Key principles

- `VISION.md` is the highest authority in this repository.
- Publish only claims that have evidence in the Automancer truth layer.
- Generate human and machine surfaces from shared source data.
- Keep published machine identifiers stable.
- Publish service prices on the site.
- Do not add analytics, advertising cookies, accounts, sessions, or a site database.
- Keep prospect communication under human control.
- Test the static output that production serves.

## Module map

### Public pages

- What it does: Serves the marketing, services, work, field notes, about, contact, privacy, terms, and recovery pages as static HTML.
- State: built
- Shaped by: `src/pages/`, `src/layouts/`, `src/components/`, and `src/styles/`.

### Published content

- What it does: Builds case studies and field notes from typed Markdown collections. It excludes drafts from production indexes, feeds, mirrors, and generated routes.
- State: built
- Shaped by: `src/content.config.ts`, `src/content/`, and `src/data/site-content.ts`.

### Shared business truth

- What it does: Holds business facts, service data, page metadata, canonical URLs, and structured-data builders. Human and machine surfaces read these shared modules. Published from-prices on the human pages are rendered from `services` in `business.ts`, the same array `/api/services.json` publishes. Field-note prose still quotes those prices; the build fails if a from-price in the output is not one of them.
- State: built
- Shaped by: `src/data/business.ts`, `src/data/static-markdown.ts`, `src/data/urls.ts`, and `src/data/jsonld.ts`.

### Machine-readable surface

- What it does: Publishes Markdown twins, JSON endpoints, OpenAPI, JSON-LD, feeds, `llms.txt`, an agent manifest, a sitemap, security contact data, and the stability policy below. Legal page bodies remain canonical in HTML and are not copied into machine-readable mirrors.
- State: built
- Shaped by: `src/data/api.ts`, `src/data/openapi.ts`, `src/data/feeds.ts`, `src/data/static-markdown.ts`, and the generated routes in `src/pages/`.

### Published stability & deprecation policy

- What it does: Publishes, as data, what a machine may rely on between deploys: the endpoint paths, operation ids, service ids and field names promised stable, the changes that may land without notice, the path-versioning scheme, the 90-day minimum notice a removal gets, the deprecation list itself (pollable, empty today), and an honest list of what the site does not promise (no `Deprecation`/`Sunset` response headers on a static host, no rate limit, no uptime SLA). The covered paths and service ids are read from the modules that serve them, so the policy cannot promise something the site does not publish. The production verifier checks the shape of the served document, not merely that some JSON answered 200.
- State: built
- Shaped by: `src/data/stability.ts`, `src/pages/api/stability.json.ts`, `src/data/api.ts`, `src/data/openapi.ts`, `tests/developer-surface.test.ts`, and `ops/verify-production.sh`.

### Contact path

- What it does: Validates enquiries in the browser and posts them to the configured lead-intake API. It uses Cloudflare Turnstile and provides an email fallback when submission fails.
- State: built
- Shaped by: `src/pages/contact.astro` and `src/config/site.ts`.

### Privacy, legal, and accessibility controls

- What it does: Publishes the privacy and terms pages. It prevents first-party browser storage and checks structural accessibility, legal facts, links, and content integrity in the production build.
- State: built
- Shaped by: `src/pages/privacy.astro`, `src/pages/terms.astro`, `tests/no-browser-storage.test.ts`, `tests/a11y.test.ts`, and `tests/legal-integrity.test.ts`.

### Build, test, and deployment

- What it does: Builds an Astro static site, checks types and content, audits generated output, and deploys `main` to GitHub Pages. It verifies the deployed revision and key production routes after each deploy.
- State: built
- Shaped by: `package.json`, `vitest.config.ts`, `tests/`, `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, and `ops/verify-production.sh`.

### Runtime health signals

- What it does: Reports production browser errors to the configured Sentry project. The Sentry SDK is fetched only when the first error happens, so a visit with no error never downloads it. UptimeRobot independently checks public URL availability. The production verifier checks deployed content and TLS every 30 minutes from a reviewed auto-vps user timer, whose failures reach the daily digest.
- State: built
- Shaped by: `src/scripts/sentry.ts`, `ops/verify-production.sh`, and `ops/systemd/user/`.

### Provider-independent availability monitoring

- What it does: Detects basic URL unavailability independently of GitHub Actions through UptimeRobot.
- State: built
- Shaped by: The monitoring contract recorded in `docs/DEPLOYMENT.md`.

## Open decisions

- Decide whether production failures need a dedicated pager or the current digest route.
