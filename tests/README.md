# Test suite

Vitest suite that audits the **production build output** (`dist/`) — the bytes
GitHub Pages actually serves — not the source templates. If a refactor breaks
a link, drops an alt attribute, skips a heading level, drifts `llms.txt` from
`src/data/business.ts`, or lets a draft leak into the build, a test here fails.

```sh
pnpm install
pnpm run verify        # what CI runs, in CI's order: astro check FIRST, then build + audit
pnpm run test          # audit only — builds, then audits dist/ (does NOT typecheck)
pnpm run test:watch    # watch mode (build runs once at startup)
```

`pnpm run verify` is the one command to run before pushing: it is exactly
what CI runs (`check` then `test`). A green `pnpm run test` on its own is
not a green run — the suite passing does not validate types; `astro check`
does that, and CI runs it first.

`pnpm test` never needs a manual build first: `tests/global-setup.ts` runs
`pnpm run build` exactly once per invocation before any test file loads.

## How it is structured

```
vitest.config.ts            test config; registers the global setup
tests/global-setup.ts       runs `pnpm run build` once, then hands over
tests/support/dist.ts       walks + parses every emitted .html once per process;
                            resolves URLs against dist/ (routeFor, resolveInDist)
tests/support/content.ts    reads src/content/** frontmatter (draft flags)
tests/support/perf.ts       page-weight engine: real bytes per page off dist/
                            (html/css/js/fonts/images columns; missing refs)
tests/support/perf-cli.ts   CLI for the engine: markdown/--csv tables used to
                            derive and re-derive budgets (`node tests/support/perf-cli.ts`)
tests/pages.test.ts         per-page guarantees: h1, title/description length,
                            canonical/og/twitter tags, lang, heading order,
                            img alt policy, JSON-LD validity
tests/links.test.ts         every internal href/src/srcset must resolve to a real
                            emitted file; no localhost; automancer.uk always https;
                            no TODO/FIXME/lorem ipsum in the build
tests/a11y.test.ts          structural accessibility: landmarks, skip link,
                            labelled form controls, named buttons/links
tests/feeds.test.ts         sitemap exactness vs emitted pages, robots.txt,
                            llms.txt byte-parity with src/data/business.ts
                            (the anti-drift test), draft exclusion end to end
tests/agent-readiness.test.ts  the machine-readable surface: Markdown twins,
                            llms.txt, /api/*.json payloads, agent.json +
                            security.txt (both routes, byte-parity), feeds
tests/developer-surface.test.ts  the post-scan surface (2026-08-22): OpenAPI 3.1
                            spec validity + unique operationIds + payload/schema
                            conformance, /developers coverage vs api/index.json,
                            homepage link, llms.txt when-to-use guidance, 404
                            agent-recovery links, JSON-LD person/org completeness
tests/assets.test.ts        rot-guard: every file in public/assets/images must
                            be referenced somewhere in dist/ (this directory
                            collected dead og-image/logo variants before)
tests/performance.test.ts   byte budgets for every built page (one default,
                            declared exceptions only)
                            (total/js/fonts), derived from measured values —
                            method and tables live in docs/PERFORMANCE.md
tests/contact-errors.test.ts  lead-API error-copy guard: lifts the built contact
                            page's inline script out of dist/, runs it against
                            stub DOM + fetch, and drives the submit handler —
                            no machine code from the intake endpoint may reach
                            #form-error, on any branch, known code or not.
                            Negative control: 9ac5d96^ (the shipped defect)
```

Page categories (see `tests/support/dist.ts`):

- **content pages** — full layout, all guarantees apply (`contentPages()`);
- **404** (`dist/404.html`) — full layout, included in page checks;
- **redirect stubs** (`services.html/index.html` etc., from astro.config.mjs)
  — bare meta-refresh pages for old inbound links; exempt from SEO/a11y
  checks but their links are still verified by links.test.ts.

## Why axe-core isn't used

We tried. axe-core needs a real DOM environment (browser or jsdom) exposing
`window`/`document`; this suite parses static HTML with node-html-parser and
axe fails immediately against it. Rather than fake a pass, a11y.test.ts
asserts the structure by hand. The trade-off is deliberate: fast, dependency-
light tests that still catch missing labels, unnamed buttons, broken skip
links and lost landmarks.

## Adding a new assertion

1. Ask which guarantee it protects and which file owns that topic — keep
   page-metadata rules in `pages.test.ts`, references in `links.test.ts`,
   machine-readable outputs in `feeds.test.ts`, accessibility in
   `a11y.test.ts`, payload budgets in `performance.test.ts`.
2. Use the shared loaders instead of touching the filesystem directly:
   `contentPages()` / `allHtmlFiles()` give parsed pages; `resolveInDist()`
   answers "does this URL exist in the build?"; `readDistFile()` reads any
   emitted file.
3. Make failures name the page and the reason (follow the existing
   `` `${page.route}: …` `` message pattern) so a red CI run is actionable.
4. Prove the assertion can fail: break the thing it guards in `src/`,
   rebuild, watch the test go red, then restore. An assertion that has never
   failed is not yet a test.
