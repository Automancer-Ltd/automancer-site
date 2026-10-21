// /llms-full.txt — the whole site's text in one plain-text file, each
// section headed with its canonical URL.
//
// Sources are the same single modules every other surface uses:
//   - hand-authored pages: static-markdown.ts (facts from business.ts)
//   - case studies + field notes: the collection entries themselves
//     (via feeds.ts item builders) so full text can never drift
//   - legal/compliance pages: metadata + canonical link ONLY — their bodies
//     are deliberately not mirrored anywhere (see docs/AGENT-READINESS.md).
import type { APIRoute } from 'astro';
import { business } from '../data/business';
import { build } from '../data/build';
import { abs } from '../data/urls';
import { getStudies, getNotes, staticPages } from '../data/site-content';
import { staticBodies } from '../data/static-markdown';

const RULE = '='.repeat(72);
const THIN = '-'.repeat(72);

export const GET: APIRoute = async () => {
  const sections: string[] = [];

  const pushSection = (path: string, title: string, description: string | undefined, body: string) => {
    const head = [
      `URL: ${abs(path)}`,
      `Title: ${title}`,
      ...(description ? [`Description: ${description}`] : []),
    ].join('\n');
    sections.push(`${RULE}\n${head}\n${THIN}\n\n${body.trim()}\n`);
  };

  // Hand-authored pages first (home → services → about → contact),
  // then collection indexes and entries.
  const staticOrder = ['/', '/services/', '/about/', '/contact/', '/work/', '/field-notes/'];
  for (const path of staticOrder) {
    const meta = staticPages.find((p) => p.path === path);
    if (!meta) continue;
    const body = await staticBodies[path]();
    pushSection(path, meta.title, meta.description, body);
  }

  // Case studies, index order; field notes, newest first. Bodies come
  // straight from the collection entries.
  const [studies, notes] = await Promise.all([getStudies(), getNotes()]);
  for (const e of studies) {
    const parts: string[] = [`# ${e.data.headline ?? e.data.title}`, ''];
    if (e.data.subhead) parts.push(e.data.subhead, '');
    if (e.data.stats.length > 0) parts.push(...e.data.stats.map((s) => `- **${s.v}** — ${s.l}`), '');
    parts.push(e.body ?? '');
    pushSection(`/work/${e.id}`, e.data.title, e.data.description, parts.join('\n'));
  }
  for (const e of notes) {
    pushSection(`/field-notes/${e.id}`, e.data.title, e.data.description, e.body ?? '');
  }

  // Legal pages: pointer-only, never transcribed bodies.
  const legal = staticPages.filter((p) => p.type === 'PrivacyPolicy' || p.path === '/terms/');
  const legalSection = [
    RULE,
    'Legal / compliance pages',
    THIN,
    '',
    'The bodies of these pages are deliberately NOT mirrored in this file or in',
    'any other machine-readable format — a transcribed copy drifts silently from',
    "the canonical HTML and could republish a superseded notice. Fetch each page's",
    'canonical URL for its current, authoritative text.',
    '',
    ...legal.map(
      (p) =>
        `URL: ${abs(p.path)}\nTitle: ${p.title}${p.lastUpdated ? `\nLast updated: ${p.lastUpdated}` : ''}`
    ),
    '',
  ].join('\n');

  const header = [
    `# ${business.tradingName} — complete site text`,
    '',
    business.description,
    '',
    `Generated: ${build.time.toISOString()}${build.commit ? ` from commit ${build.commit}` : ''}`,
    `Guide: ${business.url}/llms.txt (short index — start there)`,
    'Format: one section per page, each headed with its canonical URL.',
    'Every page is also available as standalone Markdown at its URL plus ".md"',
    '(e.g. https://automancer.uk/about.md), and as JSON via /api/index.json.',
    '',
  ].join('\n');

  const out = `${header}\n${sections.join('\n')}\n${legalSection}`;
  return new Response(out, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
