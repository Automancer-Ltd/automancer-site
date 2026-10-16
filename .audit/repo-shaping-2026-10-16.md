# Repo-Shaping Audit & Evidence — `Automancer-Ltd/automancer-site` (2026-10-16)

- **Repository:** `Automancer-Ltd/automancer-site` (`https://automancer.uk`)
- **Baseline commit:** `280edba07bfca0be314705e1a0f830c0929a2eb1`
- **Chair thread:** `thr_udhvmk292b`

---

## 1. Score Table (`repo-shape-score.py` Floor + Judged Items)

| Section | Baseline (`280edba`) | Final | Max | Evidence |
|---|---:|---:|---:|---|
| **Language** (`tsgo` + `oxlint --type-aware` + strict TS + LSP) | 4 | 15 | 15 | `@typescript/native-preview` (`tsgo --noEmit`), `oxlint --type-aware --deny-warnings`, `"strict": true` in `tsconfig.json`, `typescript-language-server --stdio` verified |
| **Agents** (`AGENTS.md`, `GLOSSARY.md`, `VISION.md`, `SPEC.md`, `docs/adr/`) | 0 | 15 | 15 | Root `AGENTS.md` (7,418 B <= 8,000 B), root `GLOSSARY.md` (17 domain terms + forbidden synonyms), `VISION.md` untouched, `SPEC.md`, `docs/adr/0001-static-agent-surfaces-and-legal-no-mirror.md` |
| **Design** (single-owner modules + reader-load traces) | 5 | 20 | 20 | `10/10` floor (`src/` layout, max file 417 lines, `check` wired) + `10/10` judged (3 fresh-reader traces all `<= 30s`, documented in §6) |
| **Verify** (unit/integration + `verify-site` browser skill + red proof) | 12 | 20 | 20 | `15/15` floor (`.agents/skills/verify-site/SKILL.md` + 6 `features/*.md` + `scripts/verify-local.sh` + 14 Vitest files) + `5/5` judged (red proof in §5) |
| **CI** (single `checks` job, branch protection, deploy waits for CI) | 13 | 18 | 18 | `15/15` floor (`ci.yml` single job `checks`, timeout 10m, concurrency cancel-in-progress, frozen lockfile) + `3/3` judged (`main` branch protection + `deploy.yml` waits for `checks` on `$GITHUB_SHA`) |
| **Guards** (freshness + drift assertions) | 0 | 12 | 12 | `tests/agent-readiness.test.ts` (`STATIC_TWIN_ROUTES` derived from `src/pages/*.md.ts`, `/api/pages.json` vs `contentPages()`), `tests/feeds.test.ts`, `tests/developer-surface.test.ts`, `tests/legal-integrity.test.ts` |
| **Scriptable floor subtotal** | **34** | **82** | **82** | `python3 -I /opt/automancer/auto/scripts/repo-shape-score.py .` |
| **Evidenced judged items subtotal** | **0** | **18** | **18** | Design (`+10`), Verify (`+5`), CI (`+3`) |
| **Total** | **34** | **100** | **100** | Exceeds `90/100` campaign bar |

---

## 2. Check & Test Speed (`checkq`)

| Command | Baseline (`280edba`) | After Shaping | Notes |
|---|---:|---:|---|
| `checkq -- pnpm run check` | `42.483s` | `5.606s` | Baseline only ran `astro check`. Shaped `check` runs `oxlint --type-aware --deny-warnings` (`0.76s`), `tsgo --noEmit` (`0.9s`), and all 14 Vitest files (156 tests) against `dist/` with `isolate: false` and `fsModuleCache: true` (`1.93s`) — **7.6× faster** while adding type-aware linting and 156 tests. |
| `checkq -- pnpm run test` | `20.233s` | `15.207s` | Fresh `astro build` (`globalSetup: tests/setup-build.ts`) + all 14 Vitest files (156 tests). |

---

## 3. CI & GitHub Pages Deploy Gating

### Diagnosis on Baseline (`280edba`)
1. **Did `deploy.yml` wait for CI (`checks`) on the same commit?** **No.** `.github/workflows/deploy.yml` triggered on `push: branches: [main]` and built/deployed immediately to GitHub Pages in parallel with any checks.
2. **Did `ci.yml` run on `main` pushes?** **No.** `.github/workflows/ci.yml` only had `on: [pull_request]`, so squash-merge commits on `main` never had a `checks` check-run at all.
3. **Was `main` branch-protected?** **No.** `gh api repos/Automancer-Ltd/automancer-site/branches/main/protection` returned `404 Branch not protected`.

### Fixes Shipped (PR #71)
1. `.github/workflows/ci.yml` now triggers on both `pull_request` and `push: branches: [main]`, keeping a single job named `checks` (`timeout-minutes: 10`, `concurrency` with `cancel-in-progress: ${{ github.event_name == 'pull_request' }}`) that runs `pnpm run check` and `pnpm run test`.
2. `.github/workflows/deploy.yml` now includes a `Wait for CI checks on this commit` step before building that polls `repos/$GITHUB_REPOSITORY/commits/$GITHUB_SHA/check-runs?check_name=checks` until `status == "completed"` and fails immediately if `conclusion != "success"`.
3. Enabled GitHub branch protection on `main` requiring status check `checks` (`strict: false`).

---

## 4. `verify-site` End-to-End Browser Verification

- **Skill location:** [`.agents/skills/verify-site/SKILL.md`](../.agents/skills/verify-site/SKILL.md)
- **Feature specs:** [`.agents/skills/verify-site/features/01-home-and-navigation.md`](../.agents/skills/verify-site/features/01-home-and-navigation.md) through [`06-developer-and-agent-surfaces.md`](../.agents/skills/verify-site/features/06-developer-and-agent-surfaces.md)
- **Driver:** [`.agents/skills/verify-site/scripts/verify-local.sh`](../.agents/skills/verify-site/scripts/verify-local.sh)
- **Committed JSON evidence:** [`.audit/verify-site-summary.json`](verify-site-summary.json) (`status: "passed"`, `session: "verify-site-1735063"`, `baseUrl: "http://127.0.0.1:44957"`), independently re-run by Reviewer subagent `b15d226c-ed2d-4a94-bd9c-85c95b2a1fed` (`timestamp: "2026-10-16T03:48:14Z"`, `session: "verify-site-1800353"`, `baseUrl: "http://127.0.0.1:60201"`, `status: "passed"`).
- **Coverage executed & screenshots inspected:**
  - **Desktop (`1280x800`):** Visited `/`, `/services/`, `/work/`, `/work/care-provider-transformation/`, `/field-notes/`, `/field-notes/what-does-an-ai-agent-actually-cost/`, `/about/`, `/privacy/`, `/terms/`, `/contact/`, `/developers/`, and `/404`. Verified single `<h1>`, canonical URLs, 4-rung service ladder (`£450`, `£1,950`, `£4,500`, `£495`), company registration (`17060907`), legal dates (`23 August 2026`, `3 July 2026`), zero browser storage (`localStorage.length + sessionStorage.length + document.cookie.length === 0`), and `/contact/` client-side validation (`#name` and `#email` focus + `aria-invalid="true"`, plus `window.onTurnstileError()` email fallback).
  - **Mobile (`390x844`):** Verified zero horizontal overflow (`scrollWidth <= innerWidth`) across `/`, `/services/`, `/work/`, `/field-notes/`, `/about/`, `/contact/`, `/developers/`, `/privacy/`, `/terms/`, and exercised the mobile hamburger drawer (`.hamburger` click -> `.mobile-menu.is-open` + `aria-expanded="true"` -> `.mobile-menu__close` click -> closed + `aria-expanded="false"`).
  - **Machine-readable surfaces:** Verified HTTP 200 on 25 endpoints (`/llms.txt`, `/llms-full.txt`, `/agent.json`, `/.well-known/agent.json`, `/security.txt`, `/.well-known/security.txt`, `/openapi.json`, `/api/*.json`, RSS/JSON feeds, and static/collection `.md` twins) and HTTP 404 on `/privacy.md` and `/terms.md` (`legalNoMirror` policy).

---

## 5. Red Proof (`Verify +5`)

### 5a. Browser Verifier Red Proof (`verify-local.sh`)
Deliberately mutated the published `Workflow Sprint` price in `dist/services/index.html` from `£1,950` to `£9,999` and ran `SKIP_BUILD=1 .agents/skills/verify-site/scripts/verify-local.sh`:

```text
[1/5] Launch: ensuring production build in dist/...
[2/5] Doctor: checking dependencies, dist/, preview port 53833, and agent-browser...
[3/5] Drive (Desktop 1280x800): exercising features 01–06...
[agent-browser] launched browser
ASSERTION FAILED (services offer prices): expected '["£450","£1,950","£4,500","£495"]', got '["£450","£9,999","£4,500","£495"]'
VERIFY_LOCAL_RED_EXIT=1
```

Restored `dist/services/index.html` and re-ran `verify-local.sh` -> exited `0` (`status: "passed"`).

### 5b. Fast Gate Red Proof (`checkq -- pnpm run check`)
Deliberately renamed `turnstile_failed` to `turnstile_broken_key` in `LEAD_ERROR_COPY` (`src/config/site.ts`) and ran `checkq -- pnpm run check`:

```text
 FAIL  tests/contact-errors.test.ts > the built contact page never shows a lead-API machine code > replays the shipped incident: a failed security check shows the human sentence, never "turnstile_failed"
AssertionError: expected 'The security check did not go through…' to be undefined // Object.is equality
 ❯ tests/contact-errors.test.ts:288:19

 FAIL  tests/contact-errors.test.ts > the built contact page never shows a lead-API machine code > maps every allowlisted code to its own human sentence on every error branch that carries one
AssertionError: HTTP 400 carrying "turnstile_broken_key": the visitor saw "Something in the form needs a second look." instead of the map's sentence
 ❯ tests/contact-errors.test.ts:303:11
CHECK_RED_EXIT=1
```

Restored `src/config/site.ts` (`git checkout -- src/config/site.ts`) and re-ran `checkq -- pnpm run check` -> 14 test files (156 tests) passed (`exit 0`).

---

## 6. Timed Fresh-Reader Load Traces (`Design +10`)

Three fresh `research` subagents started cold at `AGENTS.md` without grepping the repository:

| # | Question | Files Opened (in order) | Lines Read | Elapsed Time | Result |
|---|---|---|---:|---:|---|
| 1 | **Where does a page's text come from?** | `AGENTS.md` (75), `src/data/site-content.ts` (159), `src/data/static-markdown.ts` (286), `src/data/business.ts` (106) | 626 lines (4 files) | **25s** (`<= 30s`) | Identified `src/content/{case-studies,field-notes}/*.md` + `getStudies()`/`getNotes()`/`studyMarkdown()`/`noteMarkdown()` for collection pages; `src/pages/*.astro` + `staticPages` (`src/data/site-content.ts`) + `staticBodies`/`twinRoute()` (`src/data/static-markdown.ts`) for static pages; `business` & `services` (`src/data/business.ts`) for shared facts and prices. |
| 2 | **How is a new page added?** | `AGENTS.md` (75), `src/content.config.ts` (69), `src/data/site-content.ts` (159), `src/data/static-markdown.ts` (286) | 589 lines (4 files) | **27s** (`<= 30s`) | Identified collection path (`src/content/{case-studies,field-notes}/<slug>.md` validated by `src/content.config.ts`) and 4-step static page path (`src/pages/<slug>.astro`, `staticPages` in `src/data/site-content.ts`, `staticBodies` + `src/pages/<slug>.md.ts` via `twinRoute()` unless `legalNoMirror: true`, and `ROUTES` in `ops/verify-production.sh`). |
| 3 | **How does the contact path work?** | `AGENTS.md` (75), `src/config/site.ts` (87), `src/pages/contact.astro` (352) | 514 lines (3 files) | **23s** (`<= 30s`) | Identified `#contact-form` fields, `FIELD_LIMITS`, `failField()` focus/scroll/`aria-invalid="true"`/`aria-describedby="form-error"` before network, `fetch(ENDPOINT_URL)` (`https://api.automancer.uk/api/lead`) with `AbortSignal.timeout(15_000)`, `copyFor()` allowlist translation via `LEAD_ERROR_COPY`/`LEAD_ERROR_FALLBACK`, and `window.onTurnstileError` + `waseem@automancer.uk` / `tel:+447451261333` fallbacks. |
