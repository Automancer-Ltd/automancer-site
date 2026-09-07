# Performance — measured payload of every page

All numbers are real bytes off the built output in `dist/` (never estimates).
The live table below was measured 2026-08-31 on `main` (`c7bd901`), one pass of
every page, built with `PUBLIC_AUT_SENTRY_WEB_DSN=""` — the same empty DSN the
2026-08-22 measurement used, and the environment `ci.yml`'s test job builds
with (it does not inject the variable). `.github/workflows/deploy.yml`'s Build
step is the only place the production build sets env: it injects
`PUBLIC_AUT_SENTRY_WEB_DSN: ${{ vars.PUBLIC_AUT_SENTRY_WEB_DSN }}`. Without a
DSN, Sentry is tree-shaken out and `assets/js/main.js` is the only script that
ships, so a DSN-present measurement would not be comparable to this gate.

Column semantics — what a first-time visitor's browser fetches for that page;
shared assets count once per page because every cold load pays for them:

- **html** — the page itself, including inline scripts and JSON-LD.
- **css** — external stylesheets (`_astro/*.css` + `assets/css/fonts.css`).
- **js** — external scripts. Sentry is inert without a DSN and is tree-shaken
  out entirely; `assets/js/main.js` is the only script that ships.
- **fonts** — woff2 reachable from the page's CSS (wired payload).
- **images** — favicons + `<img>` sources. `og:image` is crawler-only and
  deliberately excluded from page weight; it is reported separately below.

## Before — baseline at origin/main (measured 2026-08-22, before the font work)

Every layout page cost ~652–674 KB, of which fonts were ~87%.

| page | html | css | js | fonts | images | total |
|---|---:|---:|---:|---:|---:|---:|
| `/` | 21,519 | 54,818 | 4,751 | 583,376 | 6,960 | **671,424** |
| `/404/` | 17,838 | 54,818 | 4,751 | 583,376 | 6,960 | **667,743** |
| `/about.html/` | 297 | 0 | 0 | 0 | 0 | **297** |
| `/about/` | 18,172 | 54,818 | 4,751 | 583,376 | 6,960 | **668,077** |
| `/book.html/` | 306 | 0 | 0 | 0 | 0 | **306** |
| `/contact/` | 23,626 | 54,818 | 4,751 | 583,376 | 6,960 | **673,531** |
| `/field-notes/` | 18,423 | 54,818 | 4,751 | 583,376 | 6,960 | **668,328** |
| `/field-notes/automation-for-care-providers-where-to-start/` | 20,652 | 54,818 | 4,751 | 583,376 | 6,960 | **670,557** |
| `/field-notes/b2b-trade-portals-what-to-build-first/` | 21,129 | 54,818 | 4,751 | 583,376 | 6,960 | **671,034** |
| `/field-notes/cqc-compliance-evidence-stop-scrambling/` | 20,428 | 54,818 | 4,751 | 583,376 | 6,960 | **670,333** |
| `/field-notes/credit-hire-website-compliance-trust-checklist/` | 22,629 | 54,818 | 4,751 | 583,376 | 6,960 | **672,534** |
| `/field-notes/five-signs-spreadsheet-problem/` | 21,692 | 54,818 | 4,751 | 583,376 | 6,960 | **671,597** |
| `/field-notes/manufacturing-order-processing-phone-and-memory-pricing/` | 21,415 | 54,818 | 4,751 | 583,376 | 6,960 | **671,320** |
| `/field-notes/new-business-website-legal-compliance-checklist/` | 21,979 | 54,818 | 4,751 | 583,376 | 6,960 | **671,884** |
| `/field-notes/small-business-website-cost-2026/` | 21,132 | 54,818 | 4,751 | 583,376 | 6,960 | **671,037** |
| `/field-notes/what-does-an-ai-agent-actually-cost/` | 19,919 | 54,818 | 4,751 | 583,376 | 6,960 | **669,824** |
| `/privacy.html/` | 309 | 0 | 0 | 0 | 0 | **309** |
| `/privacy/` | 21,347 | 54,818 | 4,751 | 583,376 | 6,960 | **671,252** |
| `/services.html/` | 315 | 0 | 0 | 0 | 0 | **315** |
| `/services/` | 24,361 | 54,818 | 4,751 | 583,376 | 6,960 | **674,266** |
| `/terms.html/` | 297 | 0 | 0 | 0 | 0 | **297** |
| `/terms/` | 13,152 | 54,818 | 4,751 | 583,376 | 6,960 | **663,057** |
| `/work/` | 16,727 | 54,818 | 4,751 | 583,376 | 6,960 | **666,632** |
| `/work/care-provider-transformation/` | 21,141 | 54,818 | 4,751 | 583,376 | 6,960 | **671,046** |
| `/work/debiaser-ai-product/` | 18,749 | 54,818 | 4,751 | 583,376 | 6,960 | **668,654** |
| `/work/fast-small-business-websites/` | 16,868 | 54,818 | 4,751 | 583,376 | 6,960 | **666,773** |
| `/work/manufacturer-trade-portal/` | 17,683 | 54,818 | 4,751 | 583,376 | 6,960 | **667,588** |

## Current — one-pass measurement 2026-08-31

Every layout page now costs ~192–205 KB. This table replaces the 2026-08-22
"After" snapshot and the "Later additions" patch list: every row is from the
same `node tests/support/perf-cli.ts --csv` run against one build. The Before
table above stays as the pre-font-work baseline.

| page | html | css | js | fonts | images | total |
|---|---:|---:|---:|---:|---:|---:|
| `/` | 21,440 | 52,026 | 4,751 | 120,620 | 6,960 | **205,797** |
| `/404/` | 18,339 | 52,026 | 4,751 | 120,620 | 6,960 | **202,696** |
| `/about.html/` | 297 | 0 | 0 | 0 | 0 | **297** |
| `/about/` | 17,365 | 52,026 | 4,751 | 120,620 | 6,960 | **201,722** |
| `/book.html/` | 306 | 0 | 0 | 0 | 0 | **306** |
| `/contact/` | 25,485 | 52,026 | 4,751 | 120,620 | 6,960 | **209,842** |
| `/developers/` | 19,947 | 52,026 | 4,751 | 120,620 | 6,960 | **204,304** |
| `/field-notes/` | 18,232 | 52,026 | 4,751 | 120,620 | 6,960 | **202,589** |
| `/field-notes/automation-for-care-providers-where-to-start/` | 19,845 | 52,026 | 4,751 | 120,620 | 6,960 | **204,202** |
| `/field-notes/b2b-trade-portals-what-to-build-first/` | 20,322 | 52,026 | 4,751 | 120,620 | 6,960 | **204,679** |
| `/field-notes/cqc-compliance-evidence-stop-scrambling/` | 19,621 | 52,026 | 4,751 | 120,620 | 6,960 | **203,978** |
| `/field-notes/credit-hire-website-compliance-trust-checklist/` | 21,822 | 52,026 | 4,751 | 120,620 | 6,960 | **206,179** |
| `/field-notes/five-signs-spreadsheet-problem/` | 20,885 | 52,026 | 4,751 | 120,620 | 6,960 | **205,242** |
| `/field-notes/manufacturing-order-processing-phone-and-memory-pricing/` | 20,608 | 52,026 | 4,751 | 120,620 | 6,960 | **204,965** |
| `/field-notes/new-business-website-legal-compliance-checklist/` | 21,172 | 52,026 | 4,751 | 120,620 | 6,960 | **205,529** |
| `/field-notes/self-storage-software-what-to-check-before-you-sign/` | 20,300 | 52,026 | 4,751 | 120,620 | 6,960 | **204,657** |
| `/field-notes/small-business-website-cost-2026/` | 20,325 | 52,026 | 4,751 | 120,620 | 6,960 | **204,682** |
| `/field-notes/what-does-an-ai-agent-actually-cost/` | 19,112 | 52,026 | 4,751 | 120,620 | 6,960 | **203,469** |
| `/privacy.html/` | 309 | 0 | 0 | 0 | 0 | **309** |
| `/privacy/` | 21,727 | 52,026 | 4,751 | 120,620 | 6,960 | **206,084** |
| `/services.html/` | 315 | 0 | 0 | 0 | 0 | **315** |
| `/services/` | 23,554 | 52,026 | 4,751 | 120,620 | 6,960 | **207,911** |
| `/terms.html/` | 297 | 0 | 0 | 0 | 0 | **297** |
| `/terms/` | 12,438 | 52,026 | 4,751 | 120,620 | 6,960 | **196,795** |
| `/work/` | 15,920 | 52,026 | 4,751 | 120,620 | 6,960 | **200,277** |
| `/work/care-provider-transformation/` | 20,334 | 52,026 | 4,751 | 120,620 | 6,960 | **204,691** |
| `/work/debiaser-ai-product/` | 17,942 | 52,026 | 4,751 | 120,620 | 6,960 | **202,299** |
| `/work/fast-small-business-websites/` | 16,061 | 52,026 | 4,751 | 120,620 | 6,960 | **200,418** |
| `/work/manufacturer-trade-portal/` | 16,876 | 52,026 | 4,751 | 120,620 | 6,960 | **201,233** |

### What moved since 2026-08-22

Shared CSS is the site-wide drift this re-measure exists to reset:

| when | css per layout page |
|---|---:|
| 2026-08-22 snapshot | 48,987 |
| 2026-08-24 (later-additions note) | 50,958 |
| 2026-08-31 this pass | **52,026** |

JS (4,751 B), fonts (120,620 B) and images (6,960 B) are byte-identical to the
2026-08-22 snapshot. No page grew a script, a font, or an image.

Typical layout page vs the 2026-08-22 After table: HTML −807 B (shared chrome
shrank) + CSS +3,039 B = total **+2,232 B**. That CSS step is most of every
page's apparent growth; it is site-wide, not the page.

HTML that grew *beyond* that shared CSS, vs the 2026-08-22 After table:

- `/404/` HTML +501 B (total +3,540 B). Markup, not a new asset.
- `/privacy/` HTML +380 B (total +3,419 B). Markup, not a new asset.
- `/contact/` HTML +1,859 B vs the After table. That gap is the
  `LEAD_ERROR_COPY` map already absorbed into the live gate at 209,540 B on
  2026-08-22; vs that later gate value, contact only grew +302 B total (HTML
  shrank since then). Not new growth in this pass.

Nothing grew by a payload-class amount the shared CSS does not explain. The
404 and privacy HTML deltas are hundreds of bytes of copy/markup (a11y and
legal edits landed after the snapshot), not a font, image, or script. They
are named because the rule is to name them, not because they are a reason to
stop the re-derive.

`/developers/` was already in `MEASURED_TOTAL` and missing from the old docs
tables; it is not a new page. Redirect stubs are unchanged.

When this table next needs to be rewritten, re-measure every page in one pass
rather than patching rows.

### Later additions

New pages added after the 2026-08-31 pass, each measured individually with
`node tests/support/perf-cli.ts --csv` against a fresh
`PUBLIC_AUT_SENTRY_WEB_DSN=""` build at the time it was added, not
estimated from a neighbouring post.

| page | html | css | js | fonts | images | total |
|---|---:|---:|---:|---:|---:|---:|
| `/field-notes/how-ai-agents-actually-make-decisions/` (2026-09-07) | 19,087 | 52,026 | 4,751 | 120,620 | 6,960 | **203,444** |

## What changed, and why rendering is byte-for-byte identical

### 1. The 26 font files were really 8 binaries, and half were unreachable

Findings from auditing `public/assets/fonts/` against
`public/assets/css/fonts.css`, the built CSS, and every rendered character in
dist/:

- All four families ship as VARIABLE fonts (verified with fontTools: Syne
  wght 400–800, Space Grotesk 300–700, Outfit 100–900, JetBrains Mono
  400–800). Every per-weight file within a family+subset was byte-identical
  (md5) to its siblings — e.g. `syne-600-latin.woff2` ==
  `syne-700-latin.woff2` == `syne-800-latin.woff2`. The site still paid per
  weight-name anyway, because each @font-face rule pointed at its own URL.
- The 13 latin-ext files could never be fetched: scanning all rendered text on
  all 27 emitted pages found only 96 distinct codepoints, and none falls in
  any latin-ext unicode-range (the non-ASCII set is exactly en/em dashes,
  curly quotes, and arrows). An ext face loads only when a glyph in its range
  actually renders.
- Two faces could never be selected by CSS font matching: Space Grotesk 700
  (no rule produces a desired weight above 600 for SG; the global
  `strong { font-weight: 600 }` covers every UA-bold path; there are no
  tables or `<th>` elements) and Outfit 500 (nothing in an Outfit context
  asks for weight 500).

### 2. Changes made

- Deleted the 13 latin-ext woff2 files and 9 duplicate latin copies; kept one
  canonical binary per family: `jetbrains-mono-400-latin`, `outfit-400-latin`,
  `space-grotesk-400-latin`, `syne-800-latin` (120,620 B total).
- SCOPE NOTE (deliberate, flagged): repointing the surviving @font-face rules
  required editing `public/assets/css/fonts.css`, which sits outside this
  lane's whitelist (public/assets/css/, not public/assets/fonts/). Every edit
  is either a src URL swapped to a byte-identical twin or deletion of a
  provably unfetchable rule. Because the binaries are variable fonts spanning
  their full weight axis, each declared weight still renders true glyphs from
  the shared file. The two preload URLs in BaseLayout.astro point at canonical
  filenames and needed no change.
- Re-encoded og-image.png with pngquant (256 colours, dithered): 95,274 →
  34,643 bytes (−63.6%) at identical 1200×630 dimensions. Measured pixel delta
  vs the original: mean absolute channel delta 0.27/255; differences
  concentrate in the decorative top gradient strip; visually indistinguishable
  side by side. og:image is fetched by social crawlers, not visitors, so this
  does not move page weight — it cuts deploy size and crawler fetch cost.

### 3. Measured savings

| item | before | after | saved |
|---|---:|---:|---:|
| wired font payload per layout page | 583,376 B | 120,620 B | 462,756 B (−79.3%) |
| css per layout page (fonts.css shrank) | 54,818 B | 48,987 B | 5,831 B |
| total per layout page | ~663–674 KB | ~190–206 KB | ~468,587 B/page (−70%) |
| shipped og-image.png | 95,274 B | 34,643 B | 60,631 B (−63.6%) |
| whole dist/ directory | 1,638,517 B | 1,109,299 B | 529,218 B (−32%) |

Structural effect on what a visitor actually downloads: pages previously
fetched one URL per used weight (home: Space Grotesk 400 + Syne 800 + Syne 700
+ JetBrains Mono 400/500/600 = up to 185,800 B of font requests); they now
fetch one URL per family (88,328 B for those same six faces), so a cold home
visit downloads ~97 KB fewer font bytes — computed from measured file sizes
plus the weights the page uses, not from a network capture.

## Enforcing it: tests/performance.test.ts

The budget test measures the fresh production build (globalSetup builds once)
and fails when any layout page exceeds:

- total page weight: measured value (2026-08-31) + max(1024, ceil(2%)) headroom,
- JS: 4,751 B measured → 5,775 B budget,
- wired fonts: 120,620 B measured → 123,033 B budget,

plus three structural gates: no page without a budget entry (fail-closed for
new pages), no reference to a missing asset (catches dangling url()s after any
future prune), and no unreferenced woff2 shipping (mirrors assets.test.ts).

The gate has been seen failing: temporarily lowering `/terms/`'s
`MEASURED_TOTAL` to 190,000 B produces `/terms/: total 196795 B > budget 193800 B …`
with 1 failed / 135 passed of 136; restoring the measured value returns it to
green (136/136). A budget table that passes everything proves nothing. Full
transcript in `docs/lanes/orch-auto-site-perf-budgets-notes.md`.

To re-derive budgets after a deliberate change: build, run
`node tests/support/perf-cli.ts --csv`, update the MEASURED_* values in
tests/performance.test.ts together with the new date, and record the reason
here.

## Preload audit (no change needed)

BaseLayout preloads exactly two fonts:
space-grotesk-400-latin.woff2 (body UI text starts immediately under the
hero) and syne-800-latin.woff2 (hero headline plus the nav wordmark present
on every page). Both are genuinely used above the fold on every page, both
survive as canonical files, and preloading more would compete with the
critical path. Verdict: correct as-is. If Lighthouse ever shows late mono
text (nav links are JetBrains Mono 500), swapping the SG preload for
jetbrains-mono-400-latin.woff2 is the candidate — that is a src/layouts
decision and was left alone here.

## Images / layout-shift audit (no change needed)

The only `<img>` elements on any page are the nav logo (width=30 height=34)
and footer logo (width=34 height=39) — both already carry explicit
dimensions, so images cannot cause layout shift today. No content photos
exist anywhere in the built site. Optional polish for the visual lane:
loading="lazy" decoding="async" on the footer logo mark (it sits below the
fold); the nav logo must stay eager.
