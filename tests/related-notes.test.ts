/**
 * "Keep reading" at the end of every field note (src/data/related-notes.ts).
 *
 * A reader who finishes a note and has a next question should be offered the
 * notes on the same subject, never the note they just read, a draft, or a
 * dead link; and the list is navigation, so it must not count as the note's
 * words (adding or reordering notes would otherwise move every note's date).
 */
import { describe, expect, it } from 'vitest';
import { contentPages, type BuiltPage } from './support/dist';
import { RELATED_COUNT } from '../src/data/related-notes';

const notes = contentPages().filter((p) => /^\/field-notes\/[^/]+\/$/.test(p.route));
const byRoute = new Map(notes.map((p) => [p.route, p]));
// The topic label the note's header shows: date · topic (a link, unless "General") · author.
const topicOf = (page: BuiltPage) => page.doc.querySelectorAll('.article-meta > :not(.sep)')[1]?.text.trim() ?? '';
const offered = (page: BuiltPage) =>
  page.doc.querySelectorAll('nav[data-read-next] .note-list a').map((a) => a.getAttribute('href') ?? '');

describe('keep reading', () => {
  it('every field note offers other published notes, each once, as navigation', () => {
    expect(notes.length).toBeGreaterThan(RELATED_COUNT);
    for (const page of notes) {
      const nav = page.doc.querySelector('nav[data-read-next]');
      expect(nav, `${page.route}: no Keep reading`).not.toBeNull();
      expect(nav!.getAttribute('data-page-words'), `${page.route}: Keep reading counted as page words`).toBe('skip');
      const hrefs = offered(page);
      expect(hrefs, `${page.route}: offers ${hrefs.length} notes`).toHaveLength(RELATED_COUNT);
      expect(new Set(hrefs).size, `${page.route}: offers a note twice`).toBe(hrefs.length);
      for (const href of hrefs) {
        expect(href, `${page.route}: offers itself`).not.toBe(page.route);
        expect(byRoute.has(href), `${page.route}: offers ${href}, which is not a published note`).toBe(true);
      }
    }
  });

  it('offers a note on the same subject first, when there is one', () => {
    let checked = 0;
    for (const page of notes) {
      const topic = topicOf(page);
      const siblings = notes.filter((n) => n !== page && topicOf(n) === topic);
      if (topic === 'General' || siblings.length === 0) continue;
      checked++;
      expect(topicOf(byRoute.get(offered(page)[0])!), `${page.route} (${topic}) leads with another subject`).toBe(topic);
    }
    expect(checked).toBeGreaterThan(0);
  });
});
