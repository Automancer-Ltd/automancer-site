# Deploying automancer.uk

Every fact here was verified against the live site on 2026-08-21, not taken from
configuration. Where the config and reality disagree, reality is recorded.

## The short version

**Push to `main`. That is the deploy.** There is no operator procedure, no
database, and no migration step. `.github/workflows/deploy.yml` builds the site
and publishes it to GitHub Pages; a push reaches production in roughly 40 seconds.

## There is no gate on the push (corrected 2026-09-15, AUT-9174)

This section used to describe a `pre-push` hook that blocked a push to `main`
carrying user-facing commits with no release notes. That estate-wide guard was
retired by board decision on 2026-09-01 ("gate the deploy, not the push") and
was never actually replaced here — `.githooks/pre-push` in this repo only runs
a gitleaks secret scan and always has. `release-notes.mjs hook-status --repo
"$PWD"` confirms this today: `release guard ABSENT`. A push with unreleased
user-facing commits goes straight to GitHub Pages, same as any other push.

Because `deploy.yml` runs entirely on GitHub-hosted runners with no VPS step
to call `release-notes.mjs auto` from (and the writer model is an on-box
subscription CLI a hosted runner cannot reach), the deploy-time write the
rest of the estate relies on cannot run for this repo either. Instead, the VPS
polls.

### The hourly catch-up (corrected 2026-10-01, AUT-11770)

The website-specific timer was retired in September 2026. The estate-wide
`automancer-release-notes-catchup.timer` now runs every hour (with up to 5
minutes' random delay) and starts `automancer-release-notes-catchup.service`.
That service runs
`/opt/automancer/srv/detectors/auto/scripts/release-notes-catchup-all.sh`.

The runner only picks up repositories whose `.release-notes.json` on
`origin/main` declares `"deployTrigger": "push"`, `"mixed"` or `"live"`. This
repo declares `push`, because a push to `main` is the deploy. Until AUT-11770
the key was missing, so it defaulted to `ref` and the runner skipped this site
without saying so. To check it is enrolled, run:

```bash
node /opt/automancer/srv/detectors/auto/scripts/release-notes.mjs configured-repos \
  --root /opt/automancer/projects,/opt/automancer/ops | grep automancer-site
# push	main	https://github.com/Automancer-Ltd/automancer-site.git	...
```

The runner never writes in a live checkout. It works in its own clone at
`/opt/automancer/var/release-notes-catchup/automancer-site-626cb0d091cd`. The
suffix is the first 12 hex characters of the SHA-256 of the origin URL. In that
clone it runs `scripts/release-notes-catchup.sh --repo <clone> --branch main`.
That script treats "origin/main is ahead of the last release tag" as the deploy
signal, because GitHub has already built and served the change by the time it
runs. The script's `publish` step decides how the release commit reaches
`main`. It opens a `release/<version>` pull request with auto-merge in two
cases: when `main` is protected, or when `main` has moved past the release
commit. In every other case it pushes the release commit straight to `main`.
On 2026-10-01 `main` had no protection and no rulesets, so `v2026.10.01.1` was
pushed directly. That describes that day only; check the current state with
`gh api repos/Automancer-Ltd/automancer-site/branches/main --jq .protected`.
Either way the script then pushes the tag and publishes the GitHub release. By
hand, the sequence is:

```bash
RN=/opt/automancer/srv/detectors/auto/scripts/release-notes.mjs
node "$RN" preview --repo "$PWD"   # read it first
node "$RN" release --repo "$PWD" --yes --no-publish
# Let publish push. It opens a release/<tag> pull request if main is protected
# or has moved past HEAD, and pushes directly otherwise. It then pushes the tag
# and the GitHub release.
node "$RN" publish --repo "$PWD" --ref "$(git rev-parse HEAD)" --tag "$(git describe --tags --exact-match HEAD)"
```

To run one catch-up now instead of waiting for the hour, run it in the dedicated
clone. Never run it in a working checkout:

```bash
/opt/automancer/srv/detectors/auto/scripts/release-notes-catchup.sh \
  --repo /opt/automancer/var/release-notes-catchup/automancer-site-626cb0d091cd --branch main
```

Docs-only commits are classified as not user-facing and need no release at all.

`RELEASE_NOTES_SKIP=1` exists for `auto`/`release-notes-on-deploy.sh` on repos
that do have a deploy script. It has no effect here since nothing in this
repo's own pipeline calls the writer.

## Before you push

1. `git fetch && git rev-list --left-right --count origin/main...main` — if the
   left number is not 0 you are behind, and anything you verified locally was
   verified against the wrong tree.
2. `pnpm install` — if the lockfile moved, a green run on the old dependencies
   proves nothing (`prepare` also runs `astro sync` so `.astro/` types exist).
3. `pnpm run verify` — one command, identical to what CI runs and in CI's
   order: `pnpm run check` (`oxlint --type-aware`, `tsgo --noEmit`, and fast
   tests) first, then `pnpm run test` (fresh `astro build` + full `dist/` suite).

CI (`ci.yml`) runs `checks` (`pnpm run check` and `pnpm run test`) on every PR
and push to `main`. `main` branch protection requires `checks` (`strict: false`),
and `deploy.yml` waits for `checks` to succeed on `$GITHUB_SHA` before building
and publishing to GitHub Pages.

## The preview target — the only safe place to rehearse a rollback

`main` deploys straight to the public site, so there is nowhere on the normal
deploy path to rehearse anything: a rehearsal against `main` is an incident. This
is why the rollback runbook stayed unexercised for so long. The preview target
is the non-production origin that fixes that. It was added 2026-10-18 and is
**not** on GitHub Pages, cannot publish `automancer.uk`, and never serves `main`.

| | |
|---|---|
| URL (tailnet only) | `https://automancer-vps.taild6c90e.ts.net:4174/` |
| Loopback on auto-vps | `http://127.0.0.1:4174/` |
| Service | `automancer-site-preview.service` (user unit, enabled) |
| Serves | `/opt/automancer/srv/automancer-site-preview/current` (a symlink to the release in use) |
| Releases | `/opt/automancer/srv/automancer-site-preview/releases/<full-sha>/` |
| Deploy log | `/opt/automancer/srv/automancer-site-preview/state/deployments.jsonl` |
| Target code | `/opt/automancer/srv/automancer-site-preview/target` (a clone, checked out at the revision named by `install-target.sh`) |

No hosting resource was created for this: it is a user unit on auto-vps serving
a directory, exposed over the tailnet mapping that already existed for other
previews. It holds no credentials and files no alerts — a preview that is down is
not an estate incident, and `deploy-preview.sh` fails loudly if the target does
not answer with the revision it just published.

### Publishing a ref to it

```bash
ops/preview/install-target.sh [<ref>]        # install/refresh the target itself (default main)
ops/preview/deploy-preview.sh <ref> --verify # build + publish a ref, then run the production checker
```

`deploy-preview.sh` refuses `main` by name and by revision, runs the repository
gate (`pnpm run verify`, the same sequence CI's `checks` job runs) before it
publishes anything, stamps the release with its ref and revision, flips
`current`, and then **reads the served revision back off the target** instead of
assuming the deploy worked. It prints the one-line undo (`ln -sfn <previous
release> current && systemctl --user restart automancer-site-preview.service`).
`ops/test-preview-target.sh` drives the deploy machinery's ref resolution and
install preflight in CI, and `tests/preview-target.test.ts` drives the server and
marker; both run on every pull request.

### Why it cannot be mistaken for the public site

1. It is a separate origin. Nothing here writes to GitHub Pages, and no workflow
   in this repository can deploy a preview: `deploy.yml` still deploys only on a
   push to `main` or a manual dispatch.
2. `deploy-preview.sh` refuses `main` (and its tip) outright.
3. The server (`ops/preview/preview.mjs serve`) only serves a root that
   `ops/preview/preview.mjs mark` has stamped with `.preview-target`. Pointed at
   any other directory — a production `dist/`, a stale release — it serves a
   placeholder instead of a site.
4. Everything it serves carries `X-Robots-Tag: noindex, nofollow, noarchive`,
   `<meta name="robots" content="noindex, nofollow">`, and a visible
   `PREVIEW TARGET — non-production. Not automancer.uk` banner naming the ref and
   revision it was built from. The server also refuses to bind port 80 or 443.

### What it is not

It is not a mirror of `main` and not a second production. It keeps the newest 5
release directories and serves the last one anyone published — after a rehearsal
that is the rehearsed revision, not `main`. No release notes, no Sentry (a
preview build has no `PUBLIC_AUT_SENTRY_WEB_DSN`, deliberately: a rehearsal must
not consume the production error budget), and no PR previews. Undo the whole
target with:

```bash
systemctl --user disable --now automancer-site-preview.service
rm -f ~/.config/systemd/user/automancer-site-preview.service
sudo tailscale serve --https=4174 off
```

## Rollback

Redeploy is automatic on push, so a revert reaches production the same way the
change did. **The single-commit revert path was exercised end to end on
2026-10-18, on the preview target**; the commands and their observed output are
below, and the untouched transcript (including the revision the target served
after each step) is `/opt/automancer/var/scratch/s1621/rehearsal.log`.

- **A bad user-facing change** — revert that one commit and push. This is almost
  always the right rollback, because typically only one commit changes what a
  visitor sees. Exercised with a temporary branch (`preview/rollback-rehearsal`)
  carrying one harmless candidate commit (`3cd90d8`) on top of `main`'s
  `1135f5e`:

  ```console
  $ git revert --no-edit 3cd90d8
  [preview/rollback-rehearsal d2de53e] Revert "rehearsal: harmless candidate for the rollback rehearsal (temporary, will be reverted)"
   1 file changed, 5 deletions(-)
   delete mode 100644 public/rehearsal-candidate.txt

  $ git push origin preview/rollback-rehearsal
  ✓ pre-push checks passed
  To https://github.com/Automancer-Ltd/automancer-site.git
     3cd90d8..d2de53e  preview/rollback-rehearsal -> preview/rollback-rehearsal
  ```

  The revert restores the starting tree exactly: the revert commit and `main`
  have the same tree object, `git diff --stat main d2de53e` is empty.

- **Then deploy and verify it**, exactly as production does (`deploy-preview.sh`
  for the preview target; a push to `main` for production, where `deploy.yml`
  builds and its `verify` job runs the same checker):

  ```console
  $ ops/preview/deploy-preview.sh preview/rollback-rehearsal --verify
  deploy-preview: publishing preview/rollback-rehearsal -> d2de53e0b294e3ea3214aa0004622d1ea1876e4a
  deploy-preview: installing dependencies (frozen lockfile)
  deploy-preview: running the repository gate (pnpm run verify: lint, typecheck, build, dist audit)
  … 156 tests passed
  marked 34 html file(s) (34 rewritten) … as preview/rollback-rehearsal@d2de53e

  served revision : d2de53e  (/opt/automancer/srv/automancer-site-preview/releases/d2de53e0b294e3ea3214aa0004622d1ea1876e4a)
  previous release: 3cd90d8d1278ed68aa8dc2c4b334eef759beaedd

  deploy-preview: verifying the target with the production checker (preview mode)
  Verifying https://automancer-vps.taild6c90e.ts.net:4174 (each check retries for up to 90s before failing)
  Mode: preview target (non-production) — the Sentry assertion is inverted: this target must serve NO Sentry ingest DSN
  PASS  page / answers 200
  PASS  page /services answers 200   (via 1 redirect(s) to …/services/)
  PASS  unknown path answers a REAL 404 (not a soft 404)
  PASS  /llms.txt answers 200 with a non-empty body
  PASS  /sitemap-index.xml answers 200 and parses as XML
  PASS  /agent.json answers 200 and parses as JSON
  PASS  /security.txt answers 200 and satisfies RFC 9116
  PASS  homepage contains structural anchor "Company No. 17060907"
  PASS  homepage serves expected build revision d2de53e
  PASS  error monitoring is deliberately INERT on this non-production target (bundle carries no Sentry DSN)
  PASS  TLS certificate valid and expires >21 days out

  RESULT: all checks passed against https://automancer-vps.taild6c90e.ts.net:4174
  ```

  The two served homepages — the candidate's and the reverted one — are
  byte-identical once the revision and build time are normalised, and the
  candidate-only file answers `200` while the candidate release is on `current`
  and `404` after the revert.

- **Full restore to the pre-campaign tree** —
  `git reset --hard ox-campaign-truebaseline-2026-08-21 && git push --force-with-lease`.
  Last resort; discards work, so it needs a human decision. **Still unexercised,
  deliberately:** docs/PLAN.md §2 keeps the force-push/full-restore path out of
  the rehearsal, so this is the one path in this runbook with no rehearsal
  behind it. Rehearsing it means force-pushing a throwaway branch on the preview
  target, and it is worth doing before anyone needs it in an incident.

### What the rehearsal itself caught

Four attempts failed before it ran clean, which is the point of having somewhere
safe to fail. Every defect was in the target, never in the site: the deploy ran
its frozen install in the caller's directory instead of the candidate worktree
(so nothing was ever published); the running server read the release stamp once
at startup, so a release published after the service started was never served;
and then, on the re-run after the merge, the deploy resolved the plain ref name
against the target clone's own stale local `main` and moved the checkout onto a
revision from before the target existed. The first two are fixed in the PR that
added the target, the last two in the follow-up that added
`ops/preview/resolve-ref.sh` and the install preflight. `tests/preview-target.test.ts`
covers the stamp behaviour and `ops/test-preview-target.sh` — run by CI's
`checks` job — covers ref resolution and the preflight, both against local
fixtures with no network and no systemd.

The rehearsal was then run a second time on merged `main`, with the target
re-installed from it (`install-target.sh main`, target code `e146e31`), on a
temporary branch cut from that merge: candidate `a8fb038` served (its only file
answering 200), reverted to `addf598` with the same tree as `main`, served, all
checks passing, and the candidate file answering 404 again. `automancer.uk`
served `e146e31` throughout. Both runs are in the same transcript.

## Verify from production, never from the green tick

The workflow reporting success does not mean the site is correct. The manual
spot-check is:

```bash
for u in / /404.html /field-notes/ /llms.txt /sitemap-index.xml; do
  printf '%-22s %s\n' "$u" "$(curl -s -o /dev/null -w '%{http_code}' https://automancer.uk$u)"
done
curl -s -o /dev/null -w '%{http_code}\n' https://automancer.uk/definitely-not-a-page   # must be 404
```

`ops/verify-production.sh` automates a stronger version of this: page
statuses, a real (not soft) 404, `llms.txt`, sitemap XML validity, the legal
footer anchor on the homepage, and TLS certificate expiry more than 21 days
out (`TLS_MIN_DAYS=21` in the script — corrected from "14" on 2026-09-22; the
threshold must sit below Let's Encrypt's ~29-day renewal point) — each
retried for up to 90 seconds so a lagging Pages deploy is ridden
out but a real failure still fails. It takes the base URL as its argument,
so it can be pointed at the preview target — with `--preview`, which keeps every
assertion but inverts the Sentry one (a preview must carry *no* ingest DSN):

```bash
ops/verify-production.sh https://automancer.uk                      # production
ops/verify-production.sh --preview --expected-revision <sha> \
  https://automancer-vps.taild6c90e.ts.net:4174                     # the preview target
```

## Things that look wrong and are not

- **`/services.html` returns 301, then a 200 page.** The 301 only adds a trailing
  slash; the hop that reaches `/services` is a `<meta http-equiv="refresh">` page
  that Astro emits with a canonical link, `noindex`, and a real anchor. It is not
  a redirect loop and it is not broken.
- **A bare path like `/services` returns 301 before the 200.** GitHub Pages
  redirects directory-style URLs to their trailing-slash canonical form. The
  verifier follows redirects and asserts the final status, so this hop is
  expected and checked end to end.
- **The 301 body mentions nginx.** That string is page content in GitHub's error
  template. The actual `Server:` header is `GitHub.com`. Read the header, not the
  body.
- **Legacy `*.html` stub pages have no `<h1>`.** Correct for a redirect page; the
  test suite excludes them deliberately.

## Uptime monitoring

UptimeRobot checks `https://automancer.uk/` from outside the estate. That is
the independent availability signal: it answers whether the public URL
responds, but it does not validate the deployed revision, declared assets,
legal footer anchor, Sentry destination, real 404 behaviour, or the TLS
certificate's 21-day expiry floor.

Two things call `ops/verify-production.sh` against production:

- **`deploy.yml` → `verify` job** — runs after every deploy and fails the
  release run if production does not serve what was shipped.
- **The auto-vps user timer** — `automancer-site-production-verify.timer`,
  every 30 minutes on the wall clock (`OnCalendar=*:0/30`), covering
  everything between deploys: site down, certificate expiring, a bad change
  landing out-of-band. Unit files live at
  `ops/systemd/user/automancer-site-production-verify.{service,timer}` and run
  from the reviewed pin at `/opt/automancer/auto/automancer-detectors/site`.
  A failure follows `OnFailure=alert-email@%n.service` into the estate's
  alert-email path; `automancer-site-production-verify.service failed` matches
  no page rule, so it lands in the daily digest and files a Paperclip issue.

Merging to `main` does **not** move the pin. To ship a change to the verifier
or its units, deploy the reviewed merge commit:

```bash
ops/deploy-production-monitor.sh <full-reviewed-main-sha>
```

The deploy refuses before changing anything when a release-note unit link is
dangling (AUT-9801), because `systemctl --user daemon-reload` would otherwise
drop a live writer. Check the timer with
`systemctl --user list-timers automancer-site-production-verify.timer` and the
last run with `journalctl --user -u automancer-site-production-verify.service`.

UptimeRobot remains the independent availability monitor: it does not depend
on auto-vps or on GitHub Actions.

## Sentry, and how it fails silently

The build reads `PUBLIC_AUT_SENTRY_WEB_DSN`, injected by CI from a repository
*variable* — not a secret. A Sentry DSN identifies a project; it is not a
credential. `src/scripts/sentry.ts` initialises only when `PROD && dsn`, which
has two consequences:

- **The build never needs a real credential.** Without the variable it builds
  fine and Sentry stays inert. That is correct for dev, preview and test, and
  it is why a lane given a bare "run the build" instruction has no reason to go
  looking for secrets.
- **In production that same guard fails silently.** If the variable is ever
  unset or renamed, the site builds green, deploys green, and error monitoring
  is simply off. A DSN for a *different* Sentry project fails the same way
  from a visitor's point of view: errors go somewhere nobody is watching.

`ops/verify-production.sh` therefore asserts more than "an ingest URL is
present". It extracts the numeric project id from the served bundle and
compares it to a committed constant, `EXPECTED_SENTRY_PROJECT_ID`
(`4511769898647632`, slug `automancer-site` in org `automancer`). That
constant is the intended destination, read from the Sentry project catalogue,
not copied from the CI variable that supplies the DSN — a DSN and an expected
id taken from the same place would always agree.

A missing DSN and a wrong-project DSN fail distinguishably: the missing case
names `PUBLIC_AUT_SENTRY_WEB_DSN` (the variable, not the application code);
the mismatch names the expected id against the id found in the bundle. Neither
message prints a DSN.

What the constant cannot catch: a change that updates both the committed id
and the CI DSN to a new project in the same PR. That is a change of intent,
not a silent misconfiguration.

To re-check without printing a DSN (positive control first):

```bash
curl -s https://automancer.uk/ | grep -c 'Automancer'
ops/verify-production.sh --assert-sentry-bundle <a-local-copy-of-the-js-bundle>
```

The production verify job and the auto-vps timer run the same assertion against
the live homepage bundle. Do not grep the bundle for an ingest host and treat
a non-zero count as success — that is the check this replaced.

### Where a Sentry error goes (proved 2026-09-24, AUT-7596)

Sentry does **not** email anyone about this project, and that is deliberate.
Every alert workflow in the `automancer` org was disabled in one sweep on
2026-09-01 (22:11–22:13Z), the evening the board limited immediate mail to
four page classes (ops runbook `vps-ops.md`, "Delivery route"). A site error
is not one of them. Sentry's own error mail would also be invisible: a Gmail
filter on `waseem@automancer.uk` archives it and marks it read on arrival.

The path we own is the estate poller on auto-vps,
`/opt/automancer/ops/scripts/sentry-issue-digest.sh`
(`sentry-issue-digest.timer`, every 15 min plus up to 15 min jitter). It reads
every unresolved `error`/`fatal` issue in the org, this project included, and
hands each to `alert-email.sh` on the `digest` route. That files one Paperclip
`[alert] Sentry issue <shortId>` card (agent work first, per the board's
2026-08-28 alert contract), and adds the issue to the spool the 06:30Z
"Automancer digest" mail reads. That mail names only the top three alert
subjects, so a single site error shows there as a count. The card is where it
gets acted on.

So the empty `workflowIds` on the "Error Monitor" detector (1529890) is not a
gap: wiring it would re-enable an interrupt the board removed, into a mailbox
filter that hides it. Do not "fix" it without a change to the routing table.

The end-to-end proof: one tagged event (`tags.test=alert-path-proof`) sent
through the site DSN at 02:37:19Z became `AUTOMANCER-SITE-5`. The poller took
it at 02:42:54Z, spooled it, and filed AUT-10230. It was then resolved in
Sentry. To repeat it, send the same shape, then check
`/opt/automancer/var/sentry-issue-digest/latched` and the spool for the
short id after the next timer run.

## Local verification runs on a different Node major than CI

| | Node |
|---|---|
| `engines.node` | `>=22.12.0` |
| CI and Deploy workflows | **22** |
| This build box | **24.19.0** |

Nothing is misconfigured — `engines` permits both, and pinning CI to the declared
floor is a deliberate choice: it tests the oldest runtime we claim to support.

The consequence is worth stating plainly, because it is easy to forget: **a green
`pnpm run verify` on this box is not proof of a green CI run.** It is evidence
from a runtime CI never uses. CI is authoritative; local is a fast pre-filter.

If you ever need them to agree — debugging a failure that reproduces only in CI —
run the suite under Node 22 rather than assuming the difference is irrelevant.

`@types/node` is deliberately not a dependency here; nothing in this repo needs
Node type definitions, so there is no version to keep in step.
