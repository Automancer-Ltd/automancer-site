# Docs index — automancer-site

Authority inside this repository, highest first. A newer dated document supersedes an
older one on the same subject; this file is the index that says so.

1. **`VISION.md`** (repo root) — what the site is for. Authority 0; only Waseem changes it.
2. **`docs/SPEC.md`** — what is being built. *Not present.* This repo has never carried a
   separate spec: `VISION.md` plus the root `README.md` (stack and build) have stood in for
   one. Recorded here so the next agent stops looking rather than writing a duplicate.
3. **`docs/ARCHITECTURE.md`** — how it is built and where it runs. *Not present.* The deploy
   contract lives in `docs/DEPLOYMENT.md` (below); the stack is in the root `README.md`.
4. **`docs/DECISIONS.md`** — append-only decision record. *Not present.* Site decisions have
   been recorded in commit messages and release notes.
5. **`docs/PLAN.md`** — what is next. Renamed from `docs/PLANNED-WORK.md` on 2026-09-05
   (estate review) so every repo names this document the same way.

## Runbooks — current, read them before operating the site

| File | What it answers |
|---|---|
| `DEPLOYMENT.md` | How a change reaches automancer.uk, the release-notes pre-push gate, and how to verify a deploy landed |
| `PERFORMANCE.md` | The measured payload budget per page and how it is enforced |
| `AGENT-READINESS.md` | What the machine surfaces (`llms.txt`, `agent.json`, JSON-LD) promise and the tests that pin them |

## Run records — closed, kept for evidence, not for instruction

Nothing in these directories is a current instruction. They are dated records of finished
work, kept because they carry the method behind a measurement.

| Path | What it is |
|---|---|
| `archive/2026-08-31-ox-alpha-campaign.md` | The Ox Alpha campaign log, closed 2026-08-31. Moved here on 2026-09-05 from `docs/ox-alpha-campaign.md`; older notes that cite the old path mean this file. |
| `lanes/` | Per-lane measurement records from campaign 003 (contrast, performance budgets, Sentry check), 2026-08-31 |
| `notes/` | Per-lane working notes from the 2026-08-30 estate lanes |

## The rule for adding to this directory

A new document is one of the five above, a runbook, or a dated run record. If it is a run
record, add its line to the table when you add the file. Nothing here is deleted; archiving
is a move plus a line in this index.
