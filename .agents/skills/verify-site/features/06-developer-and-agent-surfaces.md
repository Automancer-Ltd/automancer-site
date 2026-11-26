# 06 The developer page and machine-readable surfaces

**The journey.** A developer or an AI agent reads `/developers/`, then fetches the documents it
points to: `/llms.txt`, `/llms-full.txt`, `/agent.json`, `/security.txt`, `/openapi.json`,
`/api/*.json`, the RSS and JSON feeds and each page's Markdown twin (`/<page>.md`).

**Reach it.** `/developers/` (footer), and `/api/index.json` lists every endpoint.

**Proved by:**

- `home and developer introductions load their hero layout` (t22218 once shipped this page without
  its hero styles).
- `the developer reference shows each whole command, copies it, and lists what comes back` and
  `a developer whose clipboard is denied gets the command selected instead` (t25710).
- Vitest: `tests/developer-surface.test.ts` (OpenAPI 3.1 describes exactly the listed endpoints;
  `/developers/` lists each endpoint's response fields as the spec declares them),
  `tests/agent-readiness.test.ts` (twins, `llms*.txt`, manifests, security.txt, feeds, robots),
  `tests/twin-parity.test.ts` (every sentence of a page is in its twin and every sentence of a
  twin is on its page, t27008),
  `tests/feeds.test.ts` and `tests/claims.test.ts`.
- Between releases: `node ops/contract/check-surface.mjs` (CI and the deploy) fails a build that
  drops an endpoint, operationId, field, service id, page URL or enum value production publishes;
  `tests/published-contract.test.ts` plants each kind of break and the deprecations that may allow
  one (t25827).
- Production: `ops/verify-production.sh` reads every page and twin from the served sitemap and
  `/api/pages.json` after each deploy and every 30 minutes.

**End state.** Every surface parses, states the same facts as the pages and resolves every link
it advertises.

**Gotchas.** `/api/pages.json` deliberately omits `/developers/`. Take the page list from the
sitemap, as `pnpm run compare` and the reflow journey do.
