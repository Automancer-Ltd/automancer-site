# Feature 06: Developer Page and Machine-Readable Agent Surfaces

## Scope
Covers `/developers/`, `/llms.txt`, `/llms-full.txt`, `/agent.json`, `/security.txt`, `/openapi.json`, `/api/*.json`, RSS 2.0 and JSON Feed 1.1 feeds, and static Markdown twins.

## Preconditions
- Preview server running on `http://127.0.0.1:$PORT`.

## Steps (`1280x800` and `390x844` + HTTP assertions)
1. Open `/developers/` in `agent-browser` at `1280x800` and `390x844`; assert `<h1>` (`For developers & AI agents`), all 6 `/api/*.json` endpoints are documented in the table, and links to `/llms.txt`, `/llms-full.txt`, `/agent.json`, `/openapi.json`, `/security.txt` resolve.
2. Fetch and validate via HTTP against `http://127.0.0.1:$PORT`:
   - `/llms.txt` and `/llms-full.txt` (HTTP 200, non-empty, contains `https://automancer.uk/agent.json` and the one-week meeting promise).
   - `/agent.json` and `/.well-known/agent.json` (HTTP 200 locally, byte-identical valid JSON).
   - `/security.txt` and `/.well-known/security.txt` (HTTP 200 locally, byte-identical, contains `Contact: mailto:waseem@automancer.uk` and `Canonical: https://automancer.uk/security.txt`).
   - `/openapi.json` (HTTP 200, valid OpenAPI `3.1.0` JSON with 6 paths).
   - `/api/index.json`, `/api/business.json`, `/api/services.json`, `/api/case-studies.json`, `/api/field-notes.json`, `/api/pages.json` (HTTP 200, valid JSON with non-empty collections).
   - `/work/rss.xml`, `/work/feed.json`, `/field-notes/rss.xml`, `/field-notes/feed.json` (HTTP 200, non-empty RSS/JSON Feed).
   - `/index.md`, `/services.md`, `/work.md`, `/field-notes.md`, `/about.md`, `/contact.md` (HTTP 200, YAML front matter + body).

## Evidence
- `desktop-developers.png`, `mobile-developers.png`, and `summary.json`.
