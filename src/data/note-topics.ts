/**
 * The subjects a visitor can pick on /field-notes/ ("Browse by subject").
 *
 * A note's subject is the topic label its page already shows (category,
 * falling back to sector), so the filter invents no label. "General" means no
 * particular subject: it gets no button, and its notes show under "All".
 *
 * The filter works with scripts off: each subject takes a numbered slot, and
 * src/styles/note-filter.css holds one rule per slot (TOPIC_SLOTS of them). A
 * subject beyond the last slot would show a button that filters nothing, so
 * the build stops instead. Pure, so the page and tests/note-topics.test.ts
 * agree on every subject, slug and count.
 */
import { business } from './business';

const topicPath = (slug: string): string => `/field-notes/#topic-${slug}`;

/** Rules in src/styles/note-filter.css; tests/note-topics.test.ts holds them equal. */
export const TOPIC_SLOTS = 24;

/** Topic labels that name no particular subject. */
export const UNSPECIFIC_TOPICS: ReadonlySet<string> = new Set(['General']);

/** The label a note's page shows as its subject. */
export const noteTopic = (data: { category?: string | undefined; sector: string }): string => data.category ?? data.sector;

/** "Social care" -> "social-care"; the address is /field-notes/#topic-<slug>. */
export const topicSlug = (label: string): string =>
  label.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Where a note's subject label links: the index, filtered to that subject. */
export const topicHref = (label: string): string | undefined =>
  UNSPECIFIC_TOPICS.has(label) ? undefined : topicPath(topicSlug(label));

export interface NoteTopic {
  label: string;
  slug: string;
  count: number;
  url: string;
  noteSlugs: string[];
  /** 1-based; matches data-topic-slot on the button and its notes. */
  slot: number;
}

/** Every specific subject, most notes first, then by name. */
export function noteTopics(notes: readonly { id: string; data: Parameters<typeof noteTopic>[0] }[]): NoteTopic[] {
  const members = new Map<string, string[]>();
  for (const { id, data } of notes) {
    const label = noteTopic(data);
    if (UNSPECIFIC_TOPICS.has(label)) continue;
    const slugs = members.get(label);
    if (slugs) slugs.push(id);
    else members.set(label, [id]);
  }
  const topics = [...members]
    .sort(([a, x], [b, y]) => y.length - x.length || a.localeCompare(b))
    .map(([label, noteSlugs], i) => {
      const slug = topicSlug(label);
      return {
        label,
        slug,
        count: noteSlugs.length,
        url: new URL(topicPath(slug), business.url).href,
        noteSlugs,
        slot: i + 1,
      };
    });
  if (topics.length > TOPIC_SLOTS) {
    throw new Error(
      `${topics.length} field-note subjects, but src/styles/note-filter.css filters only ${TOPIC_SLOTS}: add rules there and raise TOPIC_SLOTS`,
    );
  }
  const slugs = new Set(topics.map((t) => t.slug));
  if (slugs.size !== topics.length) throw new Error('Two field-note subjects share one address: rename one label');
  return topics;
}
