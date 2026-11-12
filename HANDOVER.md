# HANDOVER — automancer-site

**What this file is.** The roadmap the next improvement slice reads before planning. It records
where the site stands against `VISION.md`, what the last slice shipped (with evidence and undo),
the next three slices in the order they should be taken, and the questions that are genuinely open.
It does not outrank anything: `VISION.md` is authority 0 and `SPEC.md` describes what is built.
When this file and `SPEC.md` disagree about what exists, `SPEC.md` and the code are right and this
file is out of date.

Last updated: 12 November 2026 (home and service prices reflow at enlarged text).

## Where the site stands against the vision

`VISION.md` asks for a front door trusted equally by people and machines, where nothing is invented,
every number traces to evidence held elsewhere, prices are published, and the two views can never
disagree. Against that, today:

| Vision line | State today |
| --- | --- |
| A UK business reads pages that answer plainly and publish the price | Built. `/services/` prices render from `src/data/business.ts`; a build test fails if a from-price in the output is not a published `priceFrom` (`v2026.10.14.1`, PR #69). |
| An agent can quote, price and act on it correctly | Built. The `/api/*.json` endpoints in one registry (`src/data/api.ts`) behind the discovery document, the OpenAPI 3.1 spec and `/developers`; `agent.json`, `security.txt`, `llms.txt`, Markdown twins and full-content feeds. `/api/services.json` `includes` is the same included list `/services/` shows, and the build fails if they disagree. Acting still means email: the form needs a browser security check, and since 12 Nov 2026 that is data: `/api/enquiry.json` names email as the route an agent can complete, with the form's fields, limits and an email template that asks the same questions. |
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

## The last slice: the enquiry contract, and no placeholder release notes (12 November 2026, t18804)

`agent.json` told agents to prefer email because the form needs a browser security check, but the
form's fields, limits and what happens after sending were not data an agent could fetch. Now:

- **`/api/enquiry.json`** (`getEnquiryContract`): every route to Waseem with `agentCanComplete`
  (true only for email), what the web form needs, the six fields the form asks for (id, label,
  required, limit, example), the joined 5,000-character message limit, an email template and
  `mailto:` that ask the same questions, the response promise and the four "What happens next"
  steps. Registry entry, so `/api/index.json`, `/openapi.json` (`EnquiryContract` schema),
  `/developers`, `agent.json` endpoints and the stability policy's `endpointPaths` pick it up;
  also linked from `agent.json` `contact.enquiryContract`, `llms.txt` and `/contact.md`.
- **One source:** `src/data/enquiry.ts`. `/contact/` reads its labels, limits, examples and steps
  from it; the built page is unchanged in wording. `tests/enquiry-contract.test.ts` compares the
  built form with the built payload.
- **No Turnstile bypass was described or attempted.** The payload says the form is for a person.
- **`/releases`:** v2026.10.23.4 and v2026.10.22.8 showed "Plain-English notes are not written
  yet … Replace this section before showing it to a client". Both are rewritten from their
  commits, and `src/data/releases.ts` now fails the build if that placeholder appears again
  (proved by reinserting it: the build stopped with the version named).
- Undo: revert the merge. The endpoint is additive; nothing else depends on it.

## Next slices, in order

1. **Make the developer reference reflow at enlarged text.** The home and service buying pages
   now do (t19571). At 320px and at 200% text, long example URLs, email and inline code on
   /developers/ still escape their columns. Preserve code usability and the normal design.
2. **Mark "Business name" optional on /contact/.** The intake API and the form treat it as
   optional (and `/api/enquiry.json` says `required: false`), but it is the only optional field
   without the "(optional)" marker. Change it only in a task authorizing visible wording.
3. **Give static pages truthful modification dates.** `/api/pages.json` currently uses build
   time when a static page has no `lastUpdated`, so every deploy claims those pages changed.
   Set real dates or omit the optional field.

The former cache and release-note slices shipped in PRs #164 and #165 respectively.

## Frontend slice: prices on arrival (12 November 2026, t19164)

The /services/ opening viewport promised prices but showed none at 1280×800 or 390×844.
Its four overview rows also offered no way to jump to the full service details.
The comparison now sits beside the introduction on desktop and below it on phones. All four
prices fit on the first desktop screen. Whole-row links reach the existing `#offer-1` through
`#offer-4` sections, with visible keyboard focus and room below the fixed navigation.
The rung explanation is a compact band after the comparison. All existing prose and facts remain.

- No added JavaScript or browser storage; navigation also works with scripts disabled.
- The browser journey checks prices on arrival and keyboard navigation to every offer.
- Undo: revert this slice's merge commit and push; the normal Pages deploy restores the previous layout.

## Frontend slice: the enquiry form on arrival (12 November 2026, t19493)

/contact/ exists to take an enquiry, but its first field sat at 1558px on a 390×844 phone (after the
hero, the one-week promise and three notes) and at 943px on a 1280×800 desktop, below the fold on
both. The page now opens with a compact introduction (the /services/ pattern), a shorter gap, and
the form first in the page: first field at 683px on the phone and 644px on desktop, both on the first
screen. On desktop the promise stays beside the form; on phones it, the phone line and the notes
follow the form. All wording is unchanged.

Found on the way: with text enlarged to 200% on a phone, the "Automancer" wordmark pushed the menu
button to x=517 on a 390px screen on every page, so the menu could not be opened. Both wordmarks are
now held at their drawn size (logotypes), the menu button never shrinks, and /contact/'s form column
and the footer no longer stretch past the screen (`minmax(0, 1fr)`, a wrapping email and legal row).

- 59 of 62 full-page screenshots (31 pages × 1280/390, normal text) are pixel-identical before and
  after; the others are /contact/ itself and one-unit anti-aliasing on a button edge.
- The browser journey checks the first field is on the first screen, comes before the phone route in
  the page, and that at 200% text /contact/ does not scroll sideways and the phone menu opens.
- Undo: revert this slice's merge commit; Pages redeploys the previous layout.

## Frontend slice: readable prices and headings at enlarged text (12 November 2026, t19571)

At 200% text on a 390px phone, the home headline reached x=697 and every home service card
cut off names, descriptions and prices. The first /services/ heading extended past the screen.
The headline now stays inside its container, the home cards wrap their price row when necessary,
decorative card padding keeps its drawn size, and display amounts fit the available width. Offer
columns shrink to their container instead of stretching to the longest word. All wording stays.

- The browser journey checks the actual text rectangles against their panel at 200% text on
  320px, 390px and desktop. A document-width check alone missed the old clipped content.
- The shared hero fix also covers /developers/; its long code and URL examples remain a next slice.
- Undo: revert this slice's merge commit and merge the revert; Pages restores the prior CSS.

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
