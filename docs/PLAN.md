# Planned work — automancer-site

Improvements and open questions carried out of campaign 003 (31 Aug 2026) so they survive the
campaign queue, which is discarded when the campaign closes. **Nothing here is broken** — defects
are filed as Paperclip issues on *AUTO — Website & BD Engine* instead. Each entry says what it is,
what "done" looks like, and what has already been measured, so nobody re-derives it.

## 1. Three AA contrast failures on readable text — a design call, not a bug fix

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

**Accepted exceptions, recorded not silently passed:** the 14 proof-strip separator dots (EX-1) and
the numerals as decoration (EX-2) — both `aria-hidden` candidates.

**Done looks like:** those elements measure at or above threshold, **re-measured by the same method**
so the numbers are comparable, or are recorded as accepted exceptions with a stated reason. This is a
frontend pass (use the `impeccable` skill), not a text edit — changing a gradient stop by eye is
exactly how a 1.47 becomes a 3.9 that nobody checks.

## 2. The rollback runbook has never been run

`docs/DEPLOYMENT.md` gives two rollback paths — revert one commit and push, or reset to a
pre-campaign tag and force-push. **Neither has ever been exercised**, so the first use will be during
an incident. The force-push path also interacts with the pre-push hooks this repo now has.

**Done looks like:** the single-commit revert path rehearsed end to end at least once and the result
written into the runbook. **Note the hazard that stopped this being done during the campaign:** the
site deploys from `main`, so a live rehearsal briefly changes the public site. Plan how to do it
safely before doing it — that judgement is the work.

## 3. The is-agentic score was never re-measured

Scored 63/100 before the agent-readiness work shipped and never re-run, so nobody knows what the
work bought. **Done looks like:** re-run and record both numbers together.

## 4. Two worktrees share this repo's git settings

A `git config` change in one silently changes the other. **This is a live foot-gun, not a
theoretical one** — on 31 Aug an agent elsewhere on the estate disarmed a working checkout's hooks by
running `git config` inside a linked worktree. **The test before any config write:** `.git` a FILE
means a linked worktree sharing its primary's config; `.git` a DIRECTORY means a standalone clone.

## 5. Leftover design-tool directories

`./.impeccable` and siblings are still sitting in the repo. Cosmetic; decide keep or remove.

---

## NEEDS WASEEM

Filed as `WASEEM DECISION` Paperclip issues on *AUTO — Website & BD Engine* as well, so they are
collectible; repeated here so they survive any tool.

- **AUT-7594 — three pieces of text fail readability, and fixing them means changing colours you
  chose.** The footer line "very good engineering" measures ~1.5 against a needed 4.5. Two offer
  labels sit at 4.18. The decorative numerals look like two of three have their light and dark
  outline colours swapped — check that before treating it as decoration.
- **AUT-7596 — prove the error alerts reach a real person.** Connecting the detector is
  straightforward; deliberately causing a live error and confirming a named person received the
  alert is not something an agent should do unsupervised.
