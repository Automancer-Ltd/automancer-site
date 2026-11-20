// Each hand-authored page's share card (src/data/share-cards.ts pageCards), built as a static PNG.
import type { APIRoute, GetStaticPaths } from 'astro';
import { renderCard } from '../../../lib/og-card';
import { pageCards, type PageCard } from '../../../data/share-cards';

export const getStaticPaths = (async () =>
  (await pageCards()).map((page) => ({ params: { name: page.name }, props: { page } }))) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) => {
  const png = await renderCard((props as { page: PageCard }).page.card);
  return new Response(png, { headers: { 'Content-Type': 'image/png' } });
};
