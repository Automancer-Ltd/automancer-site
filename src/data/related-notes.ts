/**
 * Which field notes a note offers next ("Keep reading", /field-notes/<slug>/).
 *
 * A visitor usually arrives on one note with one question. When they finish,
 * the notes most likely to answer the next question are the ones on the same
 * subject: the same topic label, then the most tags in common. A tag most
 * notes carry ("small-business") says nothing about a pair, so tags on more
 * than a quarter of the notes are not counted. Ties go to the newer note, and
 * a note with nothing in common still gets the newest notes, so every note
 * offers the same number.
 *
 * Pure, so the page and tests/related-notes.test.ts rank the same way.
 */

export interface RelatableNote {
  id: string;
  /** The topic label the page shows (category, falling back to sector). */
  topic: string;
  tags: readonly string[];
  date: Date;
}

/** How many notes each note offers. */
export const RELATED_COUNT = 3;

// A topic that means "no particular subject" relates nothing.
const UNSPECIFIC_TOPICS = new Set(['General']);

export function relatedNotes<T extends RelatableNote>(note: T, all: readonly T[], count = RELATED_COUNT): T[] {
  const tagUse = new Map<string, number>();
  for (const n of all) for (const t of new Set(n.tags)) tagUse.set(t, (tagUse.get(t) ?? 0) + 1);
  const telling = (t: string) => (tagUse.get(t) ?? 0) <= all.length / 4;
  const own = new Set(note.tags.filter(telling));

  const score = (n: T) =>
    (n.topic === note.topic && !UNSPECIFIC_TOPICS.has(n.topic) ? 3 : 0) +
    n.tags.filter((t) => own.has(t)).length;

  return all
    .filter((n) => n.id !== note.id)
    .map((n) => ({ n, s: score(n) }))
    .sort((a, b) => b.s - a.s || b.n.date.valueOf() - a.n.date.valueOf() || a.n.id.localeCompare(b.n.id))
    .slice(0, count)
    .map(({ n }) => n);
}
