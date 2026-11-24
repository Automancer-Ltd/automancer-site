---
name: verify-site
description: See automancer-site (automancer.uk) working in a real browser. Runs the visitor journey (Playwright, phone and laptop widths) on the built dist/ or on production, and compares every sitemap page of the working tree with main (or any two commits) screenshot by screenshot, so "nothing looks different" and "only this page changed" are checked, not assumed.
---

# verify-site

Two commands drive the site as a visitor does. Both are the repository's own: CI and the deploy
run the first, and the second is how a change proves what it did and did not change on screen.

| Question | Command |
|---|---|
| Do the journeys a visitor takes still work? | `pnpm run journey` |
| What does this change look like, page by page, against main? | `pnpm run compare` |

The journeys are listed, with the tests that prove each one, in [`features/`](features/).

## Launch

- **Journey, local:** `pnpm run journey` (needs `pnpm exec playwright install chromium` once).
  Playwright builds `dist/` with monitoring on (`tests/support/build-env.ts`), serves it as
  production does, through the edge Worker (`ops/edge/local.mjs`), on a free 127.0.0.1 port, and
  stops the server when the run ends. Two runs on one machine never collide, and the Worker's
  headers, redirects and twins are tested before a deploy as well as after it. `SKIP_BUILD=1`
  serves the `dist/` already there instead (after `pnpm run verify`, as CI does). Tests run fully
  parallel across the workers, so each must open its own page and share no state with another.
- **Journey, any served copy:** `JOURNEY_URL=<origin> pnpm run journey` runs the same tests
  read-only against that origin (`deploy.yml` does this on `https://automancer.uk` after
  publishing). The enquiry endpoint and Turnstile are stubbed in every run, so no run ever sends a
  real enquiry.
- **The site by hand:** `pnpm run serve` (after `pnpm run build`) prints the address of the built
  `dist/` served through the edge Worker, as automancer.uk serves it: `curl -I` shows production's
  headers, `curl -H 'Accept: text/markdown'` a page's twin. `--port=<n>` fixes the port,
  `--delay=<ms>` holds every HTML page back. Ctrl-C stops it.
- **Compare:** `pnpm run compare [base-ref]` builds `base-ref` (default `origin/main`; run
  `git fetch` first) from `git archive` into `$COMPARE_DIR` (default: the system temp folder,
  cached per commit), builds the working tree into `dist/`, and opens both in Chromium through
  Playwright's request routing and the edge Worker. It opens no port and starts no server. Options:
  - `--head=<ref>` compares two commits instead of the working tree.
  - `--engines=chromium,firefox,webkit`, `--widths=390,1280`, `--paths=/,/services/` and
    `--motion=reduce` change what is opened.
  - `--no-build` reuses the working tree's `dist/`.
  - `--tolerance=2` is how many colour steps a pixel may move and still count as the same.

## Doctor

- On a heavily loaded machine, build first with `pnpm run verify` (a plain `pnpm run build` has no
  monitoring, so the telemetry test fails on it), then `SKIP_BUILD=1 pnpm run journey`: the server
  then starts in about a second (the start allows 180 s, build included).
- `pnpm run compare origin/main` on an unchanged tree must print `none of 64 page views differ`.
  If it does not, the comparison is not trustworthy on this machine: read the first moved element
  it names before believing any other result.
- WebKit needs system libraries that auto-hst1 and auto-bee lack (`libevent`, `libgtk-4`);
  Chromium and Firefox run everywhere the estate has tried.

## Drive

- **The journeys.** [`features/`](features/) maps each visitor journey to its tests in
  `tests/journey/` (browser) and `tests/*.test.ts` (Vitest audits of the built `dist/`). Run one
  with `pnpm exec playwright test -g "<test name>"`. A journey the map lists without a test is a
  gap: add the test rather than checking it by hand.
- **The comparison.** Run it on every change that should look the same (a refactor, a
  performance change, a dependency bump) and on every change that should look different only
  where intended. Pages come from both builds' sitemaps plus `/404.html`, so a new page is
  covered with no edit. Each page is scrolled through as a reader would (scroll reveals fire),
  fonts settle, the proof strip's build stamp and commit are blanked, the pointer rests at the
  centre (the hero glow's parallax is at rest) and every animation is held still. Then the
  full-page screenshot and every element's box are compared. Each page prints one line:
  - `same`;
  - `DIFFERS`, with changed pixels, the rows they span, any height change and the innermost
    moved element first (it names the cause; `main` growing around it does not);
  - a new script error, policy refusal or status change on the head build is also a difference.

  It exits 1 when anything differs.

## Evidence

- Journey: `test-results/` (painted full-page screenshots named `<project>-<page>.png`, and a
  trace for each failure: `pnpm exec playwright show-trace <trace.zip>`).
- Compare: `test-results/compare/report.json` (every page view's row), and for each page that
  differs `test-results/compare/<engine>-<width>/<page>.{base,head,diff}.png`. In the diff, red
  marks changed pixels over a faded copy of the head build. Look at the diff before claiming a
  change is intended, and attach it to the PR or the task.

## Cleanup

Playwright stops the journey's own server. The comparison starts no server. A `pnpm run serve`
you started for `JOURNEY_URL` is yours to stop, by the PID you started. Base builds stay cached in
`$COMPARE_DIR/<commit>` (about 10 MB each: the source and its `dist/`; `node_modules` is removed
after the build). Delete the folder to reclaim the space. `test-results/` is git-ignored and is replaced by the next run.

## Gotchas

- Text a script changes on a timer cannot be frozen: before t22347 the home page typed its
  terminal line, so comparisons against commits from before t22347 show a small difference in
  that line on `/`.
- A change to the proof strip's build stamp or commit text is invisible to the comparison by
  design.
- t22218 shipped `/developers/` without its hero styles after a hand-picked before/after list
  missed the page. `node ops/compare-builds.mjs e1f093b --head=bdff3f4` replays that release:
  `/developers/` differs at both widths (41% and 55% of pixels, about 320 and 620 px shorter).
