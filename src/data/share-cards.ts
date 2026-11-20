/**
 * What each share card says, and where it is served: one place, so the card
 * (src/pages/og/), the page that names it (og:image, twitter:image) and its
 * alt text cannot disagree. Every word comes from the entry's frontmatter,
 * which the page itself shows (src/lib/og-card.ts draws it).
 */
import type { CollectionEntry } from 'astro:content';
import type { CardInput } from '../lib/og-card';

export type CardCollection = 'field-notes' | 'work';

/** Root-relative URL of an entry's card. */
export const cardPath = (collection: CardCollection, id: string) => `/og/${collection}/${id}.png`;

// The date as the field note's own header prints it.
const longDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function fieldNoteCard(entry: CollectionEntry<'field-notes'>): CardInput {
  const d = entry.data;
  return { kind: 'Field note', label: d.category ?? d.sector, title: d.title, meta: `${longDate(d.date)} · ${d.author}` };
}

export function caseStudyCard(entry: CollectionEntry<'case-studies'>): CardInput {
  const d = entry.data;
  // The notes the case study's label carries, in its order.
  const notes = [d.anonymised && 'anonymised', d.status].filter((n): n is string => Boolean(n));
  return { kind: 'Case study', label: d.sector, title: d.headline ?? d.title, meta: capitalise(notes.join(' · ')) };
}

/** Alt text for a card: what it shows, in reading order. */
export const cardAlt = (c: CardInput) => `${c.kind}, ${c.label}: ${c.title}`;
