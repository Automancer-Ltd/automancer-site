/**
 * "Browse by subject" on /field-notes/ (src/data/note-topics.ts), and each
 * note's subject label linking to it.
 *
 * A visitor with one question should reach every note on that subject in one
 * tap, with scripts on or off: each button's count must be the notes it
 * leaves showing, every subject a note page links to must be a button, and
 * the CSS must hold a rule for every numbered subject. The buttons are
 * navigation, so they must not count as the page's words (page dates).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT, SITE_URL, contentPages, readDistFile } from './support/dist';
import { TOPIC_SLOTS, UNSPECIFIC_TOPICS, topicSlug } from '../src/data/note-topics';

const pages = contentPages();
const index = pages.find((p) => p.route === '/field-notes/');
const notes = pages.filter((p) => /^\/field-notes\/[^/]+\/$/.test(p.route));
const rows = () => index!.doc.querySelectorAll('.note-list > a.note-row');
const rowTopic = (row: ReturnType<typeof rows>[number]) => row.querySelector('.note-row__meta')!.text.split('·')[1]!.trim();
const picks = () => index!.doc.querySelectorAll('[data-note-filter] input[name="topic"]');

describe('browse field notes by subject', () => {
  it('has a CSS rule for every subject slot', () => {
    const css = readFileSync(join(ROOT, 'src/styles/note-filter.css'), 'utf8');
    const slots = [...css.matchAll(/\[data-topic-pick="(\d+)"\]:checked\) \.note-row:not\(\[data-topic-slot="(\d+)"\]\)/g)];
    expect(slots.map((m) => [Number(m[1]), Number(m[2])])).toEqual(
      Array.from({ length: TOPIC_SLOTS }, (_, i) => [i + 1, i + 1]),
    );
  });

  it('offers one button per subject the notes show, each counting the notes it leaves', () => {
    expect(index, '/field-notes/ was not built').toBeTruthy();
    const filter = index!.doc.querySelector('fieldset[data-note-filter]');
    expect(filter?.getAttribute('data-page-words'), 'the subject buttons count as page words').toBe('skip');

    const all = picks()[0]!;
    expect(all.getAttribute('id')).toBe('pick-all');
    expect(all.hasAttribute('checked'), '"All" is not picked on arrival').toBe(true);
    expect(all.getAttribute('aria-label')).toBe(`All, ${rows().length} notes`);

    const buttons = picks().slice(1).map((input) => ({
      id: input.getAttribute('id'),
      slot: Number(input.getAttribute('data-topic-pick')),
      count: Number(input.getAttribute('data-count')),
      label: input.nextElementSibling!.text.trim(),
      name: input.getAttribute('aria-label'),
    }));
    const labels = [...new Set(rows().map(rowTopic).filter((label) => !UNSPECIFIC_TOPICS.has(label)))];
    expect(buttons.map((b) => b.label).sort()).toEqual(labels.sort());
    expect(buttons.map((b) => b.count)).toEqual(buttons.map((b) => b.count).sort((a, b) => b - a));
    expect(buttons.length).toBeGreaterThan(1);

    for (const b of buttons) {
      expect(b.id).toBe(`pick-${topicSlug(b.label)}`);
      expect(b.name).toBe(`${b.label}, ${b.count} ${b.count === 1 ? 'note' : 'notes'}`);
      const shown = rows().filter((r) => r.getAttribute('data-topic-slot') === String(b.slot));
      expect(shown.length, `${b.label} counts ${b.count} but leaves ${shown.length} notes`).toBe(b.count);
      expect(shown.every((r) => rowTopic(r) === b.label), `${b.label} leaves a note on another subject`).toBe(true);
    }
    for (const r of rows()) {
      const topic = rowTopic(r);
      if (UNSPECIFIC_TOPICS.has(topic)) expect(r.hasAttribute('data-topic-slot'), `${topic} note is filtered as a subject`).toBe(false);
      else expect(r.getAttribute('data-topic-slot'), `${r.getAttribute('href')} belongs to no button`).toBeTruthy();
    }
  });

  it("links each note's subject to the index, filtered to it", () => {
    const ids = new Set(picks().map((i) => i.getAttribute('id')));
    let linked = 0;
    for (const page of notes) {
      const meta = page.doc.querySelectorAll('.article-meta > :not(.sep)');
      const topic = meta[1]!.text.trim();
      const link = page.doc.querySelector('.article-meta a.article-topic');
      if (UNSPECIFIC_TOPICS.has(topic)) {
        expect(link, `${page.route}: links "${topic}", which is no subject`).toBeNull();
        continue;
      }
      linked++;
      expect(link?.text.trim(), `${page.route}: its subject is not a link`).toBe(topic);
      const href = link!.getAttribute('href')!;
      expect(href).toBe(`/field-notes/#topic-${topicSlug(topic)}`);
      expect(ids.has(`pick-${href.split('#topic-')[1]!}`), `${page.route}: ${href} names no button`).toBe(true);
    }
    expect(linked).toBeGreaterThan(0);
  });

  it('lets agents find the same subjects and notes as readers', () => {
    const payload = JSON.parse(readDistFile('api/field-notes.json')!) as {
      topics: Array<{ label: string; slug: string; count: number; url: string; noteSlugs: string[] }>;
      fieldNotes: Array<{ slug: string; url: string; markdownUrl: string; category: string }>;
    };
    const twin = readDistFile('field-notes.md')!;
    const guide = readDistFile('llms.txt')!;
    const buttons = picks().slice(1);

    expect(payload.topics).toEqual(buttons.map((input) => ({
      label: input.nextElementSibling!.text.trim(),
      slug: input.getAttribute('value'),
      count: Number(input.getAttribute('data-count')),
      url: `${SITE_URL}/field-notes/#topic-${input.getAttribute('value')}`,
      noteSlugs: rows().filter((row) => row.getAttribute('data-topic-slot') === input.getAttribute('data-topic-pick'))
        .map((row) => row.getAttribute('href')!.split('/')[2]),
    })));

    for (const { label, count, url, noteSlugs } of payload.topics) {
      const link = `[${label}](${url}) (${count} ${count === 1 ? 'note' : 'notes'})`;
      expect(twin).toContain(link);
      expect(guide).toContain(link);
      expect(payload.fieldNotes.filter((note) => note.category === label).map((note) => note.slug)).toEqual(noteSlugs);
    }

    const listed = new Map(rows().map((row) => [new URL(row.getAttribute('href')!, SITE_URL).href, rowTopic(row)]));
    expect(payload.fieldNotes.map(({ url, category }) => [url, category])).toEqual([...listed]);
    for (const { url, markdownUrl, category } of payload.fieldNotes) {
      const line = twin.split('\n').find((line) => line.includes(`](${url})`));
      expect(line, `${url}: no entry in the Markdown index`).toContain(`· ${category}`);
      expect(line, `${url}: no direct link to the note's Markdown`).toContain(`](${markdownUrl})`);
    }
  });
});
