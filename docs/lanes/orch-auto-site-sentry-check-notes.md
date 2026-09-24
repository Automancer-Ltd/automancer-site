# q-auto-09e4 — production Sentry check must name the right project

Lane: `q-auto-09e4` (p3, review). Branch: `fix/q-auto-09e4-sentry-project`.
Repo: `/opt/automancer/projects/automancer/automancer-site`. Cut from `origin/main`.
Date: 2026-08-31.

## Property

The production check must **fail** when the deployed bundle carries a Sentry DSN
for the wrong project, or no DSN at all — and pass only for the expected one.
A grep for any ingest host cannot fail in the way that matters.

## Where the expected project id comes from

Committed constants in `ops/verify-production.sh`:

- `EXPECTED_SENTRY_PROJECT_ID=4511769898647632`
- `EXPECTED_SENTRY_PROJECT_SLUG=automancer-site`

**Source:** a read-only Executor call,
`sentry.org.automancer.organizations.listOrganizationProjects`, org slug
`automancer`, EU region, on 2026-08-31. The catalogue entry named
`automancer-site` (platform `javascript-astro`) has that numeric id. The live
bundle's ingest path was then compared as a **confirmation**, not as the source:
it already carried `4511769898647632`. Using the live bundle as the source would
have certified whatever is currently deployed, including a wrong project that
had already shipped.

**Not used:** `vars.PUBLIC_AUT_SENTRY_WEB_DSN`. That variable is the DSN the
build inlines. An expected id taken from the same place would always agree with
itself.

**What this cannot catch:** a PR that updates **both** the committed constant
and the CI DSN to a new project together. That is a change of intent in two
places at once; the check would agree with itself. It also cannot catch an
alert rule that exists but does not actually page anyone (see "Alert routing"
below). A rotated **key** on the same project id still passes — that is the
wanted behaviour.

## The four cases

Fixtures are ingest **host + project path only**, never a key. No
credential-shaped test value was planted; no gitleaks suppression was added.
Files for cases 1–3 lived under `/tmp/q-auto-09e4-sentry-proof/` (not
committed, deleted after the run). Case 4 is a real Astro production build
with the CI variable renamed.

The old grep `ingest\.(de\.)?sentry\.io|o[0-9]+\.ingest` returns 1 (exit 0)
on the wrong-project fixture and on a live-bundle copy whose project id was
rewritten — that is the defect.

### 1. Right project → pass

```
ops/verify-production.sh --assert-sentry-bundle /tmp/q-auto-09e4-sentry-proof/right-project.js
```

```
PASS  bundle /tmp/q-auto-09e4-sentry-proof/right-project.js carries a Sentry DSN for expected project 4511769898647632 (automancer-site) — error monitoring is live on the right project
```

exit 0. The same command against a local copy of the live
`/_astro/BaseLayout.astro_astro_type_script_index_0_lang.CoCD74lr.js` (84562
bytes, project id `4511769898647632` extracted, DSN not printed) also passed
with the same verdict.

### 2. Wrong project id → FAIL, naming expected vs found

Fixture project id `4511769883574352` is a different project in the same
Sentry org (so "any ingest URL" would pass it).

```
ops/verify-production.sh --assert-sentry-bundle /tmp/q-auto-09e4-sentry-proof/wrong-project.js
```

```
FAIL  bundle /tmp/q-auto-09e4-sentry-proof/wrong-project.js carries a Sentry DSN for project 4511769883574352, expected 4511769898647632 (automancer-site) — errors would go to the WRONG project. A DSN is present, so this is not the missing-variable failure; PUBLIC_AUT_SENTRY_WEB_DSN is a DSN for a different project than automancer-site.
```

exit 1. A local copy of the live bundle with only that id rewritten failed
identically.

### 3. No DSN at all → FAIL, distinguishable from case 2

```
ops/verify-production.sh --assert-sentry-bundle /tmp/q-auto-09e4-sentry-proof/no-dsn.js
```

```
FAIL  bundle /tmp/q-auto-09e4-sentry-proof/no-dsn.js contains NO Sentry ingest DSN — error monitoring is OFF in production. This is a missing-DSN failure, not a wrong-project mismatch: no ingest URL is present at all. src/scripts/sentry.ts only initialises when PROD && dsn, so a renamed or unset GitHub Actions variable named PUBLIC_AUT_SENTRY_WEB_DSN yields a green build and a silent dark monitor. Check that repository variable's name; the application code is not what went missing.
```

exit 1. The line names "missing-DSN failure, not a wrong-project mismatch".
Case 2 names expected vs found and says a DSN **is** present.

### 4. CI variable renamed → FAIL, pointing at the variable

Build, not a deploy. `PUBLIC_AUT_SENTRY_WEB_DSN` unset;
`PUBLIC_AUT_SENTRY_WEB_DSN_RENAMED=1` set instead (not a DSN). Same-filesystem
`--outDir` because a `/tmp` outDir hit Astro `EXDEV` on rename:

```
campaign heavy --label q-auto-09e4-rename-build -- env -u PUBLIC_AUT_SENTRY_WEB_DSN PUBLIC_AUT_SENTRY_WEB_DSN_RENAMED=1 pnpm exec astro build --outDir .q-auto-09e4-snb011
```

Result: Sentry tree-shaken; homepage references only `/assets/js/main.js`;
no `/_astro/*.js`; no ingest URL in any JS. Then:

```
ops/verify-production.sh --assert-sentry-bundle .q-auto-09e4-snb011/assets/js/main.js
```

```
FAIL  bundle /opt/automancer/projects/automancer/automancer-site/.q-auto-09e4-snb011/assets/js/main.js contains NO Sentry ingest DSN — error monitoring is OFF in production. This is a missing-DSN failure, not a wrong-project mismatch: no ingest URL is present at all. src/scripts/sentry.ts only initialises when PROD && dsn, so a renamed or unset GitHub Actions variable named PUBLIC_AUT_SENTRY_WEB_DSN yields a green build and a silent dark monitor. Check that repository variable's name; the application code is not what went missing.
```

exit 1. The diagnosis names `PUBLIC_AUT_SENTRY_WEB_DSN` and says to check
that variable's **name**, not the application code.

The check therefore also scans `/assets/*.js`, not only `/_astro/*.js`. A
check that required an Astro chunk would have blamed the page for not
rendering — the wrong diagnosis for this failure.

The outDir was deleted after the proof; it is not in the commit.

## Self-test

`ops/verify-production.sh --self-test` (127.0.0.1 fixture, never production):

**52 passed / 0 failed / 0 skipped of 52 collected** (26 assertions × fail
direction and pass direction). EXIT 0.

Added pair: wrong-project fail + right-project pass. Added pair: rename-shaped
homepage (`/assets/js/main.js` only) fail + right-project pass. Result line:

`SELF-TEST RESULT: all 26 locally isolatable assertions across 10 checks can fail AND can pass.`

`bash -n` and `shellcheck` on `ops/verify-production.sh`: both exit 0.

## Alert routing (read-only; this half stays open)

> **Closed 2026-09-24 (AUT-7596, AUT-7568).** The table below is a 2026-08-31
> snapshot. On 2026-09-01 workflow 709585, and every other alert workflow in
> the org, was disabled on purpose. Site errors now reach a person through the
> estate Sentry poller, and a tagged test event proved it end to end. The empty
> detector wiring is intended. See `docs/DEPLOYMENT.md`, "Where a Sentry error
> goes".

Executor, `sentry.org.automancer.*`, region `de`, no writes.

On project `automancer-site` (`4511769898647632`):

| What | Id | Notes |
|---|---|---|
| Detector "Error Monitor" (type `error`) | 1529890 | enabled; **`workflowIds` empty** — not wired to a notification |
| Detector "Issue Stream" (type `issue_stream`) | 1529891 | enabled; wired to workflow 709585 |
| Workflow "Send a notification for high priority issues" | 709585 | enabled; triggers `new_high_priority_issue` OR `existing_high_priority_issue`; action `email` to `issue_owners` with fallthrough `ActiveMembers`; `lastTriggered` 2026-08-22T23:28:12Z |

That last trigger coincides with issue `AUTOMANCER-SITE-4` (TurnstileError
600010) on the Error Monitor's `latestGroup`. I did **not** send a test
event, so I cannot claim a deliberately thrown browser error was received by
anyone. Whether ActiveMembers still includes the person who should be paged,
and whether that email is actually delivered, is the open half for a human.

An older project rule named "Automancer — notify Waseem on new issue" was
deleted in the 2026-08-08 alert-storm cleanup (estate artefact, not this
repo). The current workflow is Sentry's default high-priority email, not
that named rule.

## What this lane did not do, and why

- **Did not deploy**, and did not modify the live bundle. This is a check.
- **Did not send a Sentry event, create an alert rule, or write through
  Sentry.** Read-only catalogue / detector / workflow calls only.
- **Did not hardcode a DSN or print one.** Fixtures are host + project path.
  A local copy of the live bundle was used in `/tmp` for extra proof against
  real minified bytes, then deleted.
- **Did not plant a credential-shaped test value**, so there is no seed,
  marker, or gitleaks suppression to name.
- **Did not start a browser.** The self-test fixture server bound
  127.0.0.1 only and was reported stopped (pid gone). Chromium processes
  visible on the box belong to another lane's Playwright run (`orch-gdp`
  e2e); they were not started here and were not killed.
- **Did not edit `VISION.md`.**
- **Did not `git reset --hard`, `checkout --`, `clean -f`, or force-push.**

## Files

- `ops/verify-production.sh` — extract project id, compare to the committed
  constant, distinguishable missing vs mismatch messages, `--assert-sentry-bundle`,
  self-test fixtures for wrong-project and rename-shaped builds.
- `docs/DEPLOYMENT.md` — documented behaviour of the check.
- this file.
