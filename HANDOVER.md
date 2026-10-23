# HANDOVER — automancer-site

**What this file is.** The roadmap the next improvement slice reads before planning. It records
where the site stands against `VISION.md`, what the last slice shipped (with evidence and undo),
the next three slices in the order they should be taken, and the questions that are genuinely open.
It does not outrank anything: `VISION.md` is authority 0 and `SPEC.md` describes what is built.
When this file and `SPEC.md` disagree about what exists, `SPEC.md` and the code are right and this
file is out of date.

Last updated: 23 October 2026 (service scope is the same list for people and machines).

## Where the site stands against the vision

`VISION.md` asks for a front door trusted equally by people and machines, where nothing is invented,
every number traces to evidence held elsewhere, prices are published, and the two views can never
disagree. Against that, today:

| Vision line | State today |
| --- | --- |
| A UK business reads pages that answer plainly and publish the price | Built. `/services/` prices render from `src/data/business.ts`; a build test fails if a from-price in the output is not a published `priceFrom` (`v2026.10.14.1`, PR #69). |
| An agent can quote, price and act on it correctly | Built. The `/api/*.json` endpoints in one registry (`src/data/api.ts`) behind the discovery document, the OpenAPI 3.1 spec and `/developers`; `agent.json`, `security.txt`, `llms.txt`, Markdown twins and full-content feeds. `/api/services.json` `includes` is the same included list `/services/` shows, and the build fails if they disagree. Acting still means email: the form needs a browser security check. |
| What a machine is told never differs from what a person is shown | Enforced for the facts that matter most: prices, service names, each service's included list, page inventory, JSON-LD, twins and feeds all read shared modules, and dist-level tests compare the payloads with the pages. |
| Its own honesty audited | Partly. Production is verified after every deploy and every 30 minutes (`ops/verify-production.sh`), including the revision served, the legal block, TLS and the machine surfaces. Nothing yet audits the *claims* on the pages against the truth layer continuously. |
| Published identifiers are promises | **Built in this slice.** The promise is now a document an agent can fetch and check: `/api/stability.json`. |
| Nothing reaches the public without Waseem | Honoured: this repository ships the site; it never speaks to a prospect itself. |

## The last slice, and what it taught

**Isolated preview target + the rollback runbook exercised (18 October 2026, PRs #75, #76, #77;
merge `6b33642`).** Neither rollback path had ever been run, so
its first use would have been during an incident. The slice added a marked release directory served
over the tailnet by a user unit (`ops/preview/`), rehearsed the single-commit revert end to end on
it, and wrote the exercised commands and their output into `docs/DEPLOYMENT.md`.

- Proof: candidate `3cd90d8` served, `git revert` + push → `d2de53e` served, byte-identical to the
  starting revision once the build stamp was normalised, candidate-only file back to 404. The
  rehearsal caught four defects in the target itself (ref resolution, shapeless revisions, the
  frozen install inside the build worktree, the per-request release stamp).
- `automancer.uk` was never involved: it served `1135f5e` throughout.
- Undo: revert the three merge commits; the preview unit and release directory are additive and
  unreferenced by production.

Two lessons carried forward: a check that has never been made to fail is not yet a check (the
self-test drives every verifier assertion in both directions), and a rehearsal target must not be
able to serve production at all (`ops/preview/` refuses `main` and `automancer.uk`).

## This slice: the stability & deprecation policy (20 October 2026)

`/developers` said "additive changes only within a `schemaVersion`". That is a sentence, not a
checkable promise: an agent had to interpret it, and nothing failed when it was broken. The
promise is now published as data at **`/api/stability.json`**, generated from the modules that
serve the things it promises:

- `stable[]` — what a machine may rely on (endpoint paths, operation ids, response field names,
  published service ids, page URLs, enum meanings).
- `endpointPaths` / `stableServiceIds` — read from `src/data/api.ts` and `src/data/business.ts`, so
  the policy cannot promise something the site does not publish, and a new endpoint or renamed id
  appears in the promise automatically.
- `additiveChanges[]` — what may land at any deploy, including "ignore fields you do not know" and
  "array order is not promised".
- `versioning` + `deprecation` — path versioning (`/api/v2/...`), a 90-day minimum notice, the
  procedure, and the pollable `deprecations[]` list (empty today).
- `notPromised[]` — stated rather than implied: no response headers of any kind on a static host
  (so no `Deprecation`/`Sunset`), no rate limit, no uptime SLA, and the `/.well-known/` copies (served
  since 22 October 2026, but not the advertised addresses).

Advertised from `/api/index.json`, `/openapi.json` (`x-stability-policy`), `/developers`, `llms.txt`,
`robots.txt` and `agent.json`. `ops/verify-production.sh` now shape-checks the *served* document
(`schemaVersion`, a non-empty `stable[]`, `endpointPaths` covering the policy itself,
`deprecations[]`, and a notice period) — a 200 with any old JSON fails.

Undo: revert this merge; nothing else depends on the endpoint, and the OpenAPI schema, registry
entry and verifier check live in the same commit.

## The last slice: service scope, the same list for people and machines (23 October 2026)

`/services` already showed a "What's included" list on every offer. `/api/services.json` did not,
so an agent could quote a from-price and a one-line description, not the scope a person reads.
The Markdown twin carried its own wording of those bullets, so the two views could drift.

The bullets now live once, on each service in `src/data/business.ts` — the sentences already
published on the page, not a new claim. `/services`, `/services.md`, `llms.txt` and
`/api/services.json` (`includes`) all read that array. A dist test fails if the page list and the
payload disagree. Who an offer is for, and the FAQ, stay on the page: they are not scope.

Undo: revert this merge. `includes` is additive; a consumer that ignores unknown fields is
unaffected, and the page renders the same sentences it did before.

## Next three slices, in order

1. **Stop publishing the release-notes placeholder.** `/releases` currently shows "Plain-English
   notes are not written yet" and "Replace this section before showing it to a client" on
   v2026.10.23.4 and v2026.10.22.8. A visitor reading the release history sees internal process
   language. Rewrite those two notes from the commits they describe, and fail the build if the
   placeholder ships again.
2. **Publish the enquiry contract, including its limit.** `agent.json` tells agents to prefer
   email because the form needs JavaScript and a browser security check. The field names, limits
   and that limit are not themselves data an agent can fetch. Publish them from the same module
   the form uses, and keep saying email is the path an agent can actually complete. Do not invent
   a Turnstile bypass.
3. **No third slice until the open questions below are answered.** They are Waseem's, not a
   guess: the stability-policy wording, case-study names (tracker t4928), and whether a removed
   `/api/v1` path is ever retired.

## Open questions

- **The wording of the policy is a promise in Waseem's voice, and he has not read it.** It only
  restates `VISION.md` ("published identifiers are promises") and what the repo already does. If he
  disagrees with any rule, `VISION.md` wins and the payload changes — that is a conversation, not a
  rewrite by an agent.
- **Would a breaking change ever remove a `/api/v1` path?** The policy says the old path keeps
  serving for at least 90 days after it is listed. Keeping it forever is cheap on a static host;
  retiring it is a decision nobody has needed yet.
- **Can the enquiry path ever be machine-readable?** The lead API lives in another repository and
  `VISION.md` forbids accounts, sessions and a site database. Until that changes, `agent.json` tells
  agents to use email — which is honest, and remains the weakest link for an agent acting on the
  site's behalf.
- **Which name does each case study go by?** Each one shows a card title in some places and a
  headline in others. Picking one changes visible wording, so it is Waseem's choice (tracker t4928).
