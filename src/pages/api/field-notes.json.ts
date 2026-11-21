// Every non-draft field note, with full body text (raw Markdown).
// Same collection filter/order as the /field-notes pages.
import type { APIRoute } from 'astro';
import { getNotes, abs } from '../../data/site-content';
import { build } from '../../data/build';
import { noteTopic, noteTopics } from '../../data/note-topics';

export const GET: APIRoute = async () => {
  const notes = await getNotes();
  const payload = {
    schemaVersion: '1.0',
    generatedAt: build.time.toISOString(),
    count: notes.length,
    topics: noteTopics(notes).map(({ label, slug, count, url, noteSlugs }) => ({ label, slug, count, url, noteSlugs })),
    fieldNotes: notes.map((e) => ({
      slug: e.id,
      title: e.data.title,
      description: e.data.description,
      url: abs(`/field-notes/${e.id}`),
      markdownUrl: abs(`/field-notes/${e.id}.md`),
      datePublished: e.data.date.toISOString(),
      author: e.data.author,
      category: noteTopic(e.data),
      tags: e.data.tags,
      body: e.body,
    })),
  };
  return new Response(JSON.stringify(payload, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
