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
polls: `scripts/release-notes-catchup.sh --repo <path>` (in `automancer-auto`)
treats "origin/main is ahead of the last release tag" as the deploy signal,
since GitHub has already built and served the change by the time it runs, and
performs the same sequence a human would run by hand:

```bash
node /opt/automancer/auto/scripts/release-notes.mjs preview --repo "$PWD"   # read it first
node /opt/automancer/auto/scripts/release-notes.mjs release --repo "$PWD" --yes
git push && git push --tags
node /opt/automancer/auto/scripts/release-notes.mjs publish --repo "$PWD" --ref "$(git rev-parse HEAD)" --tag vYYYY.MM.DD.N
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
   proves nothing.
3. `pnpm run verify` — one command, identical to what CI runs and in CI's
   order: the typecheck (`astro check`) first, then the suite. The suite
   builds the site and asserts against `dist/`, so it catches what a visitor
   or a crawler would actually get — but it does NOT validate types, so do
   not stop at `pnpm run test`.

CI (`ci.yml`) runs `check` and `test` on every push and PR independently —
i.e. exactly what `pnpm run verify` composes locally.

## Rollback

Redeploy is automatic on push, so a revert reaches production the same way the
change did.

- **A bad user-facing change** — revert that one commit and push. This is almost
  always the right rollback, because typically only one commit changes what a
  visitor sees.
- **Full restore to the pre-campaign tree** —
  `git reset --hard ox-campaign-truebaseline-2026-08-21 && git push --force-with-lease`.
  Last resort; discards work, so it needs a human decision.

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
so it can be pointed at a preview:

```bash
ops/verify-production.sh https://automancer.uk
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

Two GitHub Actions workflows call `ops/verify-production.sh` against
production:

- **`deploy.yml` → `verify` job** — runs after every deploy and fails the
  release run if production does not serve what was shipped.
- **`uptime.yml`** — cron every 30 minutes plus on-demand dispatch, covering
  everything between deploys: site down, certificate expiring, a bad change
  landing out-of-band.

Failures surface as red runs (GitHub notifies maintainers of failing
scheduled workflows by email). There is no dedicated pager or external
multi-region vantage point — if monitoring needs to survive GitHub itself
being unable to see the site, that remains outstanding work.

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

The production verify job and the uptime cron run the same assertion against
the live homepage bundle. Do not grep the bundle for an ingest host and treat
a non-zero count as success — that is the check this replaced.

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
