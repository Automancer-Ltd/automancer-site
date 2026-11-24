# 03 Case studies and field notes

**The journey.** A visitor opens `/work/` or `/field-notes/`, picks an entry (on `/field-notes/`,
after narrowing the list to one subject), uses its "On this page" contents to move through it and,
on a note, carries on with "Keep reading" or follows its subject label to every note on it.

**Reach it.** `/work/`, `/work/<slug>/`, `/field-notes/`, `/field-notes/<slug>/` (one page per
file in `src/content/`; the sitemap lists them all).

**Proved by:**

- `Work lets visitors open any case study by sector from the first screen`, with JavaScript off.
- `a note's subject leads to every note on it, and the index narrows to one subject` and
  `with JavaScript off, the field notes › still narrow to one subject`.
- `a field note's contents jump to each section and mark the one being read`.
- `a field note opens with its first line in view and ends with the next notes on its subject`.
- `a case study's contents list its sections and their parts, and follow the reader into a part`.
- `a case study's sector and notes read as whole lines, not ragged columns` and
  `a case study's figures never break inside a word, even with text at 200%`.
- `a shared page previews with its own card, not the generic image`.
- `a case study figure's Source link lands on the line of evidence behind it`,
  `a field note's figure lands on the case study's line of evidence for it (t23577)` and
  `a case card opens its study from anywhere on it, and its Sources link opens the evidence (t23577)`.
- Vitest: `tests/note-topics.test.ts` (one button per subject, counts, CSS slots, each note's
  subject link), `tests/related-notes.test.ts`, `tests/og-cards.test.ts`, `tests/feeds.test.ts` and the
  feed and twin checks in `tests/agent-readiness.test.ts` (every published entry, no drafts), and
  `tests/figure-sources.test.ts` (every registered figure on every page links to its evidence).

**End state.** Every published entry has its page, twin, feed item and share card, and drafts
have none.

**Gotchas.** Counts of notes and studies change with content: derive them from `src/content/` or
the sitemap, never write them into a check.
