/**
 * /releases as a timeline (t23438): months, then days, then each release.
 *
 * Each release's URL in /api/releases.json is /releases/#<version>, a
 * published identifier: grouping the page must keep every one of them landing
 * on its release, once, in the changelog's order, under the right day.
 */
import { describe, expect, it } from 'vitest';
import { contentPages, readDistFile } from './support/dist';

const page = contentPages().find((p) => p.route === '/releases/');
const api = JSON.parse(readDistFile('api/releases.json')!) as {
  releases: { version: string; date: string; url: string }[];
};

describe('/releases timeline', () => {
  it('has one release block per published release, in order, at its published anchor', () => {
    expect(page, '/releases/ was not built').toBeTruthy();
    const blocks = page!.doc.querySelectorAll('article.rel').map((a) => a.id);
    expect(blocks).toEqual(api.releases.map((r) => r.version));
    for (const r of api.releases) expect(new URL(r.url).hash).toBe(`#${r.version}`);
  });

  it('files each release under its own day and month', () => {
    for (const article of page!.doc.querySelectorAll('article.rel')) {
      const date = api.releases.find((r) => r.version === article.id)!.date;
      const day = article.closest('.rel-day');
      const month = article.closest('.rel-month');
      expect(day?.querySelector('h3 time')?.getAttribute('datetime')).toBe(date);
      expect(month?.querySelector('h2')?.id).toBe(date.slice(0, 7));
    }
  });
});
