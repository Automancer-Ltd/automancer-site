# 04 About, privacy and terms

**The journey.** A visitor checks who runs the company (`/about/`) and reads the privacy notice
and terms, which promise that the site stores nothing in their browser.

**Reach it.** `/about/`, `/privacy/`, `/terms/` (footer links).

**Proved by:**

- Vitest: `tests/legal-integrity.test.ts` (the legal wording is hash-pinned to its "Last updated"
  date; it changes only on Waseem's instruction), `tests/no-browser-storage.test.ts` and
  `tests/storage-sentinel.test.ts` (no page script writes cookies, local or session storage, or
  IndexedDB), and the legal no-mirror checks in `tests/agent-readiness.test.ts` (no twin, feed or
  payload repeats a legal sentence).
- `every page keeps its words on screen at 320px and with text at 200%` covers all three pages.

**End state.** The pages state the company facts from `business.ts`, the legal pages have no
Markdown twin, and the browser stores nothing.

**Gotchas.** `/privacy/` and `/terms/` are `legalNoMirror`: never add them to a machine surface.
