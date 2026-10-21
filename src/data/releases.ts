/**
 * Releases, read from CHANGELOG.md — the single source for /releases, its
 * Markdown twin and /api/releases.json, so the three cannot disagree.
 *
 * Every `## ` heading in the file must be a release heading
 * (`## vYYYY.MM.DD.N — D Month YYYY`). Anything else fails the build rather
 * than publishing a release with the wrong shape.
 */
import { getEntry } from 'astro:content';
import { abs } from './urls';

export interface Release {
  /** Stable id, e.g. "v2026.10.20.1"; also the anchor on /releases. */
  version: string;
  /** ISO date (YYYY-MM-DD), read from the version. */
  date: string;
  /** The date as the changelog writes it, e.g. "20 October 2026". */
  displayDate: string;
  /** The release's opening paragraph. */
  summary: string;
  /** The release notes as Markdown (everything under the heading). */
  notes: string;
  /** The release notes rendered to HTML by the site's Markdown pipeline. */
  html: string;
  /** Canonical URL of this release on /releases. */
  url: string;
}

const HEADING = /^(v(\d{4})\.(\d{2})\.(\d{2})\.\d+) — (\d{1,2} [A-Z][a-z]+ \d{4})$/;

export async function getReleases(): Promise<Release[]> {
  const entry = await getEntry('changelog', 'changelog');
  if (!entry?.body || !entry.rendered) throw new Error('CHANGELOG.md was not loaded');
  const sections = entry.body.split(/^## /m).slice(1);
  // The rendered HTML is split at the same headings, so section i of each is
  // the same release.
  const rendered = entry.rendered.html.split(/<h2\b[^>]*>/).slice(1);
  if (sections.length !== rendered.length) {
    throw new Error(`CHANGELOG.md: ${sections.length} release headings but ${rendered.length} rendered`);
  }
  return sections.map((section, i) => {
    const [heading = '', ...rest] = section.split('\n');
    const m = heading.trim().match(HEADING);
    if (!m) throw new Error(`CHANGELOG.md: "## ${heading}" is not a release heading (## vYYYY.MM.DD.N — D Month YYYY)`);
    const [, version, y, mo, d, displayDate] = m;
    const notes = rest.join('\n').trim();
    const summary = notes.split(/\n\s*\n/)[0]!.trim();
    if (!summary || summary.startsWith('#')) throw new Error(`CHANGELOG.md: ${version} has no opening paragraph`);
    return {
      version: version!,
      date: `${y}-${mo}-${d}`,
      displayDate: displayDate!,
      summary,
      notes,
      html: rendered[i]!.slice(rendered[i]!.indexOf('</h2>') + '</h2>'.length).trim(),
      url: `${abs('/releases/')}#${version}`,
    };
  });
}
