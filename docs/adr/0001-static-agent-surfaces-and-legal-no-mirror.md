# ADR 0001: Static Agent Surfaces, Non-Dot Twin Routes, and Unmirrored Legal Pages on GitHub Pages

- **Status:** Accepted
- **Date:** 2026-08-22 (recorded in ADR format 2026-10-16)
- **Context:** `SPEC.md`, `VISION.md`, `docs/AGENT-READINESS.md`

## Context

`automancer.uk` is built with Astro as a pure static site (`output: 'static'`) and served by GitHub Pages (`actions/deploy-pages`). Two constraints shape how the site serves both human visitors and autonomous agents:

1. **GitHub Pages does not serve dot-prefixed paths on this host** (measured live 2026-08-22): even with `public/.nojekyll` present in the deployed artifact, requests to `https://automancer.uk/.well-known/agent.json` and `https://automancer.uk/.well-known/security.txt` return HTTP 404, and static hosting cannot perform server-side HTTP content negotiation (`Accept: text/markdown`).
2. **Dual-surface drift risk**: `VISION.md` requires that what a machine is told never differs from what a person is shown, while `/privacy/` and `/terms/` carry binding legal commitments whose wording and `"Last updated"` dates must never silently diverge between two representations.

## Decision

1. **Single-source-of-truth data modules (`src/data/`)**:
   - Commercial facts and from-prices live once in `src/data/business.ts`; page metadata lives once in `src/data/site-content.ts` (`staticPages`).
   - Every content page (except `/privacy/`, `/terms/`, and `/developers/`) emits a static Markdown twin (`/*.md`, `/work/<slug>.md`, `/field-notes/<slug>.md`), advertised in `/api/pages.json`, `/llms.txt`, `/agent.json`, and `/developers/`.
2. **Servable non-dot twin routes (`/agent.json`, `/security.txt`)**:
   - Single builders (`src/data/wellknown-agent.ts` and `src/data/wellknown-security.ts`) emit byte-identical copies at both the conventional `/.well-known/<name>` path and the GitHub Pages-servable root `/<name>` path.
   - All discovery surfaces (`/llms.txt`, `/robots.txt`, `/api/index.json`, `/developers/`) advertise the servable non-dot URLs (`/agent.json`, `/security.txt`) as primary.
3. **Legal No-Mirror Policy (`legalNoMirror: true`)**:
   - `/privacy/` and `/terms/` are published only as canonical HTML (`dist/privacy/index.html`, `dist/terms/index.html`) and never emit `.md` twins or `llms-full.txt` transcripts.
   - `tests/legal-integrity.test.ts` pins SHA-256 hashes of their rendered `<main>` text so any wording change forces an explicit human decision on `lastUpdated` in `src/data/site-content.ts`.

## Consequences

- `tests/agent-readiness.test.ts` and `ops/verify-production.sh` enforce byte identity between `/<name>` and `/.well-known/<name>`, absence of `.md` twins for legal pages, and identical prices/promises across HTML and machine surfaces.
