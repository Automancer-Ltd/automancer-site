---
name: verify-site
description: End-to-end browser and HTTP verification for automancer-site (automancer.uk). Builds and serves the production static output locally, drives every page and user journey in agent-browser at desktop (1280x800) and mobile (390x844) widths, checks links, metadata, contact form validation, zero browser storage, and machine-readable endpoints, captures screenshots, and cleans up all servers and browser sessions.
---

# verify-site

End-to-end verification skill for `Automancer-Ltd/automancer-site` (`https://automancer.uk`).

Run the automated driver for local build + preview + desktop & mobile browser journeys:

```bash
.agents/skills/verify-site/scripts/verify-local.sh
```

Or point the production verifier at live `https://automancer.uk` after a deploy:

```bash
ops/verify-production.sh --expected-revision "$(git rev-parse origin/main)" https://automancer.uk
```

## Feature Map

Every user journey and surface is specified under [`.agents/skills/verify-site/features/`](features/):

- [`01-home-and-navigation.md`](features/01-home-and-navigation.md) — Homepage (`/`), proof strip, 4-rung service ladder, desktop nav, mobile hamburger menu drawer (`390x844`), and `/404`.
- [`02-services-and-pricing.md`](features/02-services-and-pricing.md) — `/services/` overview table, all 4 anchored offer sections (`#audit`, `#sprint`, `#build`, `#support`), GBP from-prices matching `src/data/business.ts`, and CTA links.
- [`03-work-and-field-notes.md`](features/03-work-and-field-notes.md) — `/work/` index, all 4 case-study pages (`/work/<slug>/`), `/field-notes/` index, and field-note articles (`/field-notes/<slug>/`), including `.md` twin routes and feed discovery links.
- [`04-about-and-legal.md`](features/04-about-and-legal.md) — `/about/` company facts (`17060907`), `/privacy/` (`23 August 2026`), `/terms/` (`3 July 2026`), legal no-mirror enforcement, and runtime zero-storage check (`localStorage`, `sessionStorage`, `document.cookie`).
- [`05-contact-and-intake-safety.md`](features/05-contact-and-intake-safety.md) — `/contact/` form fields, direct `mailto:`/`tel:` fallbacks, client-side validation (`#name` and `#email` focus + `aria-invalid="true"` with zero network leak to `ENDPOINT_URL`), and `window.onTurnstileError()` human fallback copy.
- [`06-developer-and-agent-surfaces.md`](features/06-developer-and-agent-surfaces.md) — `/developers/`, `/llms.txt`, `/llms-full.txt`, `/agent.json`, `/security.txt`, `/openapi.json`, `/api/*.json`, RSS/JSON feeds, and Markdown twins (`/*.md`).

---

## 1. Launch

1. Build the production static output in `dist/` (unless `SKIP_BUILD=1` and `dist/index.html` is already fresh):
   ```bash
   checkq -- pnpm run build
   ```
2. Pick a free loopback port (e.g. `4321` or ephemeral via `python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()'`) and start Astro's static preview server bound to `127.0.0.1`:
   ```bash
   pnpm exec astro preview --host 127.0.0.1 --port "$PORT" >/tmp/verify-site-preview.log 2>&1 &
   PREVIEW_PID=$!
   ```
3. Always register an `EXIT INT TERM` trap before driving the browser so both the preview server and the dedicated `agent-browser` session are closed on exit.

## 2. Doctor

Before driving user journeys, confirm:

1. `command -v agent-browser`, `command -v curl`, and `command -v jq` succeed.
2. `dist/index.html` and `dist/agent.json` exist on disk.
3. `curl -fsS -o /dev/null "http://127.0.0.1:$PORT/"` and `curl -fsS -o /dev/null "http://127.0.0.1:$PORT/agent.json"` return HTTP 200 within 15 seconds.
4. `agent-browser --session "$SESSION" open "http://127.0.0.1:$PORT/"` succeeds with a unique session name (`verify-site-$$`).

## 3. Drive

`.agents/skills/verify-site/scripts/verify-local.sh` executes every journey in [`features/`](features/):

1. **Desktop pass (`1280x800`):**
   - Visits `/`, `/services/`, `/work/`, `/work/care-provider-transformation/`, `/field-notes/`, `/field-notes/what-does-an-ai-agent-actually-cost/`, `/about/`, `/contact/`, `/developers/`, `/privacy/`, `/terms/`, and `/404`.
   - Asserts `<title>`, `<meta name="description">`, `<link rel="canonical">`, single `<h1>`, landmarks (`header`, `main#main`, `footer`), JSON-LD `@graph`, and zero first-party browser storage (`localStorage.length === 0 && sessionStorage.length === 0 && document.cookie === ""`).
   - Exercises `/contact/` validation (`empty name` -> `#form-error` text `"Please add your name."`, `#name[aria-invalid="true"]`, activeElement `name`; `empty email` -> `#email[aria-invalid="true"]`, activeElement `email`; `window.onTurnstileError()` -> human fallback naming `waseem@automancer.uk`) without posting test spam to the live Cloudflare Worker.
   - Captures desktop screenshots for visual inspection.
2. **Mobile pass (`390x844`):**
   - Resizes viewport to `390x844`, verifies no horizontal overflow (`document.documentElement.scrollWidth <= window.innerWidth`) across key pages (`/`, `/services/`, `/work/`, `/field-notes/`, `/about/`, `/contact/`, `/developers/`, `/privacy/`, `/terms/`).
   - Drives the mobile hamburger drawer (`.hamburger` click -> `.mobile-menu.is-open` and `aria-expanded="true"` -> `Escape` closes drawer and restores `aria-expanded="false"`).
   - Captures mobile screenshots (including open mobile menu drawer and mobile pages).
3. **Machine-surface HTTP audit:**
   - Queries `/llms.txt`, `/llms-full.txt`, `/agent.json`, `/security.txt`, `/openapi.json`, `/api/index.json`, `/api/business.json`, `/api/services.json`, `/api/case-studies.json`, `/api/field-notes.json`, `/api/pages.json`, `/work/rss.xml`, `/work/feed.json`, `/field-notes/rss.xml`, `/field-notes/feed.json`, and all static `.md` twins against the preview server.

## 4. Evidence

1. `.agents/skills/verify-site/scripts/verify-local.sh` writes screenshots and `summary.json` into `EVIDENCE_DIR` (default `/tmp/verify-site-evidence`).
2. **Always inspect screenshots** using `view_file` on the generated `.png` files in `$EVIDENCE_DIR` to verify visual hierarchy, contrast, spacing, and mobile responsiveness.

## 5. Cleanup

The script's `EXIT` trap automatically runs:

```bash
agent-browser --session "$SESSION" close >/dev/null 2>&1 || true
kill "$PREVIEW_PID" >/dev/null 2>&1 || true
wait "$PREVIEW_PID" >/dev/null 2>&1 || true
```

And verifies that `$PORT` is no longer listening before exiting.
