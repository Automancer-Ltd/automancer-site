# Deploying automancer.uk

## How a change reaches production

1. Pull request → `.github/workflows/ci.yml` job `checks` (the one required context): estate
   checks, `pnpm run verify` (lint, typecheck, build, `dist/` audit), the visitor journey
   (`pnpm run journey`, Playwright at phone and desktop width on the built `dist/`) and the `ops/`
   self-tests.
2. Merge to `main` → `.github/workflows/deploy.yml`, in about two minutes:
   - `build` builds the merged commit once, with the Sentry DSN, `PUBLIC_SENTRY_RELEASE=$GITHUB_SHA`
     and production's page dates, then runs lint, typecheck and the whole `dist/` audit on those
     exact bytes before uploading them as the Pages artifact (a merge can produce a tree no pull
     request tested; there is no separate CI run on `main`). It holds no Pages or OIDC permission:
     only `deploy` can publish;
   - `deploy` downloads the audited archive by its artifact ID, signs its SHA-256 digest
     with GitHub artifact attestations and verifies the signature, workflow and exact
     `main` commit before publishing the archive with `actions/deploy-pages`. Then it runs
     `ops/verify-production.sh --expected-revision "$GITHUB_SHA" https://automancer.uk`
     against production itself. A red verify is a red release;
   - the `journey` job then runs the same Playwright visitor journey against `https://automancer.uk`
     (read-only: the enquiry endpoint and Turnstile are stubbed, nothing is sent).
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
| `ops/verify-production.sh` | every page in the sitemap and `/api/pages.json` and every Markdown twin (200, no redirect, right content type), a real 404, machine surfaces, legal anchor, served revision, served page CSP (`default-src 'none'`, Trusted Types, `connect-src` matching the served DSN origin), SVG/XML active-document CSP and legacy `.html` edge 301s, Sentry project id in the bundle, TLS > 21 days, `automancer.co.uk` refuses forged mail (null MX, SPF `-all`, DMARC reject) | run it; also the hosted schedule below |
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
`noindex` with a visible banner, and it refuses ports 80 and 443. Preview builds are the gate's build, so they carry the tests' dummy DSN (`example.invalid`): an
error there loads the SDK and its report goes nowhere.

```bash
ops/preview/install-target.sh [<ref>]        # install/refresh the target code (default main)
ops/preview/deploy-preview.sh <ref> --verify # verify, build, publish, read the revision back, run the checker
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
and base URLs from this site only, and `connect-src` limited to this site plus the origin of the
Sentry DSN the build bundles (read from `PUBLIC_AUT_SENTRY_WEB_DSN` at build time, so a build with
no DSN allows only `'self'`). `contact.astro` adds `frame-src https://challenges.cloudflare.com`
and the enquiry API's origin for that page alone. The browser therefore refuses any request to
another host, even from code the policy lets run. `tests/csp.test.ts` fails if a page's
`connect-src` and the bundled DSN disagree (error reports would be silently refused), and the
journey's "cannot send data to any other origin" probe proves the refusal in a real browser.
A new third-party request needs its origin added here first, deliberately. Turnstile was checked
on production's real origin with this policy swapped in: the widget and its frame load with no
refusal on the page, exactly as before (Turnstile's own frame logs its own CSP lines, unrelated). Wrap trusted `is:inline`
scripts in `src/components/InlineScript.astro`: Astro does not hash those bodies itself, so the
wrapper renders them once and registers their exact hash through `Astro.csp`. Existing inline
style attributes remain allowed. The visitor journey checks real browser refusal and that the
normal navigation and contact flow run without CSP errors, locally and after every deploy.
Since t21659 the policy also turns on Trusted Types (`require-trusted-types-for 'script'`): the
browser refuses any plain string written into a DOM sink that makes HTML or script (`innerHTML`,
`outerHTML`, `insertAdjacentHTML`, `DOMParser`, `createContextualFragment`, `srcdoc`, a script's
`src` or text, `on*` attributes, string eval). So an injected string can add no markup, link, form
or script, even through code the policy lets run. `trusted-types 'none'` forbids creating any
policy; `BaseLayout`'s `trustedTypes` prop names the exceptions, and the only one is `/contact/`'s
`turnstile` policy, which returns Turnstile's exact script URL and throws for anything else. A new
sink (say a library that sets `innerHTML`) breaks in the browser, not silently: rewrite it with DOM
methods (`textContent`, `createElement`) or add a named, narrow policy here deliberately. Probed on
production before shipping with the policy in report-only: every sitemap page, the 404, the lazily
loaded Sentry SDK and the real Turnstile widget hit no sink except our own loader. The journey's
"refuse ... HTML strings" probe proves each sink is refused, and the telemetry test that the SDK
reports with no refusal. Browsers without Trusted Types ignore both directives and the loader
falls back to a plain URL.
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
(`cachePolicy`, t18923): `/_astro/*` (stylesheets, scripts and, since t19380, the web fonts) and
`main.js?v=<commit>` for a year as `immutable`, unversioned files under `/assets/` (images) for a
day with a week of `stale-while-revalidate`; pages, twins, JSON
and unversioned scripts keep GitHub's ten minutes. Change a file under `/assets/` under a new name
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
on the public client key (`6dc470c03e475e24a3f9ab1aef1f86cb`) are disabled (`t22166`; per-key
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
- **Changing `SECURITY_HEADERS`:** deploy the Worker from the pull request's branch before you
  merge it. The merge's `deploy` job runs the verifier, which reads the new values back, so a
  Worker deployed after the merge turns that release red.
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
