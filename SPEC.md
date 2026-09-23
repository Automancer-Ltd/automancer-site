# Automancer Site — Living Specification

> Internal living spec. Update the relevant module section in the SAME branch
> as any behaviour change. Last verified against the code: 2026-09-14.

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

- What it does: Holds business facts, service data, page metadata, canonical URLs, and structured-data builders. Human and machine surfaces read these shared modules.
- State: built
- Shaped by: `src/data/business.ts`, `src/data/static-markdown.ts`, `src/data/urls.ts`, and `src/data/jsonld.ts`.

### Machine-readable surface

- What it does: Publishes Markdown twins, JSON endpoints, OpenAPI, JSON-LD, feeds, `llms.txt`, an agent manifest, a sitemap, and security contact data. Legal page bodies remain canonical in HTML and are not copied into machine-readable mirrors.
- State: built
- Shaped by: `src/data/api.ts`, `src/data/openapi.ts`, `src/data/feeds.ts`, `src/data/static-markdown.ts`, and the generated routes in `src/pages/`.

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

- What it does: Reports production browser errors to the configured Sentry project. UptimeRobot independently checks public URL availability. The production verifier checks deployed content and TLS. This repository defines its reviewed auto-vps timer. The GitHub Actions schedule remains until the timer is observed.
- State: built
- Shaped by: `src/scripts/sentry.ts`, `.github/workflows/uptime.yml`, `ops/verify-production.sh`, and `ops/systemd/user/`.

### Provider-independent availability monitoring

- What it does: Detects basic URL unavailability independently of GitHub Actions through UptimeRobot.
- State: built
- Shaped by: The monitoring contract recorded in `docs/DEPLOYMENT.md`.

## Open decisions

- Decide whether production failures need a dedicated pager or the current digest route.
