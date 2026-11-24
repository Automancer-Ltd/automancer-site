# HANDOVER — automancer-site

**What this file is.** The roadmap the next improvement slice reads before planning. It records
where the site stands against `VISION.md`, what the last slice shipped (with evidence and undo),
the next three slices in the order they should be taken, and the questions that are genuinely open.
It does not outrank anything: `VISION.md` is authority 0 and `SPEC.md` describes what is built.
When this file and `SPEC.md` disagree about what exists, `SPEC.md` and the code are right and this
file is out of date.

Last updated: 24 November 2026 (every number a buyer reads is accounted for, t25645).

## Where the site stands against the vision

`VISION.md` asks for a front door trusted equally by people and machines, where nothing is invented,
every number traces to evidence held elsewhere, prices are published, and the two views can never
disagree. Against that, today:

| Vision line | State today |
| --- | --- |
| A UK business reads pages that answer plainly and publish the price | Built. `/services/` prices render from `src/data/business.ts`; a build test fails if a from-price in the output is not a published `priceFrom` (`v2026.10.14.1`, PR #69). |
| An agent can quote, price and act on it correctly | Built. The `/api/*.json` endpoints in one registry (`src/data/api.ts`) behind the discovery document, the OpenAPI 3.1 spec and `/developers`; `agent.json`, `security.txt`, `llms.txt`, Markdown twins and full-content feeds. `/api/services.json` `includes` is the same included list `/services/` shows, and the build fails if they disagree. Acting still means email: the form needs a browser security check, and since 12 Nov 2026 that is data: `/api/enquiry.json` names email as the route an agent can complete, with the form's fields, limits and an email template that asks the same questions. |
| What a machine is told never differs from what a person is shown | Enforced for the facts that matter most: prices, service names, each service's included list, page inventory, JSON-LD, twins and feeds all read shared modules, and dist-level tests compare the payloads with the pages. |
| Its own honesty audited | Partly. Production is verified after every deploy and every 30 minutes (`ops/verify-production.sh`), including the revision served, the legal block, TLS and the machine surfaces. Nothing yet audits the *claims* on the pages against the truth layer continuously. Since t23334 a person sees the same evidence a machine gets: every case-study figure the claims registry backs links to the dossier line behind it. Since t23577 that holds wherever a figure is repeated (home, /work/, /services/, /about/, field notes), and the build fails on a page that states a registered figure without a link to its evidence (`tests/figure-sources.test.ts`). Since t25118 a case study cannot state a number the registry does not hold, and since t25645 neither can a field note or any page a buyer reads before getting in touch: five unbacked facts are named as debt. |
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

1. **Let siteVerify read the page dates.** Production now publishes when each page's words last
   changed (`contentSha256`, t19631). estate-watch could alert when a page's hash changes without a
   deploy, or when a deploy re-dates pages whose words did not change.
2. **Time the first and second page on physical phones, starting with Safari** (t22772's next
   step): watch the Services heading and price rows when the fonts arrive.
3. **Measure whether the service choice is used.** Without analytics the only honest signal is the
   enquiries themselves: Waseem can count how many arrive with an "Interested in:" line. Nothing
   on the site should count it.

The former "mark Business name optional" and "carry the selected service into an enquiry" slices
shipped in t22871.
The former cache and release-note slices shipped in PRs #164 and #165 respectively. The former
"gap above a field note's first paragraph on phones" slice is dropped from the list: t22126
measured every note's opening line already on a 390×844 phone's first screen (17 of 17), so the
gap is a spacing taste call, not lost content.

## Next slice: every figure links to its evidence (21 November 2026, t23577)

t23334 linked the ten registry-backed figures on the case studies' stat bands to their evidence,
but the same figures are repeated across the site: the home page's and /work/'s case cards, the
/services/ Build offer, /about/, the case studies' own prose and six field notes, 37 mentions in
all with no route to their source. A buyer landing on a field note from a search read "294 carers
and 293 service users" with nothing behind it.

- Each figure now links to its row on the case study (rows named after their first claim, so links
  survive a reordered band); the client line's size and the ~18 workstreams have rows too
  (`facts`), and the hero links to its sources.
- Case cards: the title's link is stretched over the card, so the card still opens its study from
  anywhere, and a Sources link sits beside Read.
- `/api/claims.json` adds `evidenceUrl` per claim; `/api/case-studies.json` adds `facts`.
- `tests/figure-sources.test.ts` reads every page and fails on a registered figure shown without a
  link to its evidence; it failed when one link on /services/ was pointed at the study's top.
- `/` grew 1,651 B; `LAYOUT_MEASURED` re-measured (docs/PERFORMANCE.md).
- Undo: revert this slice's merge commit.

Next for this thread: shipped in t25118, below.

## Slice: every number a buyer reads is accounted for (24 November 2026, t25645)

t25118 held case studies to the truth layer, but field notes were not checked at all, though
VISION.md says every number in them "comes from evidence held elsewhere in the estate". Nor were the
home, services, about and contact pages.

- `tests/figure-sources.test.ts` now reads every field note and the pages a buyer reads before
  getting in touch: 25 pages, 18 of them notes, 341 numbers. Each number is a registered claim (linked), a
  published from-price or another fact `business.ts` publishes, a date, a phase or an item label,
  or it is named with its reason and how often its passage appears. A planted "we fixed 37 of these
  last year" on a note failed it, and so did a named passage changed under it.
- `NOT_A_FIGURE` (15 passages): sums the reader is asked to do, examples, pointers to a note's
  own list, the four-item and five-rule counters, the response promise in figures, "under £1,000".
- `UNBACKED` (five passages, debt): the restore-evidence note states four facts with no registry
  claim: our 03:17 power cycle, the 03:30 nightly backup, the client ERP drill's "about 200 seconds"
  and the 04:01 UTC offsite check. The identity-matching note's "144 genuinely ambiguous records" is
  registry claim `identity_matching_manual_remainder`, but its source is a LinkedIn draft, not the
  dossier. Wording was not changed.
- `/api/field-notes.json` gives each note `claims`: the claim ids its words state, each with the
  evidence line `/api/claims.json` gives. 11 of 18 notes state at least one; the test holds the list
  to the page. OpenAPI documents it.
- Fixed on the way: the figure tests looked pages up by route, and a legacy `services.html` redirect
  stub shared `/services/` with the page it points to, so the stub (with no words) could hide it.
- Undo: revert the merge. The payload field is additive.

Next for this thread: register the four restore-evidence facts in automancer-bd `data/claims.toml`
from the records behind them (the 1 November power-cycle incident, the 31 August drill, the
offsite check), or have Waseem reword them; then copy them into `src/data/claims.ts`, link them, and
empty `UNBACKED`. Give `identity_matching_manual_remainder` a dossier source in the registry, or let
the site publish a claim whose record is not the dossier (the evidence section names the dossier
today).

## Frontend slice: Field Notes opens on its newest note (24 November 2026, t25360)

A visitor opening `/field-notes/` saw only the hero and the subject buttons: the newest note's title
started 926 px down on a 390 × 844 phone (1,084 px at 320 × 640) and 922 px down on a 1280 × 800
laptop, so the page's first screen held no note at all.

- The hero uses Work's compact size, now one shared class (`.page-hero--compact`), so both pages
  read alike; Work is unchanged pixel for pixel. No words changed.
- The list starts closer under the hero, and below 48rem the 11 buttons ("All" and each subject) are one row that
  scrolls sideways instead of five wrapped rows. Arrival at `#topic-<slug>` centres the picked one.
- Now: the newest note's title is at 602 px on the phone (title and summary on the first screen),
  606 px at 320 × 640 and 700 px on the laptop. The journey test
  `open on the newest note, with every subject still within reach` (scripts off, both widths)
  failed on the previous production build and passes on this one.
- Undo: revert the merge.

## Slice: no unbacked number on a case study (24 November 2026, t25118)

t23577 linked every registered figure to its evidence, but numbers with no registry entry were not
checked at all, and seven mentions on two case studies and five field notes had no route to their
source: the reconciliation check ("500 visits, 175 medication alerts and 416 names routed to
review") and the trade portal's day-one data ("74 customers, 888 products and 1,263 price rules").
Both were already verified claims in automancer-bd `data/claims.toml`, quoting the dossier.

- `src/data/claims.ts` copies five more claims from the registry: the three reconciliation counts,
  `manufacturer_portal_demo_seed_data` and `care_provider_staff_split` (17 in all).
- Two new rows under "Where these numbers come from": "500 / 175 / 416" on the care study and
  "~74 / 888 / 1,263" on the trade portal (`facts`). All seven mentions link to their row.
- `tests/figure-sources.test.ts`: a `facts` figure is an introduction figure only where the
  study's hero states it, so a figure stated only in the story must link. A new check reads each
  case study's page, cards and description, and fails on any number that is not a registered
  claim, a published from-price, a date or a phase, or named in `NOT_A_FIGURE` with a reason
  (only "Microsoft 365" today). Both failed when a link was removed and "we trained 12 staff" was
  added to a study. It also fails when a claim's pattern matches nothing.
- Found, not changed (wording needs Waseem's instruction): the trade portal's statline and story say
  "74 customers ... from the client's real records", where the record says "~74" and calls it demo
  seed data built from the client's real price-list workbook (the field notes say "around 74" and
  "seeded from the client's own price-list workbook"). And "what governed AI means" says the check
  "flagged 175 medication alerts that needed review"; the record says the reconciliation was
  verified against exports holding 175 medication alerts. The evidence rows now show the record's
  own words beside both.
- Field notes are not yet held to the no-unbacked-number rule: they carry illustrative numbers
  ("three tidy fake ones", "2 weeks") as well as claims. "144 genuinely ambiguous records" on the
  identity-matching note is a registry claim (`identity_matching_manual_remainder`) whose source is
  a LinkedIn draft, not the dossier, so it is not linked.
- Undo: revert this slice's merge commit.

## Frontend slice: release notes as a dated timeline (21 November 2026, t23438)

`/releases/` was one column of all 57 releases: 25,772 px on a laptop and 27,220 px on a 390 px
phone, a full-size date heading on every release (five in a row read "20 November 2026"), and no
way to reach October without scrolling past November. No page a visitor browses linked to it.

- The page groups the changelog by month, then day, on a line down the left: one date per day,
  each release under it with its version (still its id, the anchor `/api/releases.json` gives),
  its summary as the lead and its parts ("Improvements", "Fixes") as small labels. The newest
  day's dot is green.
- The months and days are listed with the field notes' contents (`ArticleContents`, new `unit`
  prop): a rail on screens 64rem and wider that marks the day being read, a closed "On this page
  · 4 months" fold-out on phones.
- Every page's footer links "Release notes" (between Terms and llms.txt).
- Height: 25,772 -> 19,403 px at 1280, 27,220 -> 22,914 px at 390. `tests/releases.test.ts` holds
  every published release anchor to the page, in order, under its own day and month.
- `pnpm run compare`: 64 of 64 views differ; 62 only in the footer's bottom row (at most 0.05% of
  pixels), and `/releases/` at both widths. Firefox renders the same.
- Undo: revert this slice's merge commit.

## Frontend slice: where these numbers come from (21 November 2026, t23334)

`/api/claims.json` gave machines the dossier line behind each case-study figure ("roster import
created 294 carers + 293 service users ..."), but a person reading the case study saw the number
with nothing behind it: the machine view said more than the page, against the vision's equal-truth
rule, and a sceptical buyer had only "we don't invent numbers" to go on.

- The ten figures the registry backs, on three case studies, each carry a "Source ↓" link to their
  row under "Where these numbers come from", after the story: the figure, then the record's own
  line quoted word for word, and a link to `/api/claims.json`. Figures without a registry entry
  ("Computed", "One workflow", the website study's four) get no link.
- One source: `stats[].claims` in each study's frontmatter names claim ids; the page, the Markdown
  twin and `/api/case-studies.json` (`stats[].claims`, additive) all read it.
- `pnpm run compare`: 6 of 64 views differ, the three case studies at both widths. Their page dates
  move, because their words changed.
- Undo: revert this slice's merge commit.

## Frontend slice: the chosen service travels into the enquiry (21 November 2026, t22871)

Each of the four offer buttons on /services/ ("Book an Audit", "Start a Sprint", "Scope a Build",
"Become a Partner") and every "Book an Audit" button on the site opened the same blank form, so a
visitor who had just chosen an offer had to say again which one, and Waseem got no hint of it.

- The buttons now open `/contact/?service=<id>` (`contactHref()` in `src/data/enquiry.ts`; an
  unknown id stops the build). "Ask us which offer fits" picks "Not sure yet".
- The form asks "What are you interested in? (optional)" with one card per published service and
  its from-price, plus "Not sure yet". Arriving with a service picks it and names it above the
  first field ("Asking about Workflow Sprint · Change"); the first field stays on a 390×844 first
  screen. A new pick updates the note and the address (no storage).
- The choice leads the sent message ("Interested in: Workflow Sprint"), the copied draft, and the
  email fallback's subject. `/api/enquiry.json` publishes the field (kind `choice`, its options)
  and `prefill`; OpenAPI documents both. "Business name" gains its "(optional)" marker.
- `pnpm run compare`: 2 of 64 views differ, both `/contact/`; every page whose button gained the
  link is pixel-identical. /contact/ has its own weight entry (153,881 B, +4,887 B).
- Undo: revert this slice's merge commit.

## Machine-readable slice: browse field notes by subject (21 November 2026, t22833)

- The JSON API publishes `topics` with `label`, `slug`, `count`, a browser filter `url` and
  `noteSlugs` in reading order. OpenAPI documents how to look up those notes in `fieldNotes`.
- `/field-notes.md` and `llms.txt` list the same subjects. The twin names the subject for each
  note and links directly to its Markdown, so an agent can fetch the one note it needs.
- `tests/note-topics.test.ts` compares the JSON and text with the published HTML buttons and
  checks that the twin lists every note under the same subject label. Undo by reverting the merge.

## Frontend slice: browse field notes by subject (21 November 2026, t22532)

`/field-notes/` was one list of 17 notes, newest first: 7,541 px on a 390 px phone and 6,255 px on
a laptop. A visitor with one question (pricing, care, websites) had to read every title to find
the notes on it, and a note's subject label in its header led nowhere.

- The list now opens with "Browse by subject": All plus one button per subject the notes' pages
  already show, with counts (`src/data/note-topics.ts`). Picking Pricing leaves its 2 notes (the
  phone page shrinks to about 3,500 px for Websites' 3). It works with scripts off: native radios
  and CSS `:has()`, one rule per numbered slot.
- Each note's subject label links to `/field-notes/#topic-<slug>`, which arrives filtered with the
  buttons in view; the address follows every pick, so a filtered list can be shared.
- Navigation only (`data-page-words="skip"`): all 30 `contentSha256` values are unchanged.
  `pnpm run compare`: 34 of 64 views differ, all on `/field-notes/` (the buttons) or a note page
  (only the dotted underline on its subject); the "General" note and every other page are the same.
- Undo: revert this slice's merge commit.

## Slice: share cards for every field note and case study (20 November 2026, t21825)

Every page shared the same `og:image`, the home page's "Your admin, automated into oblivion." So a
field note or case study shared on LinkedIn, Slack, WhatsApp or iMessage previewed with a picture
that said nothing about it, and the picture's colours no longer matched the site. Each of the 17
field notes and 4 case studies now has its own 1200×630 card: the logo, "Field note · Pricing" (or
"Case study · <sector>"), the page's headline at the largest size that fits (balanced like the page's
title), and its date and author or its status, on the site's black with the spectrum rule.

- Drawn at build from SVG by resvg (WebAssembly, ~70-130 ms a card; the build is ~2-4 s longer)
  with static instances of the site's own fonts (`ops/og-card/fonts.py` cuts them from the served
  subsets, so a card can show exactly the characters a page can; a missing one stops the build).
- Only the page's own words; the alt text (`og:image:alt`, `twitter:image:alt`) is the card's words
  and ends with the page's headline. Every page also gains `og:image:type`, `:width` and `:height`,
  and a field note's BlogPosting `image` is its card.
- Tests: `tests/og-cards.test.ts` (every page's `og:image` is a built PNG of the stated size; each note
  and study names its own card; alt carries the headline; BlogPosting image) and a journey test that
  fetches two cards from the origin under test (failed on production before this merge, both widths).
- Undo: revert this slice's merge commit; pages name the generic image again.

## Slice: share cards for every other page, prices on the home and services cards (20 November 2026, t22092)

t21825 gave field notes and case studies their own cards; every other page (home, /services/,
/work/, /field-notes/, /about/, /contact/, /releases/, /developers/, privacy, terms) still shared one
hand-made image. It showed home's headline on every page, its "oblivion" was pink-to-magenta while
the site's is yellow-green-blue, and it said "sensible prices" without showing one. Each of those
pages now has its own card from the same renderer (`/og/pages/<name>.png`): the page's eyebrow and
h1, its spectral word in the site's colours, and one fact the page shows. The home and /services/
cards carry the four published from-prices as a row, so a shared link answers "what does it cost?"
before anyone clicks. Each page's WebPage JSON-LD names its card as `primaryImageOfPage`.

- `src/lib/og-card.ts`: `CardInput` is now `eyebrow`, `title`, optional `accent` and `prices`, and
  `meta`; a priced card uses smaller title steps and the build stops if the block does not fit.
  The Space Grotesk instance is named "Space Grotesk Light" in its name table, so the card asks for
  that family (the old default name matched nothing, harmless while no text used it).
- `→` is in `charset.txt` but in none of the web fonts (the page falls back to a system glyph), so
  home's card eyebrow is "AI & automation consultancy" without "· Bradford → UK-wide".
- The 21 existing cards are byte-identical, and all 30 `contentSha256` values are unchanged.
- Undo: revert this slice's merge commit; the revert restores og-image.png and its source, and
  pages name it again.

## Frontend slice: a field note starts on its first line and ends with the next notes (20 November 2026, t22126)

On a laptop (1280x800) only 1 of the 17 field notes showed any of its text on the first screen: the
title at `--t-display` ran to four lines and the opening paragraph sat at 754-904 px. And a reader
who finished a note had nowhere to go but the CTA or "All field notes"; the notes on the same
subject were 6,000 px down the index.

- The title is capped at 3.25rem (`min(var(--t-display), 3.25rem)`, binding from about 1,000 px
  wide) and the article hero's top padding at 8.5rem. Opening line on the first screen: 1024x768
  7/17 -> 17/17, 1280x800 1/17 -> 17/17 (median 829 -> 644 px), 1440x900 12/17 -> 17/17. Phones
  are unchanged (390x844: 17/17 before and after, same positions).
- "Keep reading": three other notes under the byline, chosen by `src/data/related-notes.ts` (same
  topic label first, then shared tags, ignoring tags most notes carry, ties to the newer note). It is
  navigation (`data-page-words="skip"`), so all 30 `contentSha256` values are unchanged.
- Undo: revert this slice's merge commit.

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

## Frontend slice: price ladder numbered, case studies fit phones (20 November 2026, t21223)

Three faults a visitor could see, on the home page's centrepiece and on every case study:

- **The home price ladder read "01 01 01 01".** t19571 made each `.rung` a size container so its
  price fits the card; `container-type` brings style containment, which scopes CSS counters to the
  rung, so the `rung` counter restarted on every card. The number is now `data-step` on the step
  (`content: attr(data-step)`), aria-hidden as before (pseudo content was never in the text). Live on
  automancer.uk from t19571 until this merge.
- **A case study's label broke into ragged columns on a phone.** "Social care / supported living ·
  anonymised · Live production pilot" was three flex items side by side, each wrapped in its own
  narrow column with its "·" stranded. Under a 50rem column (the longest label is about 48rem on one
  line: phones, tablets, or enlarged text on a desktop) the label is now a grid: the hairline and
  sector on the first line, the notes on the second under the sector, without the leading dot. Wider,
  it is one line as before (pixel-identical at 1280px; only the decorative glow differs).
- **Figures broke inside a word with text at 200% on a phone** ("Compu|ted", "minut|es",
  "200/h|r", 8 at 390px and 14 at 320px). The band is now the size container and each figure is
  capped so its longest unbroken run fits a full-width cell: `--stat-word` (characters, set by the
  page) × 1.1em, the widest this face sets ("Computed" is 8.55em). It binds only where the word
  would not fit, so normal-size figures are unchanged at 320/390/1280px. The cells' padding stays
  20px as text grows (as `.rung` does), so the words get the room. Now 0 mid-word breaks at
  320/390/768/1280px, normal and 200% text. Trade-off: at 320px and 200% text "Computed" sets at
  about the size of its label.
- **Words unchanged:** the `<main>` text (the page-dates hash) is identical on all 36 built pages,
  so no page is re-dated; the label keeps its "·" separators in the same text order.
- Tests (`tests/journey/visitor.spec.ts`): the ladder numbers 01 to 04 and is not a CSS counter;
  each case study's notes sit on their own line on a phone and share the line at 1280px; no figure
  breaks inside a word at 320/390/1280px, normal and 200% text. All failed on the old build.
- Undo: revert this slice's merge commit; Pages restores the previous CSS and markup.

## Frontend slice: every page readable at 320px and at 200% text (20 November 2026, t21036)

`body` hides horizontal overflow, so the site never scrolled sideways and a document-width check
passed; text that did not fit was clipped instead, out of sight. A walk over every painted line of
text in `<main>` on all 31 sitemap pages found **94 cut-off text runs on 12 pages**, 17 of them at
normal text size: a case study's figures "Computed", "One workflow" and "Thorough" ran under the
next cell on a 1280px desktop, "Findable" and "Computed" on a 390px phone, the status notes
("· Live in production") ran off a 320px screen, and /developers/ example URLs ran off a phone.
With text at 200% on a phone the figures were unreadable (`£30|`, `Hou|`), and /about/, /privacy/,
/releases/, /field-notes/ and /contact/ lost words at the right edge. After: **0** across the same
five checks (320/390/1280 px, normal and 200% text), and at 768px both ways.

- `body { overflow-wrap: break-word }`: a word longer than its line breaks. It changes no
  min-content size, so lines that already fit lay out as before.
- `.statband` is a wrapping flex row: the same cell widths as the old 150px auto-fit grid wherever
  the words fit, but a cell is never narrower than its longest word, and the 150px minimum grows
  twice as fast as the text (`max(150px, 18.75rem - 150px)`), so 200% text gets one column on a
  phone and two on a desktop.
- A case study's eyebrow wraps its status notes when its column is under 18rem (container query:
  a 320px screen or enlarged text; a 390px phone at normal text is unchanged). `.section-head__log`
  and `.note-row__meta` may wrap; `.case-card__foot` wraps its tags under "Read the case study".
  /about/'s story headings (which never break inside a word) are capped at `11cqi`, and its
  single-column layout is `minmax(0, 1fr)`.
- Full-page screenshots at 1280 and 390 px, normal text: 52 of 62 pixel-identical. The others are
  /contact/ (its height differs between two builds of the same commit), the four case studies'
  figure bands, /work/'s featured card footer, and /developers/, each where text was clipped or
  squeezed before.
- Test: `tests/journey/reflow.spec.ts` reads the served sitemap and fails on any text painted
  outside the screen, a clipping ancestor or its panel (`.stat`, `.rung`, `.offer`, `.case-card`,
  `.principle`, `.promise`, whose neighbours paint over it). It found all 94 on the old CSS.
- Undo: revert this slice's merge commit; Pages restores the previous CSS.

## Codebase slice: truthful page dates (12 November 2026, t19631)

`/api/pages.json` dated every static page without a hand-written date to the build, so each
deploy told agents and search engines that `/`, `/services/`, `/about/`, `/contact/` and three
more pages had just changed; the sitemap gave 10 of its 30 URLs no `<lastmod>` at all. Now the
build hashes each page's words (title, description, visible `<main>` text) into `contentSha256`,
and the deploy's Build step reads production's index (`SERVED_PAGES_URL`): unchanged words keep
the date production publishes, changed words take this deploy's time, and a page never dated
keeps its own (`src/integrations/page-dates.ts`). Every page in the index now has a sitemap
`<lastmod>`, the same date. Nothing is kept by hand, and an unreachable production falls back
to the old dates rather than failing the deploy.

- Tests: `tests/page-dates.test.ts` (the carry-forward rule, a redeploy keeps every date, chrome and
  scripts do not count, sitemap and index agree).
- The first deploy dates the seven static pages once (production published no hashes yet);
  from then on, only real word changes move a date.
- Undo: revert the merge; the index loses `contentSha256` (additive) and dates return to build time.

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
