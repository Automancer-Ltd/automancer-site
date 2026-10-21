# Deploying automancer.uk

## How a change reaches production

1. Pull request → `.github/workflows/ci.yml` job `checks` (the one required context): estate
   checks, `pnpm run verify` (lint, typecheck, build, `dist/` audit) and the `ops/` self-tests.
   About a minute.
2. Merge to `main` → `.github/workflows/deploy.yml`, in about two minutes:
   - `build` re-runs `pnpm run verify` on the merged commit (a merge can produce a tree no pull
     request tested; there is no separate CI run on `main`), then builds with the Sentry DSN and
     `PUBLIC_SENTRY_RELEASE=$GITHUB_SHA` and uploads the Pages artifact;
   - `deploy` publishes it with `actions/deploy-pages`, then runs
     `ops/verify-production.sh --expected-revision "$GITHUB_SHA" https://automancer.uk`
     against production itself. A red verify is a red release.
3. Record the production verification with estate-watch (`deploy-verify` skill in Executor):
   `deploy.start({ product: "site", url: "https://automancer.uk", commit })` before the merge,
   `deploy.verify({ run })` after the deploy run is green, `deploy.get({ run })` for the verdict.
   Every page names its full commit in `<meta name="build-revision">`, which the version check
   matches; the footer shows the short form (`deploy.json` holds the regex Guardian reads).

There is no database, migration or operator step. Docs-only changes still deploy (the build stamp
changes); they are cheap.

## Release notes

`CHANGELOG.md` feeds `/releases/`, so it is product content. Nothing in this repo writes it: the
estate's hourly `automancer-release-notes-catchup.timer` treats "`origin/main` is ahead of the last
`v*` tag" as a deploy, writes the entry in its own clone, opens a `release/<tag>` pull request with
auto-merge, and publishes the tag and GitHub release (`.release-notes.json` declares
`"deployTrigger": "push"`). That pull request deploys like any other. To run it now, in its clone,
never a working checkout:

```bash
/opt/automancer/srv/detectors/auto/scripts/release-notes-catchup.sh \
  --repo /opt/automancer/var/release-notes-catchup/automancer-site-626cb0d091cd --branch main
```

## Watching production

| Signal | What it proves | How an agent reads it |
|---|---|---|
| `ops/verify-production.sh` | every route, a real 404, machine surfaces, legal anchor, served revision, Sentry project id in the bundle, TLS > 21 days | run it; also the host timer below |
| Host timer `automancer-site-production-verify.timer` (every 30 min, `OnFailure=alert-email@`) | the same checks between deploys | `journalctl --user -u automancer-site-production-verify.service -n 50` |
| UptimeRobot monitor `803613943` "site automancer.uk" | the public URL answers, independent of auto-vps | Executor `uptimerobot-guarded` `list-monitors` |
| Sentry project `automancer-site` (id `4511769898647632`, org `automancer`), events tagged with the release SHA | browser errors on the live site | Executor `sentry-guarded.events.listAProjectSIssues` |

The timer runs from a pinned clone at `/opt/automancer/auto/automancer-detectors/site`; merging does
not move it. After changing `ops/verify-production.sh` or `ops/systemd/user/`, deploy the merge:

```bash
ops/deploy-production-monitor.sh <full-main-sha>
```

It refuses before touching anything if a release-note unit link is dangling (AUT-9801), because a
user-manager reload would drop that unit.

**Sentry fails silently by design of the guard.** `src/scripts/sentry.ts` initialises only when
`PROD && dsn`, so an unset or wrong `PUBLIC_AUT_SENTRY_WEB_DSN` repository variable builds and
deploys green with monitoring off. The verifier therefore compares the project id in the served
bundle with `EXPECTED_SENTRY_PROJECT_ID`, a constant taken from the Sentry catalogue rather than
from the variable. Sentry sends no mail for this project on purpose; the estate poller
`/opt/automancer/ops/scripts/sentry-issue-digest.sh` picks up every unresolved error and routes it
through `alert-email.sh`.

## The preview target (rehearsals, drafts for review)

A non-production origin on auto-vps: `https://automancer-vps.taild6c90e.ts.net:4174/` (tailnet only),
user unit `automancer-site-preview.service`, releases under
`/opt/automancer/srv/automancer-site-preview/`. It cannot serve `main` or `automancer.uk`: the deploy
refuses `main`, the server serves only a root `ops/preview/preview.mjs mark` stamped, everything is
`noindex` with a visible banner, and it refuses ports 80 and 443. Preview builds carry no Sentry DSN.

```bash
ops/preview/install-target.sh [<ref>]        # install/refresh the target code (default main)
ops/preview/deploy-preview.sh <ref> --verify # verify, build, publish, read the revision back, run the checker
```

`deploy-preview.sh` prints its own undo. It resets its build clone, so under the estate git guard run
it with `GIT_GUARD_ALLOW=1 GIT_GUARD_REASON='<why>'`. To show several drafts at once, merge them into
one review branch on top of `main` and publish that.

## The edge Worker in front of GitHub Pages

`automancer.uk` is proxied by Cloudflare (zone `automancer.uk`) through the Worker
`automancer-site-edge` (`ops/edge/worker.js`, route `automancer.uk/*`, fail-open). GitHub Pages stays
the origin. The Worker answers what a static host cannot: `Accept: text/markdown` gets the Markdown
twin, Markdown 404 bodies, `application/problem+json` errors under `/api/`, the RFC 9727 media type
for `/.well-known/api-catalog`, and HTTP → HTTPS. Everything else passes through.

- **Deploy it:** `ops/edge/deploy.sh` (Executor `cloudflare-full-access`, account "Cloudflare
  waseemIlyas"). A merged change to `worker.js` is not live until this runs. Try it first with
  `ops/edge/deploy.sh automancer-site-edge-probe` (workers.dev, real origin).
- **Zone settings it relies on:** `email_obfuscation` off (it rewrites mailto links),
  `browser_check` off (it challenges agents), `browser_cache_ttl` 0 (respect GitHub's
  `max-age=600`). SSL is "Full (strict)" against GitHub's certificate; if GitHub cannot renew it
  behind the proxy every page answers 526 and the verifier fails.
- **Undo, fastest first:** set the four apex `A` records to DNS-only; or delete the Worker route.

## Rollback

Revert the commit and merge the revert: it deploys and verifies like any change. This path was
rehearsed end to end on the preview target on 18 October 2026 (candidate served, reverted, the
starting tree served byte-identical, the candidate-only file back to 404).

## Things that look wrong and are not

- `/services.html` answers 301 then a meta-refresh page: legacy redirect stubs from
  `astro.config.mjs`, with a canonical link and `noindex`. They have no `<h1>` on purpose.
- A bare `/services` answers 301 first: GitHub Pages adds the trailing slash. The verifier follows
  redirects and checks the final status.
- A 301 body mentioning nginx is GitHub's error template; the `Server:` header is `GitHub.com`.
- CI runs Node 22 (the `engines` floor); auto-vps runs a newer Node. A local green is a pre-filter,
  CI's verdict is the one that counts.
