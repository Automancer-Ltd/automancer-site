// Every non-draft case study, with full body text (raw Markdown).
// Same collection filter/order as the /work pages.
import type { APIRoute } from 'astro';
import { getStudies, abs } from '../../data/site-content';
import { build } from '../../data/build';

export const GET: APIRoute = async () => {
  const studies = await getStudies();
  const payload = {
    schemaVersion: '1.0',
    generatedAt: build.time.toISOString(),
    count: studies.length,
    note: 'All case studies are anonymised at launch until written client sign-off; every fact is taken from real delivered work.',
    caseStudies: studies.map((e) => ({
      slug: e.id,
      title: e.data.title,
      headline: e.data.headline,
      description: e.data.description,
      url: abs(`/work/${e.id}`),
      markdownUrl: abs(`/work/${e.id}.md`),
      datePublished: e.data.date.toISOString(),
      sector: e.data.sector,
      tags: e.data.tags,
      status: e.data.status,
      stats: e.data.stats.map((s) => ({ value: s.v, label: s.l })),
      body: e.body,
    })),
  };
  return new Response(JSON.stringify(payload, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
