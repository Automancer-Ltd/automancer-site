// Each field note's share card (src/lib/og-card.ts), built as a static PNG.
import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection, type CollectionEntry } from 'astro:content';
import { renderCard } from '../../../lib/og-card';
import { fieldNoteCard } from '../../../data/share-cards';

export const getStaticPaths = (async () => {
  const isProd = import.meta.env.PROD;
  const posts = (await getCollection('field-notes')).filter((e) => !(isProd && e.data.draft));
  return posts.map((entry) => ({ params: { slug: entry.id }, props: { entry } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) => {
  const png = await renderCard(fieldNoteCard((props as { entry: CollectionEntry<'field-notes'> }).entry));
  return new Response(png, { headers: { 'Content-Type': 'image/png' } });
};
