// /work/<slug>.md — Markdown twin of one case study.
//
// The body is derived from the collection entry itself (studyMarkdown in
// site-content.ts) — never retyped — so it cannot drift from the HTML page.
import type { APIRoute } from 'astro';
import { studyMarkdown, getStudies, mdResponse } from '../../data/site-content';

export async function getStaticPaths() {
  // Same draft filtering as work/[slug].astro: drafts never ship to production.
  const studies = await getStudies();
  // The next study is the one the page offers after it: the same order, wrapping round.
  return studies.map((entry, i) => ({ params: { slug: entry.id }, props: { entry, next: studies[(i + 1) % studies.length] } }));
}

export const GET: APIRoute = ({ props }) => mdResponse(studyMarkdown(props.entry, props.next));
