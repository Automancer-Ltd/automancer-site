# Ox Alpha Campaign — automancer.uk

**For the morning check-in.** Detail and incident notes follow below; this is the
part worth reading first.

## What shipped, and what it means for the site

Everything below is on `main`, released, and verified against the live site —
not against CI, and not against a lane's report. Production tracks `main` within
about 40 seconds, so every merge tonight was treated as a deploy.

| What | Why it matters |
|---|---|
| **A test suite, from zero to 62 assertions** | The repo had no tests at all. These run against the real built site, so they assert what a visitor or a crawler actually receives. |
| **Nine real defects fixed** | Found by those tests, fixed at source rather than by relaxing the test. Every page skipped from `h2` to `h4` (a genuine accessibility fault), the 404 page had no heading, and four pages had search descriptions too long to display in full. |
| **The agent-readiness work you asked for** | 19 Markdown versions of pages, six JSON endpoints, RSS and JSON feeds, a full-site text document, an agent manifest, and a `robots.txt` that names 19 AI crawlers and blocks none of them. |
| **Astro 7.1.6 → 7.2.4 and the upstream backlog** | The local checkout was five commits behind and nobody had noticed. Integrated, reinstalled, re-verified against the real dependency set. |
| **Production is now checked after every deploy** | A new mandatory job fetches the live site and fails the run if it is wrong. The same checks also run on a `*/30` cron; measured 31 Aug 2026 from 174 scheduled runs (22–31 Aug), the gap is a median 45.5 minutes (mean 74.5; longest 12.5 hours), not twice an hour. Previously nothing would have told us the site was down. |
| **14 dead files removed** | Superseded images and an unused stylesheet, each proven unreferenced, with a test that fails if one reappears. |

## The agent-readiness score, measured

is-agentic.com publishes an official CLI, so this is a real reading rather than
my opinion:

    npx is-agentic automancer.uk        ->  63 / 100
    Essential 48.9/80 · Recommended 11.5/20 · Bonus +2.1
    https://is-agentic.com/scan/automancer.uk

**I expected better and was wrong**, which is the useful part. I built the
machine-readable surface against their published methodology and assumed it
would score well. Measuring found things reading could not:

- We publish six JSON endpoints and **no OpenAPI spec**, which fails one
  Essential check and two Recommended ones at once.
- The scanner reads our structured data as a **Person**, not the Organization
  we thought was primary.
- One Essential failure is **not ours to fix**: it wants `Accept: text/markdown`
  content negotiation with `Vary: Accept`, and GitHub Pages serves static files
  with no negotiation and no custom headers. Our `.md` twins at explicit URLs
  are the best available on this host. I have told the lane not to fake it.
- Two more are search-index outcomes, not code.

### What was fixed, and why there is no new score yet

All five fixable findings are live and each was verified individually against
production, not against the build:

| Finding | Status |
|---|---|
| OpenAPI spec published (Essential) | `/openapi.json` — OpenAPI 3.1, 6 paths, 6 operations, every one with a unique `operationId` and a description |
| API schema complexity / function calling | same document — one spec answers all three |
| Developer resource discoverability | `/developers` page, linked from the homepage and `llms.txt` |
| Agent when-to-use guidance | "When to use Automancer" section in `/llms.txt` |
| JSON-LD Person incomplete | `url` and `jobTitle` added. **`sameAs` deliberately omitted** — no genuine public profile exists in the repo, and inventing one would be false structured data about a real person |

**The score still reads 63/100, and that number is stale.** Re-running the CLI
returned a report with the *identical* `scanned_at` timestamp
(`2026-08-22T01:18:36.717Z`) — it never re-scanned. Confirmed from the tool
itself: `--help` says it retrieves the latest report, "scanning the site when
none exists"; the API is read-only (`POST` returns 405). **A fresh scan can only
be started from the browser form.**

I am recording this rather than quietly reporting an unchanged score, because an
unchanged score after a fix reads as "the fix did not work" — a conclusion
someone would act on, by reverting good work or piling on more changes against a
stale baseline.

Two findings are deliberately NOT fixed and will keep failing: markdown content
negotiation with `Vary: Accept` (GitHub Pages cannot do content negotiation or
custom headers) and brand-name search discoverability (an index outcome).

## What is still in progress

- **`/.well-known/agent.json` returns 404 in production.** GitHub Pages does not
  serve any path beginning with a dot — the files build correctly and are simply
  never served. Our own `llms.txt` advertises that URL, so agents following it
  get a 404. A fix is mid-flight: the same documents served from `/agent.json`
  and `/security.txt`, which Pages does serve.
- **A visual and accessibility pass** is running against the existing design.

## If something looks wrong

`docs/DEPLOYMENT.md` has the rollback. In short: almost always a one-commit
revert, because only one commit changes what a visitor sees. Redeploy is
automatic on push and takes about 40 seconds.

---

**Repo:** `automancer/automancer-site` (public marketing site, automancer.uk)
**Orchestrator:** Claude (herdr pane w2), delegated authority via campaign lead.
**Started:** 2026-08-21 evening (UK).
**Baseline tag (undo point):** `ox-campaign-baseline-2026-08-21` at `fc50855`.
**Deploy rights:** full — non-client repo, Pages-via-workflow on push to `main`.

## Goal

Make automancer.uk materially better in one night of unmetered ox-alpha lanes.
Priority handed down: **IDEAS.md item 2 — is-agentic.com agent-readiness.**
automancer.uk should score highly. Public website copy is not gated.

## Starting state (surveyed 2026-08-21)

- Astro 7 static site, 37 files in `src/`, deployed to GitHub Pages.
- **Zero tests.** No test runner, no CI check beyond the deploy workflow.
- No `VISION.md`, no `docs/` directory before this file.
- Agent-readiness already present: `/llms.txt` (generated from `src/data/business.ts`),
  `robots.txt` with sitemap, `@astrojs/sitemap`, a `JsonLd` component.
- Working tree was **clean** at campaign start — no pre-existing uncommitted work
  to absorb or rescue.

## Staged programme

| # | Slice | Status |
|---|-------|--------|
| 0 | Baseline tag + plan file | done |
| 1 | Survey — honest architecture/risk/debt report | running (`survey2`) |
| 2 | Safety net — vitest harness over the built output + CI | running (`testnet2`) |
| 3 | Agent-readiness (is-agentic.com) — the flagship slice | briefed, queued |
| 4 | Frontend / a11y / performance pass | briefed, queued |
| 5 | Drift + dead-asset cleanup | briefed, queued |
| 6 | Further slices decided from the survey | pending |

## Lanes

| Lane | Brief | Outcome |
|------|-------|---------|
| `survey` | Read whole repo, report architecture/risks/debt | **dead — landed nothing** (omp no-op) |
| `testnet` | Build vitest harness from zero | **dead — landed nothing** (omp no-op) |
| `survey2` | Same brief, absolute path, opencode path | running |
| `testnet2` | Same brief, absolute path, opencode path | running |

## Decisions taken without Waseem

- (logged to the campaign `DECISIONS.md` as they happen; mirrored here)

## Findings

- (filled in as lanes land)

## What is-agentic.com actually measures (researched 2026-08-21)

Scoring is three pools:

- **Essential — 80 points.** Server-rendered content available without running
  JavaScript; correct HTTP behaviour and status codes; clear document structure;
  error recovery; usable interactive controls.
- **Recommended — 20 points, conditional.** Only activates where the site shows
  evidence it offers that capability: API endpoints, OAuth, GraphQL, an MCP
  server, a developer portal, e-commerce. Checks that do not apply are excluded
  rather than failed, so a brochure site is not punished for lacking a checkout.
- **Bonus — capped at 5 points.** Emerging formats (llms.txt and similar). Bonus
  can only add, never subtract.

There is also a non-scoring "observed agent journey" — a real agent is driven
around the site and its path is reported as evidence.

**What that means for us.** Being a static Astro site already wins most of the
Essential pool: everything is server-rendered and there is no JS gate. The two
real Essential exposures are (a) HTTP status correctness — our legacy redirects
in `astro.config.mjs` are emitted as meta-refresh pages, which return **200, not
301**, and (b) error recovery and interactive controls, which nobody has audited.
The Recommended pool is the interesting one: it is conditional, so the way to
earn it is to genuinely *offer* machine-readable capabilities and advertise them.

## Throttle (campaign lead, 2026-08-21 ~22:15 UTC)

Box overloaded — load 61 on 20 cores, swap exhausted. Adopted immediately:
max **2** concurrent lanes, never a build or full test run while two lanes are
up, PID-targeted kills only, and temp-file-then-`mv` for any shared file.

Also noted: pass `oxlane` an **absolute** repo path. Passing `.` names the log
file `.-<lane>-<stamp>.log`, which is hidden and easy to miss when verifying.

## Lane failure and re-dispatch (2026-08-21 ~22:15 UTC)

The first two lanes (`survey`, `testnet`) both produced **nothing**. Verified from
disk and git, not from their logs: no `tests/` directory, no change to
`package.json`, no survey document, clean working tree — while one had exited
with status 0 and a plausible-looking log.

Root cause was found campaign-wide by three other orchestrators: the `omp`
harness silently no-ops on any tool-using task with this model. It prints
"Working...", exits 0, and does no work. The model itself was fine throughout —
a prompt with no tools answers instantly. The campaign lead has repointed the
`oxlane` helper at `opencode run`, which is verified end to end doing real file
edits.

Three separate silent failure modes were in play in the first twenty minutes:
a truncated helper script (exit 127), a stdin-EOF patch (exit 0, no work), and
`omp`'s tool loop (exit 0, no work). All three look like success from outside.

**Standing rule adopted for the rest of this campaign: a lane is not done until
its work has been seen on disk.** An exit code and a plausible log prove nothing.

Both lanes re-dispatched on the working path as `survey2` and `testnet2`, this
time with absolute repo paths. Both confirmed producing real output.

## Partial-write audit (2026-08-21 ~22:25 UTC)

The campaign lead corrected an earlier instruction: the dangerous failure mode is
not a clean no-op but a **partial write** — early tool calls land, then the loop
dies, leaving a plausible half-state that only fails on first use. Another repo
had a lane whose entire visible output was "Working..." which had nonetheless
edited `package.json`, written 270 lines of lockfile, and added a script pointing
at a config file it never created.

Audited this repo against the baseline tag for exactly that. **Clean.**

- Only delta since baseline: three `docs/ox-alpha-campaign.md` commits.
- `git status --porcelain` empty — no untracked files either.
- `package.json` and `pnpm-lock.yaml` byte-identical to baseline.
- Gitignored paths checked too, since git would never have shown them: there is
  no `node_modules` directory at all, so the dead lane never reached
  `pnpm install`. No `dist/`.
- Filesystem sweep: the only file in the repo modified since 22:00 is the plan
  file.
- Reflog clean — no stray checkout or reset.

Both dead lanes here died *before* their first write. Nothing to keep or revert,
so the replacement lanes started from a genuinely clean tree.

Incidental find, deferred to the cleanup slice: `.impeccable/` directories are
gitignored but present, including one nested at
`src/content/case-studies/.impeccable/`. Leftovers from an earlier design run.

## Production verified from artifacts, and a correction to my own claim

After shipping v2026.08.21.1 I checked the live site rather than the workflow's
green tick. Both runs (CI and Deploy to GitHub Pages) succeeded, and production
genuinely serves the changes: the footer headings are `h3`, the 404 page has an
`h1`, the new upstream field note is live, and `/`, `/404.html`, `/field-notes/`,
`/llms.txt` and `/sitemap-index.xml` all return 200. An unknown path correctly
returns a real **404**, not a soft 200.

**Correction.** Earlier I recorded, from reading `astro.config.mjs`, that the five
legacy redirects "return 200, not 301". Checking what is actually served, that is
not the whole truth:

```
/services.html      -> HTTP 301  (server: GitHub.com)
/services.html/     -> HTTP 200  meta-refresh page
                    -> /services
```

There *is* a 301, but it only adds the trailing slash. The hop that actually
reaches the destination is a 200 page. So the defect is real but narrower than I
stated, and the fix is smaller than I briefed.

The emitted redirect page already contains everything I had briefed a lane to add:

```html
<meta http-equiv="refresh" content="0;url=/services">
<meta name="robots" content="noindex">
<link rel="canonical" href="https://automancer.uk/services">
<body><a href="/services">Redirecting from /services.html/ to /services</a></body>
```

Astro emits a canonical link, a noindex directive and a real anchor a no-JS agent
can follow. Item 13 of the agent-readiness brief is therefore largely already
satisfied, and the lane must not reimplement it.

I also briefly misread `server: nginx` from the body of the 301 page and thought
something sat in front of Pages. The actual `Server:` header says `GitHub.com`.
The nginx string was page content, not a header — which is the same trap in
miniature: read the artifact, and read the right part of it.

## Rollback path (recorded late — see note)

**Deployed tonight:** `v2026.08.21.1` (`23e45c0`) to production via GitHub Pages.

**Rollback, fastest first:**

1. `git revert --no-commit d412e77 && git commit -m "revert: site fixes" && git push`
   — reverts only the accessibility/SEO fixes, leaving the test suite and the
   upstream integration in place. This is the likely rollback: it is the only
   commit that changed anything a visitor sees.
2. `git revert 6312caa` — removes the test suite and CI. Only if CI itself is the
   problem; it changes nothing user-facing.
3. Full restore to the pre-campaign production state:
   `git reset --hard ox-campaign-truebaseline-2026-08-21 && git push --force-with-lease`
   — last resort, and it needs a human decision because it discards the night's
   work. `ox-campaign-truebaseline-2026-08-21` (`e9721b3`) is the exact tree
   production served before tonight.

Redeploy is automatic on push to `main`; a revert reaches production the same way
the change did, in about 40 seconds.

**Honest note:** I deployed *before* writing this down, and verified production
afterwards. The verification was real and production is green, but recording the
rollback first is the correct order and I did it out of order.

**Monitoring gap — follow-up work, not a shrug.** This site has no uptime check
and no error alerting that I can find. Sentry's browser SDK is loaded, but it
captures client-side JS errors only: it would not notice the site serving a 404,
a broken deploy, or an expired certificate. So nothing would tell us if the site
went down — I found tonight's state by fetching pages by hand. Adding an uptime
check is genuine follow-up work.

## Attribution correction (mtime technique)

Using `find -newermt` to attribute files to lanes caught two things:

1. **My rebase reset every file's mtime**, so the whole tree looked like it had
   been written between 22:20 and 22:43. Attributing that bucket to the pi lane
   would have been wrong — it was my own git operation. mtime needs to be read
   alongside what you know you did to the tree, not on its own.
2. **I under-reported the pi lane's output.** My WIP commit message lists the six
   JSON endpoints, `jsonld.ts` and `site-content.ts`. It also wrote
   `src/data/feeds.ts` (75 lines), which I missed when I inventoried it by eye.
   The commit contains it; the message does not mention it.

Also confirmed from a lane's own build analysis: `public/assets/css/styles.css` is
unreferenced in `dist/` as well as in `src/` — genuinely dead, and safe for the
cleanup slice to remove. The legacy redirect stub pages emit no `h1`, which is
correct for a redirect page and is why the test suite excludes them explicitly.

## A "should not", recorded with reasons

I can deploy this repo freely: push to `main` is the deploy, it is verified
working tonight, and rollback is a one-commit revert. So the question is not
whether I *can* ship the agent-readiness branch, it is whether I *should* ship
all of it unattended.

**Decision: split it. Ship the additive surface; hold the JSON-LD replacement
until it is checked by eye.**

The branch contains two very different kinds of change:

- **Additive and low-risk** — the JSON endpoints, RSS and JSON feeds, Markdown
  twins, `llms-full.txt`, `.well-known/` files. Nothing existing depends on any
  of it. If one is wrong, the blast radius is a URL nobody was fetching
  yesterday, and the tests cover their shape.
- **A replacement, and not low-risk** — the JSON-LD rewrite. Structured data is
  already being consumed by search engines today. Getting it wrong does not throw
  an error or turn CI red; it quietly degrades or removes rich results, takes
  weeks to show up, and takes weeks more to recover. It is the one change on the
  branch that can do lasting harm silently.

So the additive work ships once green. The JSON-LD change gets compared against
what the live pages currently emit before it goes anywhere near production — if
it is not clearly at least as good, it waits for daylight and a human. Shipping
it unattended at midnight buys nothing: no visitor is waiting for it, and the
downside is slow and invisible.

This is a judgement, not a blocker. The capability is there and verified.

## Does a merge to main reach users? YES.

**`automancer-site` auto-deploys from `main`.** Push → GitHub Actions → Pages,
live in roughly 40 seconds. Production tracks `main`; it is never behind it.

So **merging is deploying** in this repo, and every merge tonight has been held
to the full deploy conditions rather than the lower bar a merge usually gets:
green before push, verified from the live site afterwards, rollback recorded in
`docs/DEPLOYMENT.md` beforehand, and watched after landing.

Two structural consequences worth writing down, because they are properties of
the mechanism rather than of anyone's discipline:

- The build happens **on GitHub from a committed SHA**, on a machine that has
  never seen this working tree. A lane's half-written file therefore cannot
  reach production, even mid-write.
- Nothing on this box executes from the working tree — no systemd unit, no cron,
  no watcher references this repo. Checked, not assumed.

### What path does this repo's code take to reach something that runs it?

One path, and only one:

```
commit -> push to main -> GitHub Actions -> actions/checkout of that SHA
       -> astro build (on GitHub) -> upload-pages-artifact -> deploy-pages
       -> automancer.uk, ~40s later
```

Nothing else runs this code. Verified with a negative control, because a
"nothing found" result is worthless if the check could not have found anything:
`systemctl --user list-units` shows 49 services and 20 timers, so user-level
scheduling IS visible here — and none of it references this repo. Nor does any
system unit, cron entry, or anything in the shared `ops/scripts` /
`auto/scripts` trees.

(Caution for anyone repeating this: grepping for `site` matches
`al-lm1-offsite-pull`. Match the repo path, not a fragment of its name.)

**The one shared path this repo depends on** is
`/opt/automancer/auto/scripts/release-notes.mjs`, invoked by absolute path
every time a release is cut here — five times tonight. An edit to that file is
live for the next caller instantly, with no deploy step. No lane has ever been
pointed at it from this repo, and none will be.

Two consequences follow from the mechanism rather than from anyone's care:

- **The working tree is never production.** The build runs on GitHub from a
  committed SHA, on a machine that has never seen this checkout. A lane
  mid-write cannot reach users, so "a lane is editing a file" is not
  "I am deploying" here.
- **But merging IS deploying**, because production tracks `main` within about
  40 seconds. Full deploy conditions apply to every merge.

The one thing that *does* reach the outside world as a side effect is
`release-notes.mjs`, which can push to the client portal — but only for repos
registered under a client `repoRoots`. This repo is not, confirmed from the
gate condition and from the run output, so cutting a release here publishes a
GitHub release and nothing further.

---

# HANDOVER STATE — updated 2026-08-22 04:05Z

## Every claim below carries the time it was checked

Nothing is running. Work is paused under an estate-wide memory hold (swap
exhausted), not because the repo needs anything.

| Claim | Verified at |
|---|---|
| `main` = `origin/main` exactly (`1173129e`), tree clean | 03:55Z |
| No branch of mine is local-only | 03:55Z |
| 104 assertions, typecheck clean, production build green | 03:22Z |
| CI + Deploy green | 03:26Z |
| Production serving the fixed contact form | 03:26Z, with positive + negative controls |
| Tag/release parity clean (only the annotated baseline lacks a release) | 03:20Z |
| No listener of mine; no wildcard port of mine | 03:31Z |
| No orphaned process with cwd under this repo | 04:00Z |
| No build output written by the killed lane | 04:00Z, `find -newermt` with a probe control |
| All background monitors stopped | 04:04Z |

**Eleven releases** shipped and published tonight, `v2026.08.21.1` through
`v2026.08.22.11`, each read back from GitHub after publishing.

## The one thing left undone, and why it matters

**CORRECTED 05:25Z — half of this was already done and I had it wrong.**
Production **does** name the revision it serves. The short SHA is rendered on every
page inside the proof strip, as `<span>build:</span><b>09f5150</b>`, and the live
site currently reports exactly the revision at the top of `main`. Twenty-four built
files carry it.

My earlier claim that `grep -r "$(git rev-parse --short HEAD)" dist/` returns zero
hits was simply wrong — it returns twenty-four. I confirmed the match is real rather
than a coincidental collision with an asset hash by checking three other random
seven-character hex strings, which match nothing, and by reading the surrounding
markup. The full-length SHA is genuinely absent; only the short one is published.

**What is actually missing is the assertion, not the publishing.** Nothing checks
that the revision production serves matches the revision that was deployed. Confirmed
by reading `ops/verify-production.sh`: it contains no revision check, and the only
matches for "sha" are inside an unrelated word.

So the risk below still stands in full — a failed deploy leaving the old build in
place would pass all sixteen checks — but the remaining work is smaller and safer
than this section originally described, and **one of the four traps is void**: the
"absent field on the introducing deploy" problem cannot occur here, because the field
is already live.

So if a deploy failed while the previous build kept serving, **every check in
this repo would pass**: routes 200, the company-number anchor present (the old
build has it too), TLS valid, Sentry DSN present. A stale build is currently
indistinguishable from a fresh one.

A lane was building this when the memory hold stopped it. It wrote nothing —
verified by `find`, not by `git status`, which is blind to build output.

**If you pick this up, the danger is the opposite direction.** This check runs in
the mandatory deploy gate AND the uptime workflow (measured median gap 45.5
minutes, not the 30 the cron requests), so a *wrong* check fails permanently
against a *healthy* site and pages forever, indistinguishable from a real
outage. Four ways to get that wrong:

1. **Short vs full SHA** — `GITHUB_SHA` is 40 chars, `--short` is 7-8. Compare
   unnormalised and every healthy deploy fails.
2. **Absent-field intolerance** — on the deploy that first publishes the field,
   production is still the OLD build and has no field. Must skip, not fail.
3. **Field-name mismatch** between what `/api/index.json` emits and what the
   script reads. Check the emitted JSON, not the code that emits it.
4. **`"null"` as a string** — `readGit` returns null outside a checkout; the
   literal string would compare unequal to every real SHA, forever.

## Other open items, deliberately not done

- **`/terms/` publishes no date or version**, unlike `/privacy/`. Characterised
  in `tests/legal-integrity.test.ts` with both options documented. Not decided —
  choosing a truthful date for a legal document is a judgement, not a 3am edit.
- **The is-agentic score of 63/100 is stale.** All five fixable findings are live
  and individually verified, but their CLI serves a *cached* report and only
  scans when none exists; the API is read-only. A fresh score needs their browser
  form. An unchanged score is not evidence the fixes failed.
- **Two is-agentic checks will keep failing and should** — markdown content
  negotiation with `Vary: Accept` (GitHub Pages cannot do content negotiation or
  set headers) and brand-name search discoverability (an index outcome).
- **The Sentry check proves a DSN is *present*, not that monitoring *reaches
  us*.** A rotated or wrong-project DSN would pass identically. Verifying that
  needs the expected value, which lives in a CI variable rather than the repo.

---

## Earlier handover (02:50Z), kept for the record

# HANDOVER STATE — updated 2026-08-22 ~02:50Z

## Everything is landed. Nothing is in flight.

- `main` is `0 0` with origin. Working tree clean.
- **100 assertions across 9 test files**, `astro check` 0 errors, production build green.
- CI and Deploy green. Production verified from the live site with positive AND
  negative controls after every deploy.
- **Eight releases shipped tonight**, `v2026.08.21.1` through `v2026.08.22.8`,
  every one published and read back from GitHub.
- Tag/release parity clean: the only tag without a release is
  `v2026.08.08.1`, whose annotation says it is the pre-release baseline.
- All three lane checkouts removed after verifying their work was merged and no
  process still held them. Only the main checkout remains.

## What shipped, in one list

| Area | Result |
|---|---|
| Tests | 0 → 100 assertions over the real build output, plus CI |
| Defects fixed | 9 accessibility/SEO faults found by those tests, fixed at source |
| Agent-readiness | 19 md twins, 6 JSON endpoints, OpenAPI 3.1, `/developers`, feeds, `llms-full.txt`, `agent.json`, `security.txt`, when-to-use guidance |
| Dependencies | astro 7.1.6 → 7.2.4, five-commit upstream backlog integrated |
| Performance | 22 duplicate font binaries removed (checksum-verified identical), enforced per-route weight budgets |
| Design | hero restructured, prices in identical plates, two real contrast failures fixed (2.40 → 5.02) |
| Monitoring | mandatory post-deploy production check + scheduled uptime, sharing one script; alarm if Sentry goes dark |
| Legal integrity | `/privacy` and `/terms` wording pinned so it cannot drift from its published date |

## Open, deliberately — for a human, not for me at 3am

1. **`/terms/` publishes no date or version at all**, unlike `/privacy/`. A
   visitor cannot tell which version binds them. Characterised in
   `tests/legal-integrity.test.ts` with both options documented; not decided,
   because choosing a truthful date for a legal document is a judgement.
2. **is-agentic score is stale at 63/100.** All five fixable findings are live
   and individually verified, but their CLI serves a cached report and only
   scans when none exists — the API is read-only. A fresh score needs their
   browser form. An unchanged score is not evidence the fixes failed.
3. **Two is-agentic checks will keep failing and should**: markdown content
   negotiation with `Vary: Accept` (GitHub Pages cannot do content negotiation
   or custom headers) and brand-name search discoverability (an index outcome).

## CADENCE — run these, do not remember them

Every one of these caught something after I had already reported it clean:

1. `git fetch && git rev-list --left-right --count origin/main...main` → `0 0`.
2. Tag/release parity. **`release` does not publish.** Check a CHANGELOG entry
   exists BEFORE pushing a tag — a tag without one becomes a permanent orphan.
3. `gh run list --limit 5`. "I verified locally" and "CI is green" are different
   claims, and local runs here use Node 24 while CI pins 22.
4. Verify production with a positive AND a negative control.
5. `oxboard notices` / `oxboard log`; `oxboard claim` before reporting.
6. **Before believing any "nothing found", prove the check could have found
   something.** Three distinct species bit me tonight: a blind pattern
   (`bfs` rejecting `-newermt`, `ugrep` rejecting `.{0,45}`, a regex anchored
   with `$`), a truncated read, and a second-stage filter that discarded the
   answer. Each needs a different control.
7. Review the diff, not the report: logic, then numbers, then error paths, then
   scope. All four caught something the others missed.


---

## Earlier handover (01:40Z), kept for the record


## Landed tonight, with SHAs

All on `main`, released, pushed, and verified against the **live site**. Local is
`0 0` with origin at every checkpoint.

| SHA | What |
|---|---|
| `6312caa` | vitest suite over the production build, from zero, plus `ci.yml` |
| `d412e77` | nine real a11y/SEO defects the suite exposed, fixed at source |
| `23e45c0` | release `v2026.08.21.1` |
| `2c13c4b` | release `v2026.08.21.2` — Vitest 4 removed `poolOptions`/`minWorkers`; that turned CI red and this fixed it |
| `4f2e4a8` | **merge:** agent-readiness surface (19 md twins, 6 JSON endpoints, feeds, llms-full, JSON-LD `@graph`, 404 rebuild) |
| `776eea0` | **merge:** post-deploy production verification, scheduled uptime, 14 dead assets pruned |
| `3972692` | TLS threshold measured (14 → 21) instead of guessed |
| `60fa1b5` | `/agent.json` + `/security.txt` served from paths that resolve — was a live 404 |
| `b1f1b3b` | release `v2026.08.22.4` |

Releases `v2026.08.21.1`, `.2`, `v2026.08.22.1`–`.4` all **published and read back
from GitHub**. Only `v2026.08.08.1` has a tag without a release, and that is
correct — its annotation says it is the pre-release baseline.

## In flight right now — THREE LANES

Each in its **own git common dir** (one lane per common dir — two clones and a
worktree) with **disjoint file scopes**. All three were given the placeholder
`PUBLIC_AUT_SENTRY_WEB_DSN=""` verbatim and told to verify with `pnpm run
verify`, not `pnpm run test`.

| Lane | Where | Told to do | Scope it must stay inside |
|---|---|---|---|
| `design2` | `../automancer-site-design` (clone, branch `design`) | Visual/craft pass on the existing "Grimoire Terminal" design, following `~/.agents/skills/impeccable`. Browser work on **omarchy**, reap verified by diffing session dirs — `agent-browser close` lies. No copy changes, no new deps, no new fonts. | `src/styles/`, `src/components/`, `src/layouts/`, page markup |
| `score` | `../automancer-site-verify` (clone, `main`) | The eight real is-agentic failures: OpenAPI 3.1 at `/openapi.json` generated from the same source as the endpoints, a `/developers` page, when-to-use section in llms.txt, `url`/`jobTitle` on the Person node. **Explicitly told NOT to fake** the `Accept: text/markdown` + `Vary` check — Pages cannot do content negotiation. | `src/pages/`, `src/data/`, `docs/`, `tests/` |
| `perf` | `../automancer-site-agentready` (worktree, branch `perf`) | Measure real payload per page into `docs/PERFORMANCE.md`, then enforce budgets **derived from measurements plus headroom**, with the measured value and date in a comment. Prove the budget test can fail. | `tests/`, `astro.config.mjs`, `public/assets/`, `docs/` |

**Uncommitted:** main checkout is clean. The three lanes' trees are theirs; do not
commit them until each lane exits and its diff is reviewed.

## Next three things, in order

1. **Merge the three lanes as they finish** — one at a time, `pnpm run verify`
   green before each merge, then release, push, and **verify from production**,
   because merging here IS deploying (production tracks `main` in ~40s).
2. **Re-scan with `npx is-agentic automancer.uk`** after the `score` lane deploys,
   and report the delta from the measured 63/100 — not a claimed improvement.
3. **Assert that post bodies are non-empty.** `e.body ?? ''` in `feeds.ts`,
   `llms-full.txt.ts` and the `.md` twins means an empty body emits an empty
   feed item, an empty section and an empty twin — and passes all 69 assertions,
   because the feed tests check item *count*, not content. Found by comparing
   what sibling serialisers refuse.
4. **Add a cleanup trap to `ops/verify-production.sh`.** It `rm -f`s its temp
   files on the normal and failure paths but NOT on SIGTERM, which is how
   `timeout` and CI's `timeout-minutes` kill it. Details in the post-lane
   checklist in my scratchpad; needs `trap ... EXIT INT TERM`.

## Decisions I would not re-derive from the code

- **`/.well-known/` cannot work on this host.** GitHub Pages serves no
  dot-prefixed path — `/.nojekyll` itself 404s while every non-dot path from the
  same build returns 200. `.nojekyll` did **not** fix it. That is why the
  canonical copies live at `/agent.json` and `/security.txt`, with the
  `.well-known` routes still emitted for hosts that do serve them.
- **Legal pages are deliberately not mirrored.** `/privacy` and `/terms` appear
  in machine-readable surfaces as metadata plus a pointer only. A transcribed
  compliance page drifts silently, and the privacy notice changed upstream within
  the week.
- **`TLS_MIN_DAYS = 21`, measured.** Cert is Let's Encrypt, 89-day life, renews at
  ~29 days out. A threshold at or above 29 fires every renewal cycle; 14 leaves a
  failed renewal silent for a fortnight. 21 sits below the renewal window and
  surfaces a failure within a week.
- **CI is the authoritative runtime.** There is no production Node process — the
  site is static files, so the only Node that runs is the build's, which is CI's
  Node 22. This box runs 24, so a green local run is evidence from a runtime CI
  never executes.

## Deliberately NOT doing

- **Not faking the markdown content-negotiation check.** It is an is-agentic
  ESSENTIAL failure and it will keep failing while we are on GitHub Pages, which
  cannot do content negotiation or set `Vary`. Honest failure beats a fake pass.
- **Not chasing brand-name search discoverability.** It is a search-index
  outcome, not a code change.
- **Not adding external uptime monitoring.** The scheduled workflow covers it at
  zero cost; a third-party vantage point would mean a paid account, and spend is
  gated.
- **Not deleting the two stray `/tmp/tmp.*` files.** I cannot prove they are
  mine, and one is a 0-byte file that could be another agent's live lock.

## CADENCE — the routines that must not quietly stop

Run these **every cycle**, not from memory — several came back dirty after I had
already reported them clean:

1. `git fetch -q origin && git rev-list --left-right --count origin/main...main`
   → expect `0 0`. Caught a stranded commit once already.
2. Tag/release parity: `git ls-remote --tags origin` vs `gh release list`. Caught
   **two unpublished releases** after I had checked clean twice. `release`
   followed by a tag push does **not** publish; `publish` must be re-run.
3. Lane health **by cwd or `--dir`, never by matching command lines** — a lane
   brief contains the words you are grepping for. Zombie `git` child mapped by
   PPID confirms a victim; its absence proves nothing.
4. After every deploy, verify from **production**, with a positive control (a
   path that must be 200) and a negative control (a path that must be 404).
   Otherwise a failed fetch reads identically to a pass.
5. `oxboard notices` and `oxboard log` at the start of each cycle; `oxboard
   claim` before reporting anything to the lead.
6. **Before believing any check that returns "nothing found", point it at
   something known-bad.** Four of my own checks were silently broken tonight —
   `bfs` rejecting `-newermt`, `ugrep` rejecting `.{0,45}`, a scope regex
   anchored with `$`, and a `find` whose error I had suppressed with
   `2>/dev/null`. Every one returned a clean-looking result.
7. Review a lane's **diff**, not its report — logic, then numbers, then error
   paths, then scope. Each pass caught something the others missed.

---

## Paths I deliberately kept away from lanes — which are closed, which are holes

Added 2026-08-22 ~04:30Z, near the end of the run.

**Why this section exists.** Every time I told a lane "do not run this", I marked a
path that the green test suite does not cover. Some of those I then ran myself, so
they are fine. The rest are genuinely unchecked, and a passing test suite should not
be read as covering them. This separates the two.

I found the first gap by searching this document for the names of the things I did
not run, rather than by trying to remember. Three of them appeared nowhere in it.

### Closed — I forbade the lane and then did it myself

| Path | Who closed it, and when |
| --- | --- |
| Deploying, tagging and publishing releases | Me, eleven times through the night, each with a direct check against the live site afterwards. |
| The production checking script | Me. Lanes were barred from editing it so it could not drift under them. |
| Browser and image-rendering work | Me, on 2026-08-22 around 02:00Z. I installed the browser library and generated a real 1200x630 preview image end to end, then confirmed the browser process had exited. |

The image-rendering one is worth noting: **it was closed hours ago and this document
never said so.** Anyone reading the handover would have had no way to know.

### Open — nobody ran these, and they are the actual holes

**1. The uptime monitor has never once reported a problem.**
It has run three times and said "site is up" three times. That is not evidence it
works. A monitor that has only ever returned one of its two answers has been half
observed. I closed the equivalent gap in the underlying script tonight (below), but
not in the scheduled job that runs it.

**2. The uptime monitor has no step that tells anyone.**
The job runs the checking script and stops. If the site goes down, the workflow turns
red and that is all that happens. Whether an email actually reaches Waseem depends on
GitHub's default notification behaviour, which I have not verified and cannot verify
without breaking production on purpose. **Treat site monitoring as unconfirmed until
someone checks that a failure reaches a human.**

**3. The rollback path has never been exercised.** It is written down in this document
and has never been run.

**4. The site still cannot tell you which version it is serving.** Unchanged from the
earlier entry. A failed deploy that leaves the previous build in place would pass every
check I have.

**5. The terms page has no "last updated" date.** Deliberately left. Choosing a truthful
date for a legal document is a human decision, not mine.

### Closed tonight: the production checking script now proves it can fail

Until tonight that script had only ever been seen passing against a healthy site, plus
once failing for the wrong reason (a fault on the machine running it, not the site).
So its ability to correctly report a real outage was never observed.

I pointed it at an address where nothing is listening. Every check fails, in order,
with an accurate reason — "connection refused" — and it does not confuse this with the
machine-broken case it also guards against. Rejecting an insecure address is also
confirmed working, with its own distinct exit code.

This costs nothing and touches no production. It is worth repeating whenever that
script changes.

### Two things found while doing the above

**Automated dependency updates have been failing for ten days, and it is noise rather
than a risk.** Three failed runs, on 12 and 17 August, all on the same package. I
checked before reporting it as a security problem, and it is not one: the version
actually installed is well past the point where the known issue was fixed, and a full
audit reports zero vulnerabilities of any severity. The update job cannot do anything
useful because the package is pulled in indirectly by three other tools. **Low
priority, but it should either be silenced or fixed, because a job that always fails
trains everyone to ignore it.**

**One of my own checks tonight gave a clean answer that was wrong.** I asked GitHub for
the last 40 workflow runs and got back "no failures ever". The full history is 145 runs
and contains eight. My sample was simply too small to reach them, and nothing in the
result said so. This is the same false-all-clear shape recorded elsewhere in this
document, and I walked into it while specifically hunting for it.

### Re-checked against the sharper question: did I run it against the same thing a lane would have?

Running a path myself only closes it if I ran it against **the object the lane would
have touched**, not merely against something similar.

- **Deploys, tags and releases** — same object exactly. I deployed to the live site
  eleven times. Closed.
- **Browser and image rendering** — same object exactly. I rendered the real template
  at the real output size and got a real image out. Confirmed again at 04:35Z by
  counting browser processes rather than trusting the "closed" message the tool
  prints: zero running, no leftover profile directories. Closed.
- **The production checking script** — same target, **different machine**, and that
  distinction matters here. I ran it from this server. In normal operation it runs on
  GitHub's machines. The one serious bug it has had all night was caused by the
  machine it was running on, not by the site, so "it works here" is not by itself
  evidence it works there. What closes it is separate: that same script has now run to
  success on GitHub's machines twenty-one times tonight, across eighteen deploys and
  three scheduled checks. Closed, but by the second piece of evidence rather than the
  first.

### Open item: give the checking script a self-test, and give it BOTH halves

This was on my working list all night and never made it into this document, which is
its own small lesson: the grep that found three unrun things missing from here would
not have found this one, because it was never written down anywhere.

**The design I was going to build was wrong, and the fault is worth recording.** I had
specified: point every check at an address where nothing is listening, and fail if any
check passes. That proves each check *can* report a problem.

It cannot detect a check that can **never** report success. A check demanding something
impossible — a condition that is false even when everything is healthy — goes red
against a dead address exactly like a correct check does, so this self-test passes it
without comment. Another repo on this campaign shipped precisely that defect tonight,
and its self-test ran clean over the top of it.

**So a self-test needs both directions:**

- *Can each check fail?* Point them at an address where nothing is listening. Every one
  must go red, with its own specific message. **Done tonight, manually, by hand** — all
  checks failing in order with accurate reasons.
- *Can each check succeed?* Point them at a target known to be healthy. Every one must
  go green. For this repo that is already satisfied by ordinary operation: the same
  script has run to success against the live site twenty-one times tonight on GitHub's
  machines.

The second half is the awkward one in general, because the only reliably healthy target
tends to be production itself — the very thing an exclusion is usually protecting. That
is worth stating plainly: **excluding production from testing does not just leave that
path unverified, it can make a whole class of defect impossible to find.**

Neither half is wired into the script as a flag yet. Both have been performed manually
and the results are recorded here.

---

## Late work, 04:10Z to 04:45Z

### The contact form defect now has a test, proven against the real broken file

The one defect this site actually showed to visitors tonight — raw machine codes on the
contact form, where a person who failed the security check read the words
"turnstile_failed" — had **no test**. All 104 assertions passed whether the fix was
present or not, so anyone could have reintroduced it and the repo would have stayed
green. I only noticed by asking a different question than "do the tests pass": *do the
tests catch the defects we actually found tonight by other means?* Three of four were
covered. This one was not.

There are now **112 assertions across 10 files**. The new ones fail if a machine code
can reach a visitor through any error branch.

**The important part is how it was proved.** The lane was forbidden from inventing a
broken version, and told to use the genuine defective file from this repo's own history
— the exact bytes that were served to real people. Seven of eight new assertions fail
against it, and each failure names the code a visitor would have seen. Restored, the
full suite is green.

The reason for that rule: a test and a fake defect written by the same author share the
same blind spots. The author naturally breaks something the test already looks at. Our
earlier round of "we proved our tests can fail" was exactly that shape, and it is why
this defect slipped through a suite that had supposedly proved itself.

The lane also found its own test harness was lying: its fake page element stored a raw
object where a real browser element converts it to text, which turned one case into an
unhelpful crash instead of a message naming the leak. It fixed the harness rather than
the assertion.

### Two smaller things found while checking

**Six assertions pass against a completely empty build.** I deliberately broke the
helper that reads the built site and ran the suite: seven of ten files failed
immediately, which is correct. The two that survived read the build through a *second,
separate route* that has no equivalent safety check. Emptying the build entirely, those
two files still fail overall — so nothing is actually unprotected today — but six of
their nine individual assertions pass with nothing there at all, because a rule like
"every page is within its size budget" is trivially satisfied when there are no pages.
**The protection exists but sits in only one of two doorways.** The fix is one guard in
`tests/support/perf.ts`, mirroring the one already in `tests/support/dist.ts`. Not done.

**The type checker's summary does not use the same words as its output.** It prints two
diagnostics labelled "warning" and then reports "0 warnings, 2 hints". Both readings are
defensible and neither is a bug, but **anyone who gates a build on "zero warnings" will
pass while warnings are printed on screen.** Behind them are two genuinely unused
imports left over from an earlier fix, in `src/data/jsonld.ts` and
`src/pages/api/services.json.ts`. Harmless, worth a two-line cleanup.

### The checking script has now been observed failing, in order, for the right reasons

Recorded above as an open item and now **partly** closed by hand.

Pointed at an address where nothing listens, each check fails in turn, names itself and
gives the real reason, and does not confuse this with the separate "the machine running
me is broken" case, which has its own message and its own exit code.

**Corrected before it was believed.** My first attempt looked complete and was not. It
failed thirteen checks and I nearly recorded that as "every check". A healthy run
performs **sixteen**. My own time limit had cut the run off partway through the
fourteenth, so the last three — the homepage wording check, the error-monitoring check
and the certificate check — were never exercised in the failing direction at all. The
run never printed its closing summary line, which is the tell I should have looked for
first. I noticed only by counting the failing checks against a healthy run's passing
ones.

Worth keeping as its own small rule: **a run that was cut short looks exactly like a run
that finished, if you only read the failures it did produce.** Check that the thing
printed its own ending. The rerun with a proper time budget is recorded below.

### The rerun finished, and this one is complete

Both directions of the production checking script are now observed in full.

**Can each check report a problem?** Pointed at an address where nothing listens, with a
time limit generous enough to finish: **all sixteen checks fail, none pass, and the run
printed its own closing summary** — `RESULT: 16 check(s) FAILED`. Each failure names
itself and carries the real reason, and the certificate check reports a certificate
problem rather than a connection one, so they are not all collapsing into a single
generic error.

**Can each check report success?** All sixteen pass against the live site. Verified by
hand twice tonight, immediately after each deploy, and by twenty-one runs on GitHub's
machines today.

The sixteen checks in the failing list are the same sixteen that pass against
production. That correspondence is the point: it is what distinguishes "every check was
exercised" from "the run stopped early and I read the failures it had managed".

This repo is in the easy case for that, and it is worth saying why, because it will not
generalise. **A known-good target here is free**: production is a public website, so
checking it is an ordinary read that costs nothing and risks nothing. Where the healthy
target is expensive or dangerous to touch, only the failing half is cheap, and a
fail-only self-test cannot see a check that is impossible to satisfy. That is a real
blind spot elsewhere; it is not one here.

---

## What I did not do, in one place

Everything below was considered and left. Each says why, so none of it has to be
re-derived. This list sits beside the work rather than after it, because a green repo
with an unstated gap reads as more finished than it is.

### Left because it needs a person, not more time

**The terms page has no "last updated" date**, unlike the privacy page. Choosing a
truthful date for a legal document is a judgement about the document, not a code
change. Characterised in the tests with both options written out.

**Whether a failed uptime check actually reaches you.** The monitor runs the checking
script and stops. If the site goes down the workflow turns red, and whether that
becomes an email depends on GitHub notification settings I cannot verify without
breaking production deliberately. **Treat site monitoring as unconfirmed.** This is the
one on this list I would look at first.

### Left because it was the wrong hour for it

**Asserting that production serves the revision we just deployed.** The site publishes
its revision — that half is done and I had it wrongly recorded as missing for hours.
The check that compares it is written up in full above, including the trap that matters:
the script is shared between the deploy gate, which knows the expected revision, and the
hourly monitor, which does not, so the monitor's case must pass or it alerts forever
against a healthy site. A lane was started for this and **deliberately killed**: it edits
the mandatory deploy gate, and the failure mode is a monitor that pages continuously over
a weekend. The upside was closing one item a few hours early. That is a bad trade and the
brief is worth more than a rushed change.

**The rollback path has never been run.** Written down, never exercised.

### Left because they are small and better done awake

**Six assertions pass against a completely empty build.** The guard that catches an
empty build sits in one of two routes into the built output; the other route has no
equivalent. Nothing is unprotected today — the suite still fails overall — but the
protection is thinner than it looks. One guard in `tests/support/perf.ts` mirrors the
existing one.

**Two unused imports** left over from an earlier fix, in `src/data/jsonld.ts` and
`src/pages/api/services.json.ts`. The type checker labels them "warning" in its output
and counts them as "hints" in its summary, so a build gated on "zero warnings" passes
while warnings print on screen.

**The agent-readiness score of 63 is stale.** All five fixable findings are live and
individually verified, but their tool serves a cached report and only rescans when none
exists. An unchanged score is not evidence the fixes failed.

### Stated precisely so it is not mistaken for a clean bill

**This repo ships nothing that could detect a committed secret** — no scanner
configuration, no CI step, no such hook. It also states no rule requiring one, so it is
not contradicting itself. But "no scanner" is not "no secrets", and I have not scanned.

**The error-monitoring check proves a monitoring key is present, not that alerts reach
anyone.** A rotated or wrong-project key would pass identically.

### One thing on this repo that is not mine, found while checking my own work

There is a second working copy of this repository attached to it, on a branch called
`agent/AUT-6645`, under `/opt/automancer/worktrees/`. It is idle — nothing is running
in it — its last commit is from 21 August, and it has one uncommitted file.

**I have not touched it.** It is not my work and it may be a parked branch someone
intends to come back to.

The reason it is worth writing down: **it shares this repository's configuration.**
That is not a guess — its configuration path resolves to this repo's own
`.git/config`, and it is a genuine second working copy by all three independent
signals, not merely by living in a directory with a suggestive name. So a change made
to git settings inside it takes effect *here*. Tonight a fleet-wide instruction went
out that, if run in a working copy of that kind, disables pushing from the main
checkout. It would have applied to this repo through that directory, and the symptom
would not appear until the next attempt to publish the site.

Nothing is broken now — publishing from here is confirmed working. It is worth either
finishing that branch or removing the working copy, so this repo has only one door
into its settings.

---

## What "green" means here, and which commit it belongs to

Re-measured at the end rather than quoted from earlier in the night.

**The test numbers, read from the runner rather than searched for.** 112 tests, 112
passed, **0 failed, 0 skipped, 0 todo**, across 42 groups in 10 files. The skipped and
todo figures matter: a suite that quietly skipped everything also reports success and
also exits zero, so "green" and "112 green" are different claims. These came from the
runner's machine-readable output, not from matching text on screen.

**Which commit that covers.** The run above was made with the working tree clean at the
commit immediately before this section was added, so it covers every line of code being
handed over. This section changes only this document.

**Continuous integration.** Every push tonight has its own passing run. Five commits
have no run of their own, and that is expected rather than a gap: the service runs once
per *push*, not once per commit, so a commit that never headed a push gets no run. All
five are ancestors of the current tip, whose run is green, so their content is covered.
I checked that with a test proven to give both answers — it correctly reports a
commit that is not on this line as not covered.

**One thing this does not tell you.** A passing run says the checks passed on the code
at that commit. It does not say the site is up; that is the separate production check,
which was run by hand after every deploy tonight and passed all sixteen of its checks
every time.

---

## Check it yourself rather than trusting the numbers above

Everything above was true when written, on the morning of 22 August 2026. Some of it is
a *live* fact — tests passing, nothing running, the site healthy — and a live fact
starts going out of date the moment it is saved. The commands below produce the same
answers fresh, so they are still worth something long after the numbers are not.

**Does the repository match what is published?**
```
git fetch -q origin && git status -sb | head -1
```
Wanted: no "ahead" or "behind", and no files listed after it.

**Do the tests still pass, and did they all actually run?**
```
pnpm run verify
```
Wanted: the runner's own summary, read rather than searched for. At the time of
writing: 10 files, 112 tests, 112 passed, none failed, none skipped, none pending.
A suite that skipped every test also exits zero, so read the skipped figure, not just
the exit code.

**Is the automated check still green for the code in front of you?**
```
git diff --name-only <last-green-sha>..HEAD | grep -v '^docs/'
```
Empty output means the green still covers every line of code, however many
documentation commits have landed since. This is better than recording how far behind
the green is, because that distance changes every time anyone writes anything down.

**Is the live site healthy?**
```
ops/verify-production.sh https://automancer.uk
```
Wanted: sixteen checks pass and it exits zero. This is the only one of these that says
anything about the site being *up*; the others are about the code.

**Is the site serving the revision you think it is?**
```
curl -s https://automancer.uk/ | grep -o 'build:</span><b>[0-9a-f]*'
git rev-parse --short HEAD
```
Wanted: the same value twice. Nothing enforces this automatically yet — that is the
open item recorded above.

**Is anything still running that should not be?**
```
ps -eo comm= | grep -c chrome
ls -d /opt/automancer/lanes 2>/dev/null
```
Wanted: zero, and no such directory. If either says otherwise, something outlived the
work that started it.
