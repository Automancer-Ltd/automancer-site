/**
 * Aggregated site content for machine-readable outputs.
 *
 * Every JSON endpoint, Markdown twin, feed and llms-full.txt reads through
 * this module so they can never disagree with the HTML pages or each other.
 * Drafts are always excluded here — the mirrors are production surfaces.
 */
import { getCollection, type CollectionEntry } from 'astro:content';
import { formatGBP, serviceById } from './business';
import { abs, pagePath } from './urls';

export { abs };
export type CaseStudy = CollectionEntry<'case-studies'>;
export type FieldNote = CollectionEntry<'field-notes'>;

/** Non-draft case studies, index order (matches /work). */
export async function getStudies(): Promise<CaseStudy[]> {
  const all = await getCollection('case-studies');
  return all
    .filter((e) => !e.data.draft)
    .sort((a, b) => (a.data.order ?? 99) - (b.data.order ?? 99));
}

/** Non-draft field notes, newest first (matches /field-notes). */
export async function getNotes(): Promise<FieldNote[]> {
  const all = await getCollection('field-notes');
  return all.filter((e) => !e.data.draft).sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

const iso = (d: Date) => d.toISOString();

export function frontMatter(fields: Record<string, string | undefined>): string {
  const lines = ['---'];
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) lines.push(`${k}: ${JSON.stringify(v)}`);
  }
  lines.push('---', '');
  return lines.join('\n');
}

/** A text/markdown response with explicit charset. */
export function mdResponse(markdown: string): Response {
  return new Response(markdown, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
}

/** Markdown twin of one case study: front matter + hero facts + full body. */
export function studyMarkdown(entry: CaseStudy): string {
  const d = entry.data;
  const url = abs(`/work/${entry.id}`);
  const parts = [
    frontMatter({
      // The page <title> derives from fitTitle(d.title) — the twin's
      // front-matter title must be that same string (unfitted), not the
      // display headline, or the twin and its page disagree.
      title: d.title,
      description: d.description,
      url,
      canonical: url,
      type: 'CaseStudy',
      datePublished: iso(d.date),
    }),
  ];
  // Mirror the rendered page: the h1 shows the editorial headline
  // (`d.headline ?? d.title`), so it stays in the twin as the top heading.
  parts.push(`# ${d.headline ?? d.title}`, '');
  if (d.subhead) parts.push(d.subhead, '');
  if (d.stats.length > 0) {
    parts.push(...d.stats.map((s) => `- **${s.v}** — ${s.l}`), '');
  }
  parts.push(entry.body ?? '');
  return parts.join('\n');
}

/** Markdown twin of one field note: front matter + full body. */
export function noteMarkdown(entry: FieldNote): string {
  const d = entry.data;
  const url = abs(`/field-notes/${entry.id}`);
  return (
    frontMatter({
      title: d.title,
      description: d.description,
      url,
      canonical: url,
      type: 'BlogPosting',
      author: d.author,
      datePublished: iso(d.date),
    }) + (entry.body ?? '')
  );
}

/** Registry of every hand-authored page — used by /api/pages.json, llms-full.txt and the .md twin decision. */
export interface PageMeta {
  path: string;
  title: string;
  description: string;
  type: string;
  /** "Last updated" date shown on the page, where one is published. */
  lastUpdated?: string;
  /**
   * For legal/compliance pages: their body text is deliberately NOT mirrored
   * anywhere machine-readable (transcription drifts silently — a real
   * liability). We publish only these facts plus a link to the canonical HTML.
   */
  legalNoMirror?: true;
}

// Descriptions mirror the exact <meta name="description"> each page emits
// (the BaseLayout props in the corresponding .astro file). From-prices are
// rendered from business.ts so the meta description, pages.json and the
// visible page cannot quote different numbers.
const auditPrice = formatGBP(serviceById('automation-opportunity-audit').priceFrom);
const sprintPrice = formatGBP(serviceById('workflow-implementation-sprint').priceFrom);
const buildPrice = formatGBP(serviceById('system-agent-build').priceFrom);
const opsPrice = formatGBP(serviceById('ai-ops-partner').priceFrom);

export const staticPages: PageMeta[] = [
  { path: '/', title: 'AI & automation for UK small businesses', description: `We make small businesses run like magic. It's not magic. It's very good engineering. AI and workflow automation from Automancer — audits from ${auditPrice}.`, type: 'WebPage' },
  { path: '/services/', title: 'Services & pricing', description: `Four ways to work with us, with real from-prices. Audit from ${auditPrice}, Workflow Sprint from ${sprintPrice}, System Build from ${buildPrice}, AI Ops Partner from ${opsPrice}/mo.`, type: 'CollectionPage' },
  { path: '/work/', title: 'Work', description: 'Real systems, live in production. Case studies from a care provider, a manufacturer, a diversity & inclusion consultancy and small firms — all real work.', type: 'CollectionPage' },
  { path: '/field-notes/', title: 'Field Notes', description: "Dispatches from an AI-run business. Written by the agents, decided by the human. Plain notes on what actually works when you point AI at boring problems.", type: 'CollectionPage' },
  { path: '/about/', title: 'About', description: "An AI-run consultancy with a human at the helm. Automancer's finance, project tracking and website run on agents — every decision taken by Waseem, in Bradford.", type: 'AboutPage' },
  { path: '/contact/', title: 'Contact', description: "Tell us what's eating your week. No calendar gauntlet, no chatbot. Waseem reads it himself, and we promise a meeting within one week of first contact.", type: 'ContactPage' },
  { path: '/releases/', title: 'Release notes', description: 'Every change to the Automancer website, newest first, from the same changelog we keep for ourselves. Also published as JSON at /api/releases.json.', type: 'CollectionPage' },
  {
    path: '/privacy/',
    title: 'Privacy Policy',
    description: 'How Automancer Ltd handles your data — in plain English. What we collect, why, where it lives, who touches it, and the rights you have over it.',
    type: 'PrivacyPolicy',
    // Single source for the date shown on /privacy itself; imported there.
    lastUpdated: '23 August 2026',
    legalNoMirror: true,
  },
  {
    path: '/terms/',
    title: 'Website Terms',
    description: 'Website terms of use for Automancer Ltd — how you may use this site, our liability position, and the intellectual property in it.',
    type: 'WebPage',
    // Derived 2026-08-30: git log -1 --format=%cs -- src/pages/terms.astro
    // is 2026-08-21, but that commit only lengthened the meta description.
    // The terms body has been unchanged since 2026-07-03 (1f74245). The
    // published date is the substance date, matching /privacy/.
    lastUpdated: '3 July 2026',
    legalNoMirror: true,
  },
];

/** Markdown twin path for a static page, or null where none is emitted. */
export function markdownTwinPath(path: string): string | null {
  const meta = staticPages.find((p) => pagePath(p.path) === pagePath(path));
  if (!meta || meta.legalNoMirror) return null;
  return meta.path === '/' ? abs('/index.md') : abs(`${meta.path.replace(/\/$/, '')}.md`);
}
