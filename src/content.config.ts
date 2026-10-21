// Content collection schemas.
//
// Two collections back the site's long-form content:
//   - case-studies  -> rendered at /work/[slug]
//   - field-notes   -> rendered at /field-notes/[slug]
//
// Both are plain Markdown files with typed frontmatter, loaded from
// src/content/<collection>/*.md via the glob() loader (Content Layer API).

import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const sharedFrontmatter = {
  title: z.string(),
  description: z.string(),
  date: z.coerce.date(),
  sector: z.string(),
  tags: z.array(z.string()).default([]),
  // DRAFT entries are excluded from index pages and sitemap in production
  // builds, but remain reachable directly for internal review.
  draft: z.boolean().default(false),
};

const caseStudies = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/case-studies' }),
  schema: z.object({
    ...sharedFrontmatter,
    client: z.string().optional(),
    // Short home/index teaser line, separate from the SEO `description`.
    summary: z.string().optional(),
    // One-line machine-voice stat summary shown on the /work index card.
    statline: z.string().optional(),
    // Designed hero + stat band (rendered by /work/[slug], not the markdown body).
    headline: z.string().optional(),
    subhead: z.string().optional(),
    stats: z
      .array(z.object({ v: z.string(), l: z.string() }))
      .default([]),
    // All case studies ship anonymised until written client sign-off lands.
    anonymised: z.boolean().default(false),
    // Manual ordering on the /work index (lower = earlier). Falls back to date.
    order: z.number().optional(),
    // Delivery status badge, honest per the style guide (live / in build / signed off).
    status: z.string().optional(),
    // Whether this study gets the full-width feature card on /work.
    featured: z.boolean().default(false),
  }),
});

const fieldNotes = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/field-notes' }),
  schema: z.object({
    ...sharedFrontmatter,
    author: z.string().default('Waseem Ilyas'),
    // Short index teaser, separate from the SEO description.
    summary: z.string().optional(),
    // Sharp topical label shown on the index + article meta. Field notes are
    // topical, not client-sector-bound, so this — not `sector` — is the label
    // a reader sees; falls back to `sector` if a note omits it.
    category: z.string().optional(),
  }),
});

// CHANGELOG.md is the one record of what changed; /releases, its Markdown twin
// and /api/releases.json all read it through src/data/releases.ts. Loaded as a
// collection so its body goes through the same Markdown pipeline as the
// field notes. No front matter, so no schema.
const changelog = defineCollection({
  loader: glob({ pattern: 'CHANGELOG.md', base: '.' }),
});

export const collections = {
  'case-studies': caseStudies,
  'field-notes': fieldNotes,
  changelog,
};
