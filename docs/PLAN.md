# Planned work — automancer-site

Improvements and open questions carried out of campaign 003 (31 Aug 2026) so they survive the
campaign queue, which is discarded when the campaign closes. **Nothing here is broken** — defects
are filed as Paperclip issues on *AUTO — Website & BD Engine* instead. Each entry says what it is,
what "done" looks like, and what has already been measured, so nobody re-derives it.

## 1. Three AA contrast failures on readable text — resolved 2026-09-24

Measured 31 Aug at the fully-revealed page state a reader actually experiences (140 nodes: 121 pass,
19 fail, 0 unmeasurable, plus 2 axe-computed). Full per-element table with method and ratios:
`docs/lanes/orch-auto-site-contrast-notes.md` (closed run record — see `docs/README.md`).

- **Footer spectral tagline** "very good engineering" (gradient text, 13.76px): **1.47 / 1.62 / 1.48**
  against a 4.5 threshold, at the darkest gradient stop over the black footer. **Real readable text
  with no exception claimed — the worst finding on the site.** Suggested fix: raise the gradient's
  dark stop.
- **Two `.offer__step` labels**: `#7b7b86` on `#ffffff` = **4.18:1** against 4.5. A near miss and the
  cheapest to fix; suggested the paper-surface muted token.
- **Ghost offer numerals look token-inverted**, which is a bug hiding in a taste question: "02"
  passes at **11.62** while "01" sits at **1.73** and "04" at **1.64**. One of three passing by a
  factor of seven suggests the light and dark stroke tokens are swapped on two of them. **Check that
  before treating it as an exception.**
  - *Finding (2026-09-21):* **Not a token swap.** Verified in `src/styles/global.css`, `src/pages/services.astro`, and rendered DOM via Chromium. The CSS rules systematically assign `-webkit-text-stroke-color: var(--ghost-paper)` (`#c4c4cc`, light) on `.on-paper` sections, and fallback `-webkit-text-stroke: 1px var(--border-strong)` (`#34343d`, dark) on default/dark sections. Both pairs are deliberate low-contrast "ghost" strokes against their backdrops (~1.73:1 for light stroke on white paper `#ffffff` on 01/03, ~1.64:1 for dark stroke on black `#000000`/`#08080a` on 02/04). The apparent 11.62 ratio for "02" in the 31 Aug contrast notes was a measurement anomaly in the test script (which recorded `#offer-2` as having light stroke `rgb(196, 196, 204)` and `#offer-3` as `rgba(0,0,0,0)`); in reality, in computed style `#offer-2` has `strokeColor: rgb(52, 52, 61)` (1.64:1), identical to `#offer-4`. No colours changed; remains a deliberate decorative choice (`aria-hidden="true"`, EX-2 exception candidate for Waseem under AUT-7594).

**Resolved 2026-09-24 (AUT-7594; Magnus decided the fix-or-accept split).** The before/after
re-measure, its method and a calibration are in `docs/lanes/2026-09-24-contrast-remeasure.md`.

- **Footer tagline: fixed. 1.47 / 1.62 / 1.48 (31 Aug) → 4.68 on all three pages.** The footer now
  paints `--spectrum-text`. That is the same spectrum with the violet stop lifted along its own hue,
  `#7744ff` → `#8455ff`, and the worst point of the gradient is 4.7:1 on black. Measuring the colour
  the glyphs are painted with gives **4.04 → 4.68**. The 31 Aug figure of ~1.5 was mostly
  antialiasing: at 13.76px that statistic reads a solid 9.02:1 link as 1.45. The tagline did fail,
  but at 4.04. The fix is pinned in `tests/contrast.test.ts`.
- **`STEP 01` / `STEP 03`: fixed. 4.18 → 5.12.** Paper sections now use `--faint-dark`, the
  paper-surface label token.
- **EX-1: accepted exception.** The 14 proof-strip `·` separators, 2.22:1. They are decoration
  inside the `aria-hidden` marquee track; the static summary carries the content.
- **EX-2: accepted exception.** The ghost offer numerals, 1.64–1.73:1. They are `aria-hidden`
  outline figures, and the STEP label and offer name carry the information. Not a token swap
  (finding above).

## 2. The rollback runbook has never been run

`docs/DEPLOYMENT.md` gives two rollback paths — revert one commit and push, or reset to a
pre-campaign tag and force-push. **Neither has ever been exercised**, so the first use will be during
an incident. The force-push path also interacts with the pre-push hooks this repo now has.

**Done looks like:** the single-commit revert path rehearsed end to end at least once and the result
written into the runbook. **The public site deploys from `main`, so do not rehearse against it.** Current `deploy.yml`
deploys only on pushes to `main` or manual dispatch; PR CI builds and tests without deploying a preview. There is no
isolated preview target in this workflow. The safe rehearsal therefore needs a separately identified, non-production
target first. On that target, deploy a harmless candidate from a temporary branch, record the served revision, revert
the candidate on the branch, and verify the preview serves the starting revision. Keep the full-restore/force-push
path out of the rehearsal. Do not create a new hosting resource in this task. Until a non-production target is
available, the runbook rehearsal remains unproven; a local `git revert` alone is not an end-to-end rehearsal.

**Resolved 2026-10-18.** The target exists and the single-commit revert path has been rehearsed on it end to
end. `ops/preview/` adds the target (a marked release directory served by the user unit
`automancer-site-preview.service` over the tailnet, no new hosting resource) and `docs/DEPLOYMENT.md` now
carries the commands exercised, with their observed output, and the two defects the rehearsal caught in the
target itself. Sequence observed: candidate `3cd90d8` on a temporary branch served by the target → `git revert`
+ push → `d2de53e` served, byte-identical to the starting revision once the build stamp is normalised, with the
candidate-only file answering 404 again. `automancer.uk` was never involved (it served `1135f5e` throughout).
Transcript: `/opt/automancer/var/scratch/s1621/rehearsal.log`. The force-push/full-restore path stays out of
scope on purpose and is now named in the runbook as the one unexercised path.

## 3. The is-agentic score was never re-measured

Scored 63/100 before the agent-readiness work shipped and never re-run, so nobody knows what the
work bought. **Done looks like:** re-run and record both numbers together.

**Re-measured 2026-09-21:**
- **Baseline (2026-08-22):** **63 / 100** ("Important blockers remain", 8 failed · 3 partial)
  - Essential: 48.9 / 80 (5 / 9 passed)
  - Recommended: 11.5 / 20 (7 / 14 passed)
  - Bonus: +2.1 (10 positive signals)
- **Re-run (2026-09-21T20:56:48.003Z via official scan stream API / `npx is-agentic automancer.uk`):** **79 / 100** ("Ready with a few material gaps", 6 failed · 3 partial)
  - Essential: 61.8 / 80 (8 / 11 passed)
  - Recommended: 14.7 / 20 (14 / 20 passed)
  - Bonus: +2.1 (10 positive signals)
  - Net gain: **+16 points**.
  - Remaining 6 failures: JSON error responses (Essential, static host limitation), Markdown content negotiation (Essential, acceptmarkdown.com / GitHub Pages limitation), REST typed error model (Recommended), REST versioning / deprecation policy (Recommended), CLI tool available (Recommended), Rate limit response headers (Recommended).
  - **One of those six was answered on 2026-10-20:** the versioning / deprecation policy is now
    published as data at `/api/stability.json` (see `SPEC.md` and `HANDOVER.md`). The score itself
    has still not been re-run — when it is, that finding should move from failed to passed, and the
    remaining list above is what decides whether anything else is worth doing.
  - Remaining 3 partials: Agent-friendly 404s (Essential), Developer resource discoverability (Recommended), Brand name discoverability (Recommended).

**Re-measured 2026-10-21:** **58 / 100** (grade C) on a rebuilt scanner of about 130 checks, against
**77 / 100** for the stored September report rescored under the same rubric. The two September
figures above came from a 30-check rubric and do not compare with either. What the new failures
say, what was fixed and what is deliberately not pursued: `docs/AGENT-READINESS.md`, "Re-measured
2026-10-21".

## 4. Two worktrees share this repo's git settings

A `git config` change in one silently changes the other. **This is a live foot-gun, not a
theoretical one** — on 31 Aug an agent elsewhere on the estate disarmed a working checkout's hooks by
running `git config` inside a linked worktree. **The test before any config write:** `.git` a FILE
means a linked worktree sharing its primary's config; `.git` a DIRECTORY means a standalone clone.

**Guard added 2026-09-21:** `scripts/safe-git-config.sh` is a `git config` wrapper that classifies
the checkout (`.git` file vs directory) and **refuses** a config write in a linked worktree, printing
the safe alternatives (`git config --worktree`, run it in the primary, or set
`ALLOW_LINKED_WORKTREE_CONFIG=1` for a deliberate shared write). Standalone clones pass straight
through; outside a git repo it refuses. Suggested alias so the guard is the default path:
`git config alias.cfg '!scripts/safe-git-config.sh'` → `git cfg <args>` (set it in a standalone
clone). The hook wiring in this repo is shared estate tooling (`release-notes.mjs`), so the guard is
a repo-local script rather than a hook — hooks cannot intercept a bare `git config` anyway.
`tests/git-config-guard.test.ts` proves classification against three real fixtures and proves the
hazard itself: bypassing the guard in a linked-worktree fixture demonstrably writes the **primary**
checkout's config.

## 5. Leftover design-tool directories

`./.impeccable` and siblings are still sitting in the repo. Cosmetic; decide keep or remove.

**Resolved 2026-09-21:**
- **Inventory in primary checkout (`/opt/automancer/projects/automancer/automancer-site`):**
  - `.impeccable/` (8.0 KB) — contains `hook.cache.json` (3,081 bytes), tool session cache from July/August 2026.
  - `src/content/case-studies/.impeccable/` (8.0 KB) — contains `hook.cache.json` (778 bytes), tool session cache from July 2026.
- **Reference check:** Full grep confirmed zero references in the site application code, configs, scripts, or tests.
- **Git status:** These directories were never committed or tracked in git history; worktree checkouts do not contain them.
- **Action taken:** Added `.impeccable/` to `.gitignore` so that future sessions using the `impeccable` skill never leave untracked scratch directories visible to git. Untracked scratch files in the primary checkout left for the repo owner per estate boundary rules.

---

## Resolved decisions

- **AUT-7596 — prove the error alerts reach a real person. Resolved 2026-09-24** (merge
  `3d94191`). A tagged test event was sent through the live site and traced end to end to the
  estate poller's Paperclip alert card plus the morning digest — the person-routing this section
  was waiting on. The proof and repeat-me steps live in `docs/DEPLOYMENT.md` ("Where a Sentry
  error goes"); the Paperclip issue is closed as done. Nothing else is waiting on Waseem in this
  repository.
