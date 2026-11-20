# HANDOVER — automancer-site

**What this file is.** The roadmap the next improvement slice reads before planning. It records
where the site stands against `VISION.md`, what the last slice shipped (with evidence and undo),
the next three slices in the order they should be taken, and the questions that are genuinely open.
It does not outrank anything: `VISION.md` is authority 0 and `SPEC.md` describes what is built.
When this file and `SPEC.md` disagree about what exists, `SPEC.md` and the code are right and this
file is out of date.

Last updated: 20 November 2026 (field notes: opening line on a laptop's first screen, and Keep reading, t22126).

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

1. **Mark "Business name" optional on /contact/.** The intake API and the form treat it as
   optional (and `/api/enquiry.json` says `required: false`), but it is the only optional field
   without the "(optional)" marker. Change it only in a task authorizing visible wording.
2. **Let siteVerify read the page dates.** Production now publishes when each page's words last
   changed (`contentSha256`, t19631). estate-watch could alert when a page's hash changes without a
   deploy, or when a deploy re-dates pages whose words did not change.

3. **Close the gap above a field note's first paragraph on phones.** At 390px the article header's
   spectrum rule is followed by about 130px of empty space before the body starts, so the first
   screen shows the title and little else. Measure the header-to-body spacing against the case
   studies' and tighten it on narrow screens only; show before/after.

The former cache and release-note slices shipped in PRs #164 and #165 respectively.

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
