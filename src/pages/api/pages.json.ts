// Every page this site emits — static pages plus content-collection pages.
import type { APIRoute } from 'astro';
import { staticPages, getStudies, getNotes, markdownTwinPath } from '../../data/site-content';
import { abs } from '../../data/urls';
import { build } from '../../data/build';

// lastUpdated is written for people ("23 August 2026"); openapi.json declares
// lastModified a date-time, so it is converted here, the one place it is published.
function isoDate(display: string): string {
  const t = Date.parse(`${display} UTC`);
  if (Number.isNaN(t)) throw new Error(`staticPages lastUpdated "${display}" is not a date`);
  return new Date(t).toISOString();
}

export const GET: APIRoute = async () => {
  const [studies, notes] = await Promise.all([getStudies(), getNotes()]);

  const pages = [
    ...staticPages.map((p) => ({
      url: abs(p.path),
      title: p.title,
      description: p.description,
      // Legal/compliance pages deliberately have no Markdown twin; null
      // where no twin is emitted.
      markdownUrl: markdownTwinPath(p.path),
      type: p.type,
      lastModified: p.lastUpdated ? isoDate(p.lastUpdated) : build.time.toISOString(),
    })),
    ...studies.map((e) => ({
      url: abs(`/work/${e.id}`),
      title: e.data.headline ?? e.data.title,
      description: e.data.description,
      markdownUrl: abs(`/work/${e.id}.md`),
      type: 'CaseStudy',
      lastModified: e.data.date.toISOString(),
    })),
    ...notes.map((e) => ({
      url: abs(`/field-notes/${e.id}`),
      title: e.data.title,
      description: e.data.description,
      markdownUrl: abs(`/field-notes/${e.id}.md`),
      type: 'BlogPosting',
      lastModified: e.data.date.toISOString(),
    })),
  ];

  const payload = {
    schemaVersion: '1.0',
    generatedAt: build.time.toISOString(),
    count: pages.length,
    pages,
  };
  return new Response(JSON.stringify(payload, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
