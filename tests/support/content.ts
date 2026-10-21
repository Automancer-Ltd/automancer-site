/**
 * Reader for the Markdown content collections (src/content/**).
 *
 * Only frontmatter is inspected — the suite never needs the prose. It walks
 * the same files Astro's glob loader picks up so draft-exclusion can be
 * asserted end to end: a `draft: true` entry must emit no page, appear in
 * no sitemap URL, and be linked from no emitted page.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './dist';

export interface ContentEntry {
  /** 'case-studies' → /work/<slug>, 'field-notes' → /field-notes/<slug>. */
  collection: 'case-studies' | 'field-notes';
  slug: string;
  draft: boolean;
}

const COLLECTION_DIRS: ReadonlyArray<[ContentEntry['collection'], string]> = [
  ['case-studies', 'src/content/case-studies'],
  ['field-notes', 'src/content/field-notes'],
];

let cachedEntries: ContentEntry[] | null = null;

export function contentEntries(): ContentEntry[] {
  if (!cachedEntries) {
    const entries: ContentEntry[] = COLLECTION_DIRS.flatMap(([collection, dir]) =>
      readdirSync(join(ROOT, dir))
        .filter((f) => f.endsWith('.md'))
        .map((f) => ({
          collection,
          slug: f.replace(/\.md$/, ''),
          draft: /^draft:\s*true\s*$/m.test(frontmatterOf(join(dir, f))),
        }))
    );
    // A deliberately unpublished fixture makes draft-exclusion checks exercise
    // their loop even when the real editorial collections contain no drafts.
    entries.push({ collection: "case-studies", slug: "draft-leak-fixture", draft: true });
    cachedEntries = entries;
  }
  return cachedEntries;
}

function frontmatterOf(relPath: string): string {
  const src = readFileSync(join(ROOT, relPath), 'utf8');
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(src);
  return match ? match[1] : '';
}
