# Deploying automancer.uk

## How a change reaches production

1. Pull request → `.github/workflows/ci.yml` job `checks` (the one required context): estate
   checks, `pnpm run verify` (lint, typecheck, build, `dist/` audit), the visitor journey
   (`SKIP_BUILD=1 pnpm run journey`, Playwright at phone and desktop width on the `dist/` verify
   just built and audited), the `ops/` self-tests, and the published contract: `node
   ops/contract/check-surface.mjs` reads every identifier `/api/stability.json` promises machines
   from production (endpoint paths, operationIds, response field names, service ids, page URLs,
   enum values) and fails when the built `dist/` drops one without a deprecation that has run its
   notice (t25827).
2. Merge to `main` → `.github/workflows/deploy.yml`, in about two minutes:
   - `build` builds the merged commit once, with the Sentry DSN and production's page dates
     (each Sentry event names the commit from the page's `build-revision`, t26545), then runs lint, typecheck and the whole `dist/` audit on those
     exact bytes before uploading them as the Pages artifact (a merge can produce a tree no pull
     request tested; there is no separate CI run on `main`). It compares those bytes with the
     promises production publishes, as the pull request did, with `--allow-unreachable`: if
     production cannot be read, the release still ships (it may be the fix) and the step's warning
     says nothing was compared. It plans which pages to announce to search engines (`node
     ops/indexnow.mjs --plan`, below), and last it adds the files earlier releases' pages still load
     (`ops/carry-forward.mjs`, below). It holds no Pages or OIDC permission: only `deploy` can publish;
   - `deploy` downloads the audited archive by its artifact ID, signs its SHA-256 digest
     with GitHub artifact attestations and verifies the signature, workflow and exact
     `main` commit before publishing the archive with `actions/deploy-pages`. Then it runs
     `ops/verify-production.sh --expected-revision "$GITHUB_SHA" https://automancer.uk`
     against production itself. A red verify is a red release;
   - the `journey` job then runs the same Playwright visitor journey against `https://automancer.uk`
     (read-only: the enquiry endpoint and Turnstile are stubbed, nothing is sent), and checks that
     every file `/_carried.json` lists answers 200 (`node ops/carry-forward.mjs --check`). Last, it
     announces the release's changed pages to search engines (IndexNow, below).
3. Record the production verification with estate-watch (`deploy-verify` skill in Executor):
   `deploy.start({ product: "site", url: "https://automancer.uk", commit })` straight after the
   merge, with the merge commit's full SHA (it exists only once merged) and before Pages publishes
   it (about 3 minutes), `deploy.verify({ run })` after the deploy run is green, `deploy.get({ run })`
   for the verdict.
   Every page names its full commit in `<meta name="build-revision">`, which the version check
   matches; the footer shows the short form (`deploy.json` holds the regex Guardian reads).

There is no database, migration or operator step. Docs-only changes still deploy (the build stamp
changes); they are cheap.

GitHub requires a pull request and the `checks` result from GitHub Actions before merging to
`main`, including for administrators. No reviewer approval is required. The deploy audits the
merged tree, so a pull request need not be rebased just because `main` moved. The `github-pages`
environment accepts deployments from `main` only. Every workflow checkout disables persisted Git
credentials, so later build, test and verification steps do not inherit Git authentication.

To read back the branch settings, run `gh api repos/Automancer-Ltd/automancer-site/branches/main/protection`
with repository administration access. To undo this branch policy change, clear **Do not allow
bypassing the above settings** and **Require a pull request before merging** on the `main` branch
protection rule, retaining the existing `checks` requirement.

## Search engines hear about each release (IndexNow, t26811)

Google recrawls on its own schedule; the IndexNow engines are told. One post to
`https://api.indexnow.org/indexnow` reaches every engine that takes part (Bing, and through Bing's
index ChatGPT search, Copilot and DuckDuckGo; Yandex, Seznam, Naver and Yep), which share each
submission with each other ([protocol](https://www.indexnow.org/documentation)).

- **The key** is `INDEXNOW_KEY` in `ops/indexnow.mjs`, served at `/<key>.txt` by
  `src/pages/[indexnowKey].txt.ts`. It is public by design (an engine fetches it to check that whoever
  announces can publish on automancer.uk), and `.gitleaks.toml` allows that exact value only.
  Changing it re-announces every page once.
- **Plan** (build job, before the deploy, while production still serves the last release):
  `node ops/indexnow.mjs --plan --dist=dist` compares the build's `/api/pages.json` with
  production's by each page's words (`contentSha256`, the hash that dates pages) and lists the
  pages that were added, changed or removed. When production does not serve the key yet, or cannot
  be read, it lists every sitemap page. A release that changes no words announces nothing.
  `/developers/` has no hash in `/api/pages.json`, so it is announced only with every page.
- **Submit** (journey job, last): `node ops/indexnow.mjs --submit` checks production serves the key
  file, then posts the planned URLs. 200 and 202 (key still being checked) are success. An engine
  that is busy (429), down (5xx) or unreachable warns and never fails the release; 400, 403 (key
  not valid) and 422 (URL not on the host) fail the step, because they are this site's faults.
- **Check by hand**: `node ops/indexnow.mjs --plan --dist=dist` after a build shows what the next
  release would announce; `INDEXNOW_URLS='["https://automancer.uk/"]' node ops/indexnow.mjs --submit
  --dry-run` checks the live key without posting.
- **Undo**: revert the change. Engines keep the URLs already announced (they are the site's own
  public pages); an announcement cannot be withdrawn and needs none.

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
| `ops/verify-production.sh` | every page in the sitemap and `/api/pages.json` and every Markdown twin (200, no redirect, right content type), a real 404, machine surfaces, legal anchor, served revision, served page CSP (`default-src 'none'`, Trusted Types, `connect-src` matching the served DSN origin), SVG/XML active-document CSP and legacy `.html` edge 301s, Sentry project id in the bundle, the live edge Worker is this revision's `worker.js` (with `--expected-revision`), TLS > 21 days, `automancer.co.uk` refuses forged mail (null MX, SPF `-all`, DMARC reject) | run it; also the hosted schedule below |
| estate-watch schedule `siteVerify` (Executor, :04 and :34 UTC) | the same checks between deploys (pages: only the `ROUTES` list so far; it does not yet read the sitemap and `/api/pages.json`, nor run the forged-mail check), read from this script at the revision production serves; a failure files one Gandalf task in automancer/site | Executor `estate-watch` `scheduleRuns {name:"siteVerify"}`; run one now with `siteVerify.run {}` |
| UptimeRobot monitor `803613943` "site automancer.uk" | the public URL answers, independent of auto-vps | Executor `uptimerobot-guarded` `list-monitors` |
| Sentry project `automancer-site` (id `4511769898647632`, org `automancer`), events tagged with the release SHA | browser errors on the live site | Executor `sentry-guarded.events.listAProjectSIssues` |

To record a deploy check in estate-watch, call `deploy.start {product: "site", commit: "<sha>"}`
straight after the merge, before Pages publishes it, and `deploy.verify {run: "<run id>"}` after it. Calling `deploy.verify` with only
`product` still reads production, but it warns that it has no baseline and no commit to compare
against, so it cannot prove the served revision.

The auto-vps timer `automancer-site-production-verify.timer` that ran this script every 30 minutes was disabled on
6 Nov 2026, after two clean runs of the hosted schedule (t15155). Its units and its pinned clone at
`/opt/automancer/auto/automancer-detectors/site` are kept. To bring it back as-is:
`systemctl --user enable --now automancer-site-production-verify.timer`. `ops/deploy-production-monitor.sh
<full-main-sha>` moves the pin to a reviewed commit and also re-enables the timer, so run it only to bring it back.

The hosted schedule needs no deploy: it reads `ops/verify-production.sh` from GitHub each run. It parses the
`readonly` constants at the top of the script, so keep their shape (one `readonly NAME=` per line, quoted values). A
shape it cannot read fails its run and names the constant.

**Sentry fails silently by design of the guard.** `src/scripts/sentry.ts` initialises only when
`PROD && dsn`, so an unset or wrong `PUBLIC_AUT_SENTRY_WEB_DSN` repository variable builds and
deploys green with monitoring off. The verifier therefore compares the project id in the served
bundle with `EXPECTED_SENTRY_PROJECT_ID`, a constant taken from the Sentry catalogue rather than
from the variable. Sentry sends no mail for this project on purpose; the estate poller
`/opt/automancer/ops/scripts/sentry-issue-digest.sh` picks up every unresolved error and routes it
through `alert-email.sh`.

Error reports keep standard JavaScript error types, the release ID, the page's built canonical
path and known first-party script locations with line and column numbers. The browser excludes
exception messages, rejected values, stack function names, activity history and arbitrary URLs.
A report with no frame from the site's own scripts is dropped before it leaves the page: it names
a browser extension, a cross-origin script or code the page did not load, so it cannot be acted on
(AUTOMANCER-SITE-9, t25374).
The SDK sends error events only. The telemetry browser journey intercepts the real SDK envelopes,
including on production, so its synthetic probes never reach Sentry. The Vitest audit and the local
journey build with the unreachable dummy DSN in `tests/support/build-env.ts`, so the bootstrap and
the SDK chunk a visitor downloads on their first error are audited for storage and weight like
everything else. Undo by reverting the change through the normal Pages release.

## The preview target (rehearsals, drafts for review)

A non-production origin on auto-vps: `https://automancer-vps.taild6c90e.ts.net:4174/` (tailnet only),
user unit `automancer-site-preview.service`, releases under
`/opt/automancer/srv/automancer-site-preview/`. It cannot serve `main` or `automancer.uk`: the deploy
refuses `main`, the server serves only a root `ops/preview/preview.mjs mark` stamped, everything is
`noindex` with a visible banner, and it refuses ports 80 and 443. The target runs the edge Worker
over the marked build using the same Pages stand-in as `pnpm run serve`. Redirects stay on preview
and responses have `Cache-Control: no-store`. The standard preview build uses the tests' dummy
DSN (`example.invalid`), so it can exercise error reporting without reaching Sentry.

```bash
ops/preview/install-target.sh [<ref>]        # install/refresh the target code (default main)
ops/preview/deploy-preview.sh <ref> --verify # verify, build, publish, read the revision back, run the checker
JOURNEY_URL=https://automancer-vps.taild6c90e.ts.net:4174 pnpm run journey
```

`deploy-preview.sh` prints its own undo. It resets its build clone, so under the estate git guard run
it with `GIT_GUARD_ALLOW=1 GIT_GUARD_REASON='<why>'`. To show several drafts at once, merge them into
one review branch on top of `main` and publish that.

The preview target runs a production build, so a `draft: true` entry is never built there either.
To review one, set `draft: false` on a throwaway review branch, publish that branch, and never merge
it; the merged entry stays `draft: true` and publishes only after Waseem approves its wording. A
draft with no page to link can be reviewed from its file in the repository instead.

## The edge Worker in front of GitHub Pages

HTML pages also carry Astro's build-generated Content Security Policy in a meta tag. It blocks
unapproved inline JavaScript, event-handler attributes and eval; same-origin scripts and modules
remain allowed. Only `/contact/` adds the Turnstile script origin.

Since t21404 the same policy starts from `default-src 'none'` and lists everything else a page may
use (`security.csp.directives` in `astro.config.mjs`): images, fonts, the manifest, form targets
and base URLs from this site only, and `connect-src` limited to this site. Until t24432 it also
allowed the origin of the Sentry DSN the build bundles; error reports now go to this site (below).
`contact.astro` adds `frame-src https://challenges.cloudflare.com`
and the enquiry API's origin for that page alone. The browser therefore refuses any request to
another host, even from code the policy lets run. `tests/csp.test.ts` fails if a page's
`connect-src` lets the browser post to the bundled DSN's origin, or the bundled SDK does not post
to the Worker's `/_errors`, and the
journey's "cannot send data to any other origin" probe proves the refusal in a real browser.

**Error reports go through the edge Worker (t24432, 22 Nov 2026).** `src/scripts/sentry.ts` sets
Sentry's `tunnel: '/_errors'`, so a page posts its error report to automancer.uk and the Worker
(`errorReport()`, `ERROR_TUNNEL` in `ops/edge/worker.js`) passes it on to
`https://o4511673494732800.ingest.de.sentry.io/api/4511769898647632/envelope/`. Before, the
visitor's browser posted to Sentry itself, so Sentry received their IP address, language and
Referer with each report, and each page's CSP named a third party. The Worker sends only the
envelope, `Content-Type`, `Origin: https://automancer.uk` (so the project's `allowedDomains`
still matches) and its own fixed `User-Agent`;
Sentry sees Cloudflare's address. It is not an open relay: it refuses a post from another
site's page (403), a body over 64 KiB (413), and an envelope for a different project (400),
without passing anything on. Sentry's status and
its `Retry-After` and `X-Sentry-Rate-Limits` go back, so the SDK still backs off. Reports from
browsers whose blockers stop Sentry's own address now arrive too. Order: deploy the Worker,
then merge; a page that posts to `/_errors` before the Worker holds it loses its report (Pages
answers 405). Undo: revert the merge (pages post to Sentry again) and only then deploy the
previous Worker version. `check_error_tunnel` in `ops/verify-production.sh` asks the live Worker
the questions it must refuse, using empty diagnostics that create no Sentry issues.

**Only the Worker holds a key Sentry takes (t24883, 23 Nov 2026).** Until then the DSN every page
bundles held the project's live client key (`6dc470c0…`, the project's "Default" key). Anyone could
read it from a page and post into the error monitor directly, from anywhere and with no Origin
(Sentry answered an empty client report with 200), or through `/_errors` with a forged `Origin`
header and no limit, burying real errors and spending the plan's quota. Now:

- The Worker signs every report with its own key: the Worker secret `SENTRY_KEY` (Sentry key
  "automancer.uk edge Worker (SENTRY_KEY, t24883)"), set with `workerPutScriptSecret` on
  `automancer-site-edge` and on the probe. It is never in this repository, a log or a build.
  `signedEnvelope()` rebuilds the envelope and item headers with the Worker's fixed DSN. A
  Worker without `SENTRY_KEY` answers 503 and never forwards with a page's key.
- The page's DSN holds no key: the repository variable `PUBLIC_AUT_SENTRY_WEB_DSN` is
  `https://tunnel@o4511673494732800.ingest.de.sentry.io/4511769898647632`, which still names the
  project for the SDK, the verifier and estate-watch. The old key is deactivated in Sentry
  (`isActive: false`), so the copies in old pages and caches are refused (403); Sentry refuses
  `tunnel` with 401.
- `/_errors` takes about ten reports a minute from one address (the `ratelimit` binding
  `ERROR_REPORTS`, namespace 24883). Cloudflare counts per location and loosely: a burst of 53
  posts in a minute from one address had 26 taken on the probe. Past the limit the Worker answers
  429 with `Retry-After: 60` and `X-Sentry-Rate-Limits: 60::organization`, so the SDK pauses. The
  address is only counted at the edge and never sent on.
- `ops/edge/deploy.sh` uploads both bindings with every version (`SENTRY_KEY` as `inherit`, so it
  needs the secret to exist on the script first) and fails if the read-back lacks either.
- `ops/verify-production.sh` proves both halves on production after every deploy:
  `check_error_tunnel_signs` posts an empty client report through `/_errors` and needs Sentry's
  200, and `check_page_key_refused` posts one straight to Sentry with the served bundle's key and
  needs 401 or 403. Neither prints a key.

**One request carries one error (t25486).** Each request counts once at the edge. The Worker
requires one JSON exception event, checks the item's exact byte boundary and rejects batches
before signing. The only `client_report` it takes is the verifier's empty diagnostic. It
buffers at most 64 KiB and cancels a stream as soon as it crosses that limit, including requests
without `Content-Length`. The Worker refuses redirects from the pinned Sentry endpoint.
The production verifier checks that a batch of empty diagnostics returns 400 and that a single
diagnostic still returns 200. Rehearse on the probe Worker, then deploy the Worker before merging
so this live check can pass. To undo, revert the merge through a pull request before redeploying
the preceding Worker version.

**The Worker limits what error reports send to Sentry (t25916).** It builds a fresh event
before signing. It keeps standard error types, the release and event IDs, and source locations
on this site. It drops raw messages, user and request details, breadcrumbs, stack function
names, URL queries and fragments, and free-text envelope metadata. Reports without a usable
source location are refused. The browser still restricts locations to scripts on the page.
The Worker's check recognises the site's page and script path formats without fetching Pages.
The Worker derives a recognised browser's family and major version from its User-Agent and
adds those two fields to the Sentry browser context (t26213). Unknown or missing User-Agents
leave the context empty. Sentry receives the Worker's fixed User-Agent, so the visitor's raw
header, device and operating-system details and full browser build stay out of the report.
The edge test inspects the outbound headers and envelope. The browser journey checks the SDK
still sends a format the Worker accepts. Roll back by reverting the pull request through the
normal release and restoring the preceding Worker version before the rollback merge.

Rotate the Worker's key: create a key on the project (`sentry-guarded`
`projects.createProjectKey`, the `de.sentry.io` account), put it with `workerPutScriptSecret`
inside the same Executor program so the value never leaves it, check `check_error_tunnel_signs`,
then deactivate the old one (`projects.updateProjectKey` `isActive: false`). Undo: reactivate
`6dc470c0…`, set the repository variable back to its DSN (the value is in that key's `dsn`), and
deploy the previous Worker version (`deploy.sh` at the previous commit, which uploads no
bindings).
A new third-party request needs its origin added here first, deliberately. Turnstile was checked
on production's real origin with this policy swapped in: the widget and its frame load with no
refusal on the page, exactly as before (Turnstile's own frame logs its own CSP lines, unrelated). A page's own
script is TypeScript in `src/scripts/`, imported from a `<script>` in the page: Astro bundles it
into the page and hashes it itself. Only a script that must run at its place in the parse (the
off-site guard, the font-fallback request, the field-notes topic pick) stays `is:inline`; wrap
those in `src/components/InlineScript.astro`: Astro does not hash those bodies itself, so the
wrapper renders them once and registers their exact hash through `Astro.csp`. Existing inline
style attributes remain allowed. The visitor journey checks real browser refusal and that the
normal navigation and contact flow run without CSP errors, locally and after every deploy.
Since t21659 the policy also turns on Trusted Types (`require-trusted-types-for 'script'`): the
browser refuses any plain string written into a DOM sink that makes HTML or script (`innerHTML`,
`outerHTML`, `insertAdjacentHTML`, `DOMParser`, `createContextualFragment`, `srcdoc`, a script's
`src` or text, `on*` attributes, string eval). Every page sets `trusted-types 'none'` to forbid
policy creation. Contact keeps Cloudflare's script in a template in the head. On first interaction,
the form checks and clones the fixed script element. The browser can load it without setting a
script URL at runtime. Contact's `script-src` allows the widget's entry path and its same-host
redirect to a versioned URL (t26719).
The browser journey checks that Contact can load the widget while refusing policy creation from
its first module. The production verifier checks the script allowlist and Trusted Types policy.
Roll back through a PR reverting this change so GitHub Pages republishes the previous loader.
The periodic HTTP verifier does not test script execution. The Worker's framing/base/object policy
below applies alongside this policy; no Worker deploy is needed for a page-policy change.

Cloudflare Web Analytics must stay **disabled** for `automancer.uk` (Automancer account →
Web Analytics → Manage site → Real User Measurements → Disable). Its automatic setup injects
`static.cloudflareinsights.com` scripts, which conflict with the site's no-analytics commitment
and are refused by CSP. The previous “Enable, excluding visitor data in the EU” setting hid the
injection from some regions; the hosted production journey exposed it. After changing this
setting, reopen Manage site to read it back and rerun the production journey. Restoring that
radio option reverses the provider change, but also restores the unwanted analytics injection.

`automancer.uk` and `www.automancer.uk` are proxied by Cloudflare (zone `automancer.uk`) through the
Worker `automancer-site-edge` (`ops/edge/worker.js`, routes `automancer.uk/*` and `www.automancer.uk/*`,
both failing closed). GitHub Pages holds the files, and the Worker reads them from the Pages project
address `https://automancer-ltd.github.io/automancer-site/` (see "The origin" below); `www` gets one 301
to the same path on the apex. The Worker answers what a static host cannot: `Accept: text/markdown` gets the Markdown
twin, Markdown 404 bodies, `application/problem+json` errors under `/api/`, the RFC 9727 media type
for `/.well-known/api-catalog`, HTTP → HTTPS, and one 301 from each legacy `*.html` URL in
`astro.config.mjs` `redirects` to its page. It sets how long browsers and the edge keep files
(`cachePolicy`, t18923): `/_astro/*` (stylesheets, scripts and, since t19380, the web fonts) for
a year as `immutable` (its rule for the retired `main.js?v=<commit>` stays until the Worker is next
deployed: since t26489 that code is in the content-hashed page-load module), unversioned files under `/assets/` (images) for a
day with a week of `stale-while-revalidate`; pages, twins, JSON
and unversioned scripts keep GitHub's ten minutes in browsers (a page is also kept at the edge,
one view behind Pages at most: "Pages kept at the edge" below). Change a file under `/assets/` under a new name
if visitors must see it at once. Every response it returns carries the same security
headers (`SECURITY_HEADERS`: HSTS, `nosniff`, Referrer-Policy, a framing/base/object CSP,
Permissions-Policy and `Cross-Origin-Opener-Policy: same-origin`) and no reporting header (`NEL`,
`Report-To`, `Reporting-Endpoints` are stripped; t22383), which `ops/verify-production.sh` reads back on a page, its Markdown twin and
a 404; SVG and XML responses (`image/svg+xml`, `application/xml`) get a full `default-src 'none'`
and Trusted Types CSP header (`XML_DOCUMENT_CSP`), and every legacy `.html` path variant
(including `/<name>.html/index.html` and `//<name>.html/`) gets one 301 at the edge (`t22166`).
Everything else passes through.

On the Sentry project `automancer-site` (`4511769898647632`), `allowedDomains` is `["automancer.uk"]`
so Relay filters out cross-origin browser events from any other origin (`outcome: filtered`,
`reason: cors`),
`scrapeJavaScript` is `false` with `verifySSL` `true`, and replay and performance loader options
on the former public client key (`6dc470c03e475e24a3f9ab1aef1f86cb`, deactivated since t24883) are disabled (`t22166`; per-key
`rateLimit` is ignored on Sentry's Team plan, where Spike Protection governs bursts). Private
vulnerability reporting is enabled on `Automancer-Ltd/automancer-site`.
Undo via Executor `sentry-guarded` (`projects.updateProject` and `projects.updateProjectKey`) and
`github-full-access` (`repos.disablePrivateVulnerabilityReporting`).

- **Deploy it:** `ops/edge/deploy.sh` (Executor `cloudflare-full-access`, account "Waseem
  Cloudflare", the Automancer account, which has held the zone since 23 Oct 2026). A merged change to `worker.js`
  is not live until this runs. Try it first with
  `ops/edge/deploy.sh automancer-site-edge-probe` (workers.dev, real origin). Its workers.dev
  address (`https://automancer-site-edge-probe.waseem-d97.workers.dev`) is off between uses: turn it
  on with `api.workerScript.workerScriptPostSubdomain` `{enabled: true}`, and off again afterwards.
  Compare the probe with the live Worker: `node ops/edge/probe-matrix.mjs <base-url>` asks each
  the same 28 awkward questions (twins, 404s, the API, legacy URLs with encoded queries, doubled
  slashes) and prints one JSON line per answer; diff the two runs.
- **Changing the display-font hint:** the Worker reads up to the first 4 KiB of the HTML it serves
  and sends Syne's existing preload in the `Link` header, using the URL from that release.
  The in-document preload still works if the Worker is rolled back. Verify a GET to the probe
  returns the same HTML and a single font preload, with the same fingerprint as the
  `<head>` link. Check that a Markdown twin and a 404 have no font preload. Roll back by
  deploying the preceding Worker version. Reverting the Pages merge alone leaves the
  Worker version running.
- **The Brotli copies (t24283, 22 Nov 2026):** the build writes `<file>.br` beside every text
  file and the Worker sends it to a browser that takes `br` (`brotliCopy()`). The Worker falls
  back to the file whenever a copy is missing, so either half can ship first; the copies go
  first (merge, let Pages publish), then the Worker, so the Worker never asks for copies that do
  not exist yet. Verify on the probe that `curl -H 'Accept-Encoding: br' .../services/` answers
  `content-encoding: br` with the same Link header and, decoded, the same body as a request
  without it, and that the bytes sent are the copy's size, not Cloudflare's (on HTML that needs
  the copy's `Cache-Control: ..., no-transform`; it keeps the zone's Automatic HTTPS Rewrites,
  Server-Side Excludes and Replace Insecure JS off these responses, which change nothing in this
  site's pages today: an `http://` link added to a page would be rewritten only for the plain answer).
  Also ask with `Accept-Encoding: gzip` alone: it must answer gzip. Cloudflare shows the Worker a
  rewritten `Accept-Encoding` that takes `br` even then, so the Worker decides on
  `request.cf.clientAcceptEncoding` (what the client sent); reading the header sent gzip-only
  clients Brotli that Cloudflare decoded to the full 74 KB page (live for two minutes, 07:20 to
  07:22 UTC on 22 Nov 2026, then rolled back and fixed). A client that sends no
  `Accept-Encoding` gets the plain page, with `no-transform` in its Cache-Control. Undo the
  Worker half by deploying the previous Worker version: every browser is back on Cloudflare's
  own compression at once, and the unused `.br` files are harmless. On the `github.io` copy they
  are only downloads, never a page.
- **The compression dictionary (t26098, RFC 9842):** every page names `/_dictionary/<hash>.txt`
  (the home page frame without its `<main>`), and the build writes `<page>.dcz` beside each `.br`.
  The Worker serves the dictionary with `Use-As-Dictionary` and a year's `immutable` lifetime, and
  sends a page's `.dcz` (`Content-Encoding: dcz`, `Vary: ..., Available-Dictionary`) only to a
  browser whose `Available-Dictionary` is the hash in the copy's first 40 bytes; anything else gets
  Brotli as before. Deploy the Worker first (with no `.dcz` on Pages it answers exactly as the old
  one: the probe's 28 probe-matrix answers matched production, 24 Nov 2026), then merge. Cloudflare
  passes `dcz`, `Available-Dictionary` and the bytes through (probed on workers.dev) but drops
  `Dictionary-ID`, so the dictionary has no id. Verify live with
  `curl -H 'Cache-Control: no-cache' -H 'Accept-Encoding: gzip, br, dcz' -H 'Available-Dictionary: :<base64 SHA-256 of the dictionary>:' https://automancer.uk/about/`:
  `content-encoding: dcz`, and the body starts `5e2a4d1820000000` then the dictionary's hash (the
  no-cache request skips the kept copies, so it reads the copy on Pages). Undo the page half by
  reverting the PR (pages stop naming a dictionary, browsers stop offering it); undo the Worker half
  by deploying the previous Worker version, which ignores `Available-Dictionary` and sends Brotli.
- **Negotiated Markdown (t24736):** the Worker chooses the twin's `.md.br` for clients that
  accept Brotli and falls back to `.md` when the copy is missing. Both paths forward cache
  validators to the chosen file. Verify a GET to `/services/` with `Accept: text/markdown` and
  `Accept-Encoding: br` returns the same ETag and bytes as `/services.md`, with
  `Content-Location: /services.md`. Repeat the first request with that `If-None-Match` and expect
  a bodyless `304` with `Content-Location`. The same revalidation works without Brotli. Roll back
  by deploying the preceding Worker version.
- **Pages kept at the edge (t25774, 24 Nov 2026):** a GET for a page from a browser that takes
  Brotli is answered from the data centre's cache (`keptPage()`, the Workers Cache API, kept under
  `/.edge-cache/page/<path>`, an address no visitor's request reaches), and after answering the
  Worker fetches the page from Pages again and keeps that copy. Before, GitHub Pages' own cache was cold for
  nearly every page asked for, so the first page waited for GitHub (median 169 ms after TLS from
  London). `X-Edge-Cache` says how each page was answered: `hit`, `miss` (fetched, then kept) or
  `reload` (`Cache-Control: no-cache`, as a hard reload sends: fetched from Pages, then kept), or
  `release` (below). A copy kept more than 7 days ago is never served (`PAGE_CACHE_SECONDS`). Twins, the API, feeds,
  `HEAD`, ranges and clients without Brotli are never kept: they always come from Pages, and so
  does everything `ops/verify-production.sh` reads with plain `curl`. Nothing needs purging on a
  release: the deploy's production journey first runs
  `ops/perf/edge-wait.sh https://automancer.uk --reload`, which takes the new release's pages at
  its runner's data centre; to see a page as published anywhere, ask with `Cache-Control:
  no-cache`. Verify: run `ops/perf/edge-wait.sh` twice, a few minutes apart; the second run
  answers `hit` on every page, and each body matches the build's `.br` copy. `ops/edge/local.mjs`
  passes the Worker no context, so local serving keeps no copies (the tests stand in a cache).
  Roll back by deploying the preceding Worker version: kept copies are then never read, and the
  cache drops them after 7 days.
- **Kept pages follow the release (t26545, 25 Nov 2026):** the refresh after each view left a
  quiet page as it was until someone viewed it, up to 7 days: on 25 Nov all 32 pages read from
  Vienna were copies from up to six releases back, `/privacy/` among them, while twins and the API
  were new. GitHub Pages gives every file of a release the same `Last-Modified` (the moment it was
  published; the hex start of its `ETag` is the same time), and a kept copy keeps the page's own
  headers. The Worker keeps the newest `Last-Modified` it has fetched a page with at each data
  centre (`RELEASE_KEY`, `/.edge-cache/release`, never moved back), read alongside the kept copy
  so a hit waits for no extra round trip. A kept copy dated before it is not served: the page is
  fetched from Pages and waited for, and answered `X-Edge-Cache: release`. So after a release
  the first page view at a data centre can still be a copy from before it, and it teaches the
  Worker the release; every page viewed there after that is the new release's. A copy with no
  `Last-Modified` is served as before, and without a known release (the cache evicted it) the
  Worker behaves as t25774 did. Measure with `ops/perf/kept-release.sh` (each page's data centre,
  `X-Edge-Cache` and whether its `Last-Modified` is the live release's; exits 1 when any page is
  behind). Its first run at a data centre is the one that measures, since every view refreshes
  the page; different machines reach different data centres (auto-vps: Vienna; auto-vault,
  auto-hst1, auto-bee, m6: London). Roll back by deploying the preceding Worker version; the
  marker is then never read and drops out after 7 days.
- **A new release is kept whole at each data centre (t26986, 26 Nov 2026):** t26545 still left the
  first view of every page at a data centre after each release waiting for GitHub (`release`):
  97 minutes after a release, 26 of the 32 sitemap pages read from London were. Now the view that
  teaches a data centre a newer release (or its first) also makes the Worker fetch every page the
  sitemap on Pages lists (`sitemapPages()`, `WARM_PAGES` at most) and keep its Brotli copy there,
  after answering (`warmRelease()`, three pages at a time, a few seconds). Only that one view per
  release per data centre waits for GitHub. `/.edge-cache/warmed` records the release warmed, so
  it is done once (two views milliseconds apart can both do it); a hard reload teaches without
  warming, so the deploy's `edge-wait.sh --reload` pass sends no extra requests. Cost: about 66
  requests to Pages per release at each data centre a visitor reaches. Verify: after a release,
  view one page, wait ten seconds, then run `ops/perf/kept-release.sh`: every page answers `hit`
  and none is behind. Roll back by deploying the preceding Worker version; the marker is then
  never read and drops out after 7 days.
- **Earlier releases' files stay served (t26531, 25 Nov 2026):** a kept page can be several
  releases old on a quiet page (seen live on 25 Nov: 4 of 10 pages were copies from 24-25 Nov),
  and so can a browser's own copy or an open tab. Such a page names its own build's page-load
  module, Sentry chunk and compression dictionary, under content-hashed names a later Pages
  artifact did not hold, so it loaded with two 404s and ran no script: the phone menu stayed open
  after a tap outside, the contents bar showed no position, and reveals, prefetch and error
  reports were off. The deploy's build job now runs `node ops/carry-forward.mjs --dist=dist`
  after the audit: it reads production's `/_carried.json` (every file under `/_astro/` and
  `/_dictionary/` that release serves, and when each stopped being built), and adds each file
  this build no longer makes that stopped being built less than 8 days ago (`KEEP_DAYS`: kept
  pages live 7), as production's own bytes, with its `.br` copy when that decodes to the same
  bytes. It never overwrites a built file. Without a ledger (the first release with one) it reads
  the files production's pages and their scripts name. If production cannot be read the release
  ships with nothing carried and the step says so. The carried files come after the audit
  because they are earlier releases' audited bytes, and the budgets measure this build's own.
  Verify: `node ops/carry-forward.mjs --check` (the journey job runs it) asks for every listed
  file; `curl -sI https://automancer.uk/_dictionary/<the previous release's hash>.txt` answers 200.
  Roll back by reverting the pull request: the next release then carries nothing, and the files
  already carried stay only in the release that carried them.
- **HTML byte ranges (t25022):** a range on HTML returns the whole page with `Accept-Ranges: none`.
  Removing the Pages lock changes byte offsets, so a partial copy from Pages can truncate the
  document or cause a Worker error. The local Pages stand-in supports single ranges and the
  journey checks the complete HTML, security headers and a working 64-byte PNG download.
  Deploy the Worker before merging so the new live journey can pass. To roll back both,
  revert the merge through a pull request, let Pages publish, then deploy the preceding Worker
  version. Direct file downloads keep their origin range support.
- **Runtime (t21891, 20 Nov 2026):** `deploy.sh` uploads `worker.js` byte for byte as an ES module
  through Cloudflare's JSON Workers API (`api.versions.createWorkerVersion`, `deploy=true`) with
  `COMPATIBILITY_DATE`, then reads the date back. Before t21891 it rewrote the module into a
  service-worker script with no date, because the Executor gateway could not send the multipart
  upload; Cloudflare ran that on its 2021 runtime, whose URL parser re-encoded legacy redirects
  (`?utm_campaign=spring%20offer` arrived as `spring+offer`). On the standard parser
  `new URL('//services/', ORIGIN)` names the host `services`, so build origin URLs with
  `atOrigin()`. Executor checks the version body against Cloudflare's response schema, so the
  body carries empty `id`, `number`, `urls` and `created_on`; Cloudflare ignores them. To move the
  date forward, read every compatibility flag that turned on since the old date, rehearse on the
  probe, and diff it against production. Roll back by deploying the previous version
  (`api.workerVersions.workerVersionsListVersions` lists them; every upload names its commit in
  `workers/message`), or run the previous commit's `deploy.sh`.
- **Which Worker is live (t25749, 24 Nov 2026):** every response names the source the live
  Worker was deployed from, `X-Edge-Source: sha256:<hex>`. `deploy.sh` hashes the bytes it
  uploads and binds the hash as the plain-text `EDGE_SOURCE` (the module itself is uploaded
  unchanged), reads the binding back, and then waits up to a minute for `https://automancer.uk/`
  to name it. The verifier's `check_edge_source`, run by the `deploy` job with
  `--expected-revision`, compares it with `ops/edge/worker.js` at the merged commit and fails the
  release when they differ: a merged Worker change nobody deployed, a Worker left running from an
  unmerged branch or a working copy, or a version uploaded some other way (no binding, so no
  header). Check it by hand with
  `curl -sI https://automancer.uk/ | grep -i x-edge-source` against
  `shasum -a 256 ops/edge/worker.js`. It is what the Worker says of itself: it catches mistakes,
  not someone who can already deploy a Worker. Cloudflare's own copy is the final word
  (`api.workerScript.workerScriptGetContent`, the module part of the multipart body).
- **Changing `worker.js` at all, `SECURITY_HEADERS` included:** deploy the Worker from the pull
  request's branch before you merge it, and merge nothing else that touches `worker.js` in
  between. The merge's `deploy` job reads the Worker back (its source and its headers), so a
  Worker deployed after the merge turns that release red. A Worker change that needs files Pages
  does not serve yet goes in a later pull request than those files. If a pull request whose
  Worker you deployed is closed without merging, deploy `main`'s `worker.js` again at once.
- **Zone settings it relies on:** `email_obfuscation` off (it rewrites mailto links),
  `browser_check` off (it challenges agents), `browser_cache_ttl` 0 (respect GitHub's
  `max-age=600`), `security_header` HSTS `max-age=15552000` with `include_subdomains` off and
  `nosniff` on (t15574; Cloudflare's edge applies the zone's HSTS value over Worker headers, so
  `SECURITY_HEADERS` matches it), and `nel` (Network Error Logging) off on both `automancer.uk`
  (`4574254c3155f93a8f02aabcf19e00af`) and `automancer.co.uk` (`4d8f72d51dbdbf945ae9f6b15db0ac44`)
  since t22383. With it on, Cloudflare's edge added `NEL` and `Report-To` to every response after
  the Worker ran (a Worker cannot remove them), telling each visitor's browser to post network
  failure reports to `a.nel.cloudflare.com` for seven days, which no page CSP governs. The
  verifier fails if they come back. Undo: `api.nelSettings.nelSettingsEdit` `{value: {enabled:
  true}}` on the zone (Executor `cloudflare-full-access`). The workers.dev probe still carries
  Cloudflare's account-level NEL, so compare it with production ignoring those two headers.
- **Undo:** there is no DNS-only fallback any more: the apex has no origin of its own (below). To
  undo a bad Worker, deploy the previous version (`workerVersionsListVersions`, then
  `ops/edge/deploy.sh` at that commit).

### The origin: the Pages project address (t22925, 21 Nov 2026)

The Pages site `Automancer-Ltd/automancer-site` has **no custom domain**. GitHub serves it at
`https://automancer-ltd.github.io/automancer-site/` on its own `*.github.io` certificate, which GitHub
renews, and the Worker fetches every file from there (`PAGES_HOST`, `PAGES_PATH`, `atPages()`).
GitHub's slash redirects name that address; `fromPages()` moves them back onto `automancer.uk`, and a
redirect anywhere else answers a 502 problem rather than a loop.

Why: while `automancer.uk` was the Pages custom domain, GitHub could not renew its certificate behind
Cloudflare's proxy (`bad_authz`, 15 Nov 2026). Each renewal meant setting the apex DNS-only for about
two hours, with no Worker, security headers or CSP floor. A missed one would have answered 526 on every
page from 13 Feb 2027 (t15154, t20156). None of that applies now. Cloudflare's edge certificate is
Cloudflare's own, and `check_tls` reads it.

DNS, since 21 Nov 2026 (Executor `cloudflare-full-access`, zone `4574254c3155f93a8f02aabcf19e00af`):

| Name | Record | Was |
|---|---|---|
| `automancer.uk` | `AAAA 100::`, proxied (originless; id `619a5c005421ca7274845f4549e8fa54`) | four proxied `A` records to `185.199.108.153`, `.109.153`, `.110.153`, `.111.153` |
| `www.automancer.uk` | `CNAME automancer.uk`, proxied (id `bcf1d7d7478e8b0a5bc2b683d1a339be`) | DNS-only `CNAME waseemilyas.github.io`, redirected by GitHub |

Worker route `www.automancer.uk/*` (id `3dcbb990d660434db9a457b6134b1726`) was added beside
`automancer.uk/*`. No name of the site may point at GitHub any more: with no custom domain on our Pages
site, GitHub would let anyone's Pages site claim a name that did. `ops/verify-production.sh` fails if
`automancer.uk` or `www.automancer.uk` resolves to a GitHub Pages address or a `github.io` name
(`check_no_github_dns`), or if `www` stops answering one 301 from the Worker (`check_www_redirect`).
Do not put `automancer.uk` back as the Pages custom domain: GitHub would then redirect the project
address to `automancer.uk`, and every page would answer 502.

**The project address is public too (t23224).** Anyone can open
`automancer-ltd.github.io/automancer-site/`, and the Worker never sees those requests, so none of its
headers (`frame-ancestors`, COOP, nosniff) are there: any site could frame the full page. The first
script in every page's `<head>` (`BaseLayout.astro`) therefore replaces a page read on a `*.github.io`
host with the same path, query and fragment on `automancer.uk`, and in a stranger's frame it navigates
the frame to `automancer.uk`, which refuses to be framed. It leaves every other host alone (production,
the preview target, localhost, translation proxies). `tests/off-site-guard.test.ts` runs the built
bytes against each kind of address, and the journey test "the GitHub Pages copy sends readers to
automancer.uk and cannot be framed" opens the real project address after each deploy. Markdown, JSON
and other files there cannot carry a script; each page names `automancer.uk` as canonical.

**The script can be switched off, so the page is locked as well (t23484).** A frame with `sandbox`
and no `allow-scripts` never runs that script, and the whole page used to draw inside it in Chromium
and Firefox (checked on 21 Nov 2026 against the live project address). Every built page now carries
`OFFSITE_LOCK` (`ops/edge/worker.js`) straight after the script: a `<style>` that hides the page and
shows one line, "This page is at automancer.uk". The Worker takes it out of every HTML response it
serves (`unlocked()`, as the body streams, only inside `<head>`). `ops/perf/nav-journey.mjs` also
removes the lock because it serves releases without the Worker. Only a production build
carries it, so `astro dev` is unaffected. `tests/off-site-guard.test.ts` serves every built page
through the Worker and requires it exactly as built minus the lock; `check_homepage_anchor` in
`ops/verify-production.sh` fails if production's homepage still carries it. **Order matters:** a
Worker without `unlocked()` serves every page blank, so deploy the Worker before merging a build that
adds or changes the lock (a Worker with it passes a page without the lock through unchanged).
Undo: revert the layout change first and let Pages redeploy, then the Worker if wanted.

**GitHub is asked for the file and nothing else (t23955).** Until 22 Nov 2026 the Worker built its
request to the project address from the visitor's own request, so every page view handed GitHub the
visitor's IP address (`CF-Connecting-IP`, `X-Forwarded-For`), every cookie the browser held for
`automancer.uk` (including any an estate app scopes to the whole domain), the full `Referer` (on a
click between pages, the page and its query, such as `?service=`), `Accept-Language` and `User-Agent`.
Now `pagesRequest()` sends only the method and `If-None-Match`, `If-Modified-Since`, `Range` and
`If-Range`, so 304s still work, as do 206s for direct file downloads. GitHub sees Cloudflare's Workers address
(`2a06:98c0:3600::103`), not the visitor's. `tests/edge-worker.test.ts` fails if any other header
reaches the Pages stand-in. To see what an origin receives, upload `worker.js` with `PAGES_HOST`
set to `httpbin.org` and `PAGES_PATH` set to `/anything` to the probe (`ops/edge/deploy.sh
automancer-site-edge-probe <file>`), ask it for `/services/` with `Accept: application/json` and
read the echoed headers. Then put main's `worker.js` back on the probe. Visitors who open the project
address directly still reach GitHub themselves, and the guard above sends them to `automancer.uk`.

Undo (only if the Worker can no longer read the project address): put back the four `A` records,
proxied; set `www` back to the DNS-only CNAME; set the Pages `cname` to `automancer.uk`
(`repos.updateInformationAboutPagesSite`); deploy Worker version `c10a0bcd-6d40-4284-bad4-8c01f5977303`.
That brings back the renewal problem above.

**Lesson from the switch: GitHub's CDN keeps a custom-domain redirect for about an hour.** While a
Pages site has a custom domain, its project address answers 301 to that domain with no
`Cache-Control`. Fastly keeps that 301 for each path asked, ignores the query string, and keeps a
separate copy for each `Accept-Encoding`. It went on serving those 301s after the domain was removed.
During the switch, the Worker asked the project address before the domain came off. From 05:42 to
05:53 UTC that left some production pages answering 404 and then 502. The fix was to fetch
`/automancer-site///<path>` for an hour, a path nobody had asked for. To make a switch like this
again, remove the custom domain first. Never request the project address while the domain is still
attached. Serve from the old origin until the new one answers 200 for every path.

## automancer.co.uk refuses forged mail (t21934)

`automancer.co.uk` (Cloudflare zone `4d8f72d51dbdbf945ae9f6b15db0ac44`, the Automancer account)
only redirects to `automancer.uk`. It sends and receives no mail: on 20 Nov 2026 Gmail had no
send-as alias on it, and the mailbox held no message to or from it. Until then it published no MX,
no SPF and no DMARC, so mail forged as `anything@automancer.co.uk` reached receivers that had no
policy telling them to refuse it. Since 20 Nov 2026 it publishes:

| Record | Value | Cloudflare record id |
|---|---|---|
| MX `automancer.co.uk` | `0 .` (null MX, RFC 7505: refuse mail at once) | `c784fedf70ebe3da3387cc30682855f8` |
| TXT `automancer.co.uk` | `v=spf1 -all` | `02c23e1387d5a267477b18ddf8212303` |
| TXT `_dmarc.automancer.co.uk` | `v=DMARC1; p=reject; sp=reject; adkim=s; aspf=s` | `1700240fe27346ff5d0a20a45c3f26ed` |

`sp=reject` covers `www.automancer.co.uk`, which is a CNAME and so cannot carry its own TXT.
`ops/verify-production.sh` reads all three back over DNS over HTTPS (`NO_MAIL_DOMAINS`,
`check_no_mail_domains`). It runs after every deploy, so a deleted or weakened record fails the next one.
If the domain ever needs mail, replace all three records in one change and remove it from
`NO_MAIL_DOMAINS`. To undo, delete the three records (Executor `cloudflare-full-access`
`dnsRecordsForAZone.dnsRecordsForAZoneDeleteDnsRecord`) and revert the verifier change.

## automancer.co.uk upgrades to HTTPS on its own name first (t23673)

`automancer.co.uk` and `www.automancer.co.uk` answer from a Cloudflare redirect rule on their own
zone (`4d8f72d51dbdbf945ae9f6b15db0ac44`, ruleset `5c664ad16b3a4ada8c9998e9eb9aa2b1`, rule
`bd3bdf9549934d4085bc5ff92a2f0b13`), not from the Worker. Until 21 Nov 2026 the rule matched plain
HTTP too, so `http://automancer.co.uk/` went straight to `https://automancer.uk/`. A browser ignores
HSTS sent over HTTP, so it never stored this domain's policy, and every typed or old-link visit
started in the clear, open to a network that rewrites the redirect. The rule also dropped the query
(`?service=` and any campaign tag). Since then:

| Setting | Now | Before |
|---|---|---|
| Rule expression | `(http.host eq "automancer.co.uk" or http.host eq "www.automancer.co.uk") and ssl` | the same without `and ssl` |
| Rule `preserve_query_string` | `true` | unset (query dropped) |
| Zone `security_header` HSTS | `max-age=31536000; includeSubDomains`, `preload` off, `nosniff` on | `max-age=15552000`, no `includeSubDomains` |
| Zone `always_use_https` | `on` (unchanged): plain HTTP gets a 301 to HTTPS on the same name | `on` |

So `http://automancer.co.uk/x?q` → `https://automancer.co.uk/x?q` (HSTS stored) →
`https://automancer.uk/x?q`. The zone carries only these two names, so `includeSubDomains` binds
nothing else. `check_redirect_domains` in `ops/verify-production.sh` reads both hops back for both
names after every deploy. Custom TLS 1.2 cipher suites (internet.nl flags the CBC and RSA
key-exchange suites Cloudflare offers by default) need Advanced Certificate Manager on the zone, a
paid add-on (Cloudflare refused the setting with error 1023); the shared `automancer.uk` zone's
ciphers and HSTS also cover every estate hostname, so neither was changed there.

Undo (Executor `cloudflare-full-access`): `zoneRulesets.updateZoneRulesetRule` on the rule above with
the expression without `and ssl` and no `preserve_query_string`, and
`zoneSettings.zoneSettingsEditSingleSetting` `security_header` back to `max_age: 15552000,
include_subdomains: false`; then revert the verifier change. Browsers that already stored the
year-long policy keep using HTTPS for it, which is harmless while the zone serves HTTPS.

## Only the CAs in use may issue the site's certificates (t25293)

Until 24 Nov 2026 neither `automancer.uk` nor `automancer.co.uk` published CAA, so every publicly
trusted certificate authority could issue a certificate for either domain or any name under it,
and one mis-issuance anywhere could impersonate the site or any estate service on `*.automancer.uk`.
Each now publishes CAA `issue` for exactly the CAs Cloudflare's certificate packs use (read on
24 Nov 2026 with `certificatePacks.certificatePacksListCertificatePacks`): Universal SSL is
Let's Encrypt with an SSL.com backup, and the per-host advanced certificates (`factory.`, `portal.`,
`vault.` and the rest) are Google Trust Services. Every web name in the zone is proxied by
Cloudflare; the only DNS-only names serve mail and no HTTPS.

| Zone | Record | Cloudflare record id |
|---|---|---|
| `automancer.uk` (`4574254c3155f93a8f02aabcf19e00af`) | `0 issue "letsencrypt.org"` | `6cc623d466a99914bf063332ccb42651` |
| | `0 issue "pki.goog"` | `8ad7a6ea11b34269412468b47f8929d3` |
| | `0 issue "ssl.com"` | `3d80861a539681ee7aa00e4af2da79a3` |
| `automancer.co.uk` (`4d8f72d51dbdbf945ae9f6b15db0ac44`) | `0 issue "letsencrypt.org"` | `03cef4be71d6bcdcd9cee1a9a09bb4c7` |
| | `0 issue "pki.goog"` | `5051a84f5ad154fcfbe861764c60402f` |
| | `0 issue "ssl.com"` | `15916d70308d76985d5726a066ad35ed` |

Once a zone has any CAA record, Cloudflare's DNS adds the issuers it may itself use to the answer
(`comodoca.com` and `digicert.com`, with `issuewild` copies), so the published set is five CA
operators, all Cloudflare's. No `issuewild` of our own: `issue` governs wildcards too. Both zones
are DNSSEC-signed, so a CA's resolver cannot be fed a forged answer.

`ops/verify-production.sh` reads both back over DNS over HTTPS after every deploy (`CAA_DOMAINS`,
`check_caa`): it fails if an answer is unsigned or missing, names a CA outside `CAA_ALLOWED`,
drops one in `CAA_REQUIRED`, or carries a critical property CAs refuse.

- **A new service needs a certificate from another CA** (a host served outside Cloudflare, or a
  provider that issues for a CNAME under `automancer.uk`): add `0 issue "<ca-domain>"` on the
  zone apex first, then add the domain to `CAA_ALLOWED`. Without the record the CA refuses to issue.
- **Undo:** delete the six records above (Executor `cloudflare-full-access`
  `dnsRecordsForAZone.dnsRecordsForAZoneDeleteDnsRecord`; resolvers keep them for at most the
  3,600-second TTL), then revert the verifier change.

## Rollback

Revert the commit and merge the revert: it deploys and verifies like any change. This path was
rehearsed end to end on the preview target on 18 October 2026 (candidate served, reverted, the
starting tree served byte-identical, the candidate-only file back to 404).

## Verify the signed Pages archive

While GitHub retains the artifact (one day), download it from the deploy run and check the
same archive against the attestation published by that run. Use the full deploy commit shown
by the run as `commit`.

```sh
repo=Automancer-Ltd/automancer-site
gh run download "$run" --repo "$repo" --name github-pages --dir ./pages-artifact
gh attestation verify ./pages-artifact/artifact.tar --repo "$repo" \
  --signer-workflow "$repo/.github/workflows/deploy.yml" \
  --source-ref refs/heads/main --source-digest "$commit"
```

If signing or verification fails during a deploy, the job stops before calling GitHub Pages.
The previous site remains live.

## Things that look wrong and are not

- `/services.html` answers 301 then a meta-refresh page: legacy redirect stubs from
  `astro.config.mjs`, with a canonical link and `noindex`. They have no `<h1>` on purpose.
- A bare `/services` answers 301 first: GitHub Pages adds the trailing slash. The verifier follows
  redirects and checks the final status.
- A 301 body mentioning nginx is GitHub's error template; the `Server:` header is `GitHub.com`.
- CI and deploy run Node 26 (Active LTS, the `engines` floor) and pnpm 12.19.0, the version
  `packageManager` names; auto-vps and auto-bee run Node 26 too. pnpm 12 pins its own binary by
  integrity in `pnpm-lock.yaml` (`packageManagerDependencies`), so `package.json` carries no
  `+sha512` suffix. A local green is a pre-filter, CI's verdict is the one that counts.
