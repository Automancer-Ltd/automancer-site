/**
 * Aggregated site content for machine-readable outputs.
 *
 * Every JSON endpoint, Markdown twin, feed and llms-full.txt reads through
 * this module so they can never disagree with the HTML pages or each other.
 * Drafts are always excluded here — the mirrors are production surfaces.
 */
import { getCollection, type CollectionEntry } from 'astro:content';
import { formatGBP, serviceById } from './business';
import { contactHref } from './enquiry';
import { noteTopic, noteTopics } from './note-topics';
import { CLAIM_MENTIONS, SOURCES_ANCHOR, SOURCES_INTRO, evidenceAnchor, evidenceRows, publishedClaims, type ClaimId } from './claims';
import { abs, absHref, pagePath } from './urls';

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

/** The same subject links and counts in the Markdown index and agent guide. */
export function noteTopicLinks(notes: readonly FieldNote[]): string[] {
  return noteTopics(notes).map(({ label, url, count }) =>
    `- [${label}](${url}) (${count} ${count === 1 ? 'note' : 'notes'})`,
  );
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

/** The Audit button every case study and field note ends with, as a Markdown link. */
const auditLink = () =>
  `[Book an Audit — from ${formatGBP(serviceById('automation-opportunity-audit').priceFrom)}](${absHref(contactHref('automation-opportunity-audit'))})`;

/** Markdown twin of one case study: its page's words, the next study and the closing invitation included (t27008). */
export function studyMarkdown(entry: CaseStudy, next?: CaseStudy): string {
  const d = entry.data;
  const url = abs(`/work/${entry.id}`);
  const nextLine = next ? `Next case study: [${next.data.headline ?? next.data.title}](${abs(`/work/${next.id}/`)})\n\n` : '';
  return (
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
    }) + '\n' + studyText(entry) + '\n' + nextLine +
    `## Got a job like this?

Start with an Audit and we'll show you where automation will save time and money — with real numbers and a plain plan. We promise a meeting within one week of first contact.

${auditLink()}
`
  );
}

/** Case study with its headline figures and evidence, shared by the twin and the full guide. */
export function studyText(entry: CaseStudy): string {
  const d = entry.data;
  const url = abs(`/work/${entry.id}`);
  const sourced = evidenceRows(d);
  // Mirror the rendered page: the h1 shows the editorial headline
  // (`d.headline ?? d.title`), so it stays in the twin as the top heading.
  const notes = [d.anonymised && 'anonymised', d.status].filter((n): n is string => Boolean(n));
  const parts = [[d.sector, ...notes].join(' · '), '', `# ${d.headline ?? d.title}`, ''];
  if (d.subhead) parts.push(d.subhead, '');
  if (d.client) parts.push(`**Client:** ${d.client}`, '');
  if (sourced.length) parts.push(`[Where these numbers come from](${url}#${SOURCES_ANCHOR})`, '');
  if (d.stats.length > 0) {
    for (const stat of d.stats) {
      const source = stat.claims.length ? ` ([Source](${url}#${evidenceAnchor(stat.claims)}))` : '';
      parts.push(`- **${stat.v}** — ${stat.l}${source}`);
    }
    parts.push('');
  }
  parts.push(withAbsoluteEvidenceLinks(entry.body ?? ''));
  // The page's "Where these numbers come from", word for word (t23334), hero figures included (t23577).
  if (sourced.length > 0) {
    parts.push(
      '',
      '// sources',
      '',
      '## Where these numbers come from',
      '',
      SOURCES_INTRO,
      '',
      ...sourced.flatMap((s) => [`- [**${s.v}** ${s.l}](${url}#${s.anchor})`, ...s.quotes.map((q) => `  > “${q}”`)]),
      '',
      `The same lines, as data for agents: ${abs('/api/claims.json')}`,
      ''
    );
  }
  return parts.join('\n');
}

/** Evidence citations still resolve when the guide or twin is copied away from the site. */
function withAbsoluteEvidenceLinks(markdown: string): string {
  return markdown.replace(/\]\((\/work\/[\w-]+\/)#(sources|source-[\w-]+)\)/g,
    (_link, path: string, anchor: string) => `](${abs(path)}#${anchor})`);
}

/** A case study's evidence section, for a teaser that names its figures; null when it has none. */
export function studySourcesUrl(entry: CaseStudy): string | null {
  return evidenceRows(entry.data).length > 0 ? `${abs(`/work/${entry.id}`)}#${SOURCES_ANCHOR}` : null;
}

/**
 * Where a person reads the evidence behind each published claim: its line under "Where these
 * numbers come from" on the first case study that shows it (t23577). /api/claims.json publishes it,
 * so a machine and a person are pointed at the same line.
 */
export async function claimEvidenceUrls(): Promise<Map<ClaimId, string>> {
  const urls = new Map<ClaimId, string>();
  for (const study of await getStudies()) {
    for (const row of evidenceRows(study.data)) {
      for (const id of row.claims as ClaimId[]) if (!urls.has(id)) urls.set(id, `${abs(`/work/${study.id}`)}#${row.anchor}`);
    }
  }
  for (const claim of publishedClaims) {
    if (!urls.has(claim.id)) throw new Error(`Published claim "${claim.id}" is on no case study: name it in a study's stats or facts, or leave it out of src/data/claims.ts`);
  }
  return urls;
}

/**
 * The truth-layer claims a field note states, in the order a reader meets them (title,
 * description, then body), each with the line a person reads for it (t25645). Every one is linked
 * from the note itself: tests/figure-sources.test.ts fails a page that states a figure without
 * its evidence, so an agent quoting a note can cite the same line a reader can open.
 */
export function noteClaims(entry: FieldNote, urls: ReadonlyMap<ClaimId, string>): { id: ClaimId; evidenceUrl: string }[] {
  const text = [entry.data.title, entry.data.description, entry.body ?? ''].join('\n');
  return publishedClaims
    .map((claim) => ({ id: claim.id, at: text.search(CLAIM_MENTIONS[claim.id]) }))
    .filter((found) => found.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map(({ id }) => ({ id, evidenceUrl: urls.get(id)! }));
}

const longDate = (dt: Date) => dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/**
 * Markdown twin of one field note: front matter, then the page's words in its order: title,
 * description, date, subject and author, the body, the byline and the closing invitation (t27008).
 */
export function noteMarkdown(entry: FieldNote): string {
  const d = entry.data;
  const url = abs(`/field-notes/${entry.id}`);
  const head = `# ${d.title}\n\n${d.description}\n\n${longDate(d.date)} · ${noteTopic(d)} · ${d.author}\n\n`;
  const foot = `

Written by an Automancer agent · reviewed and published by ${d.author}. Agents do the work; a human makes the call.

## Sounds like your Tuesday?

Tell us what's eating your week. Waseem reads every enquiry himself.

${auditLink()}
`;
  return (
    frontMatter({
      title: d.title,
      description: d.description,
      url,
      canonical: url,
      type: 'BlogPosting',
      author: d.author,
      datePublished: iso(d.date),
    }) + head + noteText(entry).trimEnd() + foot
  );
}

export function noteText(entry: FieldNote): string {
  return withAbsoluteEvidenceLinks(entry.body ?? '');
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
    lastUpdated: '24 November 2026',
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
