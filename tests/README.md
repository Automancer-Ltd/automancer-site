# Test suite

Vitest audits the **production build output** (`dist/`), the bytes GitHub Pages
serves, not the source templates. `tests/global-setup.ts` runs `pnpm run build`
once per invocation (skip it with `SKIP_BUILD=1` when `dist/` is fresh); each test
file's header says what it guards.

```sh
pnpm run verify        # what CI and the deploy run: lint, typecheck, build + audit
pnpm run test          # build + audit only
```

Shared loaders live in `tests/support/`: `contentPages()` / `allHtmlFiles()` give
parsed pages, `resolveInDist()` answers "does this URL exist in the build?",
`readDistFile()` reads any emitted file. `node tests/support/perf-cli.ts` prints the
page-weight tables that `docs/PERFORMANCE.md` derives its budgets from.

Page categories (`tests/support/dist.ts`):

- **content pages** (`contentPages()`): full layout, every page check applies;
- **404** (`dist/404.html`): full layout, but outside `contentPages()`, so only the
  checks that read `allHtmlFiles()` see it;
- **redirect stubs** (`services.html` etc., from `astro.config.mjs`): bare
  meta-refresh pages, exempt from SEO/a11y checks; links.test.ts still resolves them.

A new assertion names the user-visible failure it catches, goes in the file that
owns that topic, and is shown red once (break `src/`, rebuild, watch it fail,
restore) before it is trusted.
