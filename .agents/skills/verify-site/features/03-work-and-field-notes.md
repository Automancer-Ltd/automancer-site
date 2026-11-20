# 03 Case studies and field notes

**The journey.** A visitor opens `/work/` or `/field-notes/`, picks an entry, uses its "On this
page" contents to move through it and, on a note, carries on with "Keep reading".

**Reach it.** `/work/`, `/work/<slug>/`, `/field-notes/`, `/field-notes/<slug>/` (one page per
file in `src/content/`; the sitemap lists them all).

**Proved by:**

- `a field note's contents jump to each section and mark the one being read`.
- `a field note opens with its first line in view and ends with the next notes on its subject`.
- `a case study's contents list its sections and their parts, and follow the reader into a part`.
- `a case study's sector and notes read as whole lines, not ragged columns` and
  `a case study's figures never break inside a word, even with text at 200%`.
- `a shared page previews with its own card, not the generic image`.
- Vitest: `tests/related-notes.test.ts`, `tests/og-cards.test.ts`, `tests/feeds.test.ts` and the
  feed and twin checks in `tests/agent-readiness.test.ts` (every published entry, no drafts).

**End state.** Every published entry has its page, twin, feed item and share card, and drafts
have none.

**Gotchas.** Counts of notes and studies change with content: derive them from `src/content/` or
the sitemap, never write them into a check.
