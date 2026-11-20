// Each case study's share card (src/lib/og-card.ts), built as a static PNG.
import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection, type CollectionEntry } from 'astro:content';
import { renderCard } from '../../../lib/og-card';
import { caseStudyCard } from '../../../data/share-cards';

export const getStaticPaths = (async () => {
  const isProd = import.meta.env.PROD;
  const studies = (await getCollection('case-studies')).filter((e) => !(isProd && e.data.draft));
  return studies.map((entry) => ({ params: { slug: entry.id }, props: { entry } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) => {
  const png = await renderCard(caseStudyCard((props as { entry: CollectionEntry<'case-studies'> }).entry));
  return new Response(png, { headers: { 'Content-Type': 'image/png' } });
};
