/**
 * People and machines read the same words (t27008). VISION.md: "What a machine is told never
 * differs from what a person is shown", and the two views "can never disagree, because neither is
 * allowed to say what the other cannot".
 *
 * Every page with a Markdown twin is read both ways:
 * - every sentence a person reads in the page's <main> is in its twin;
 * - every sentence of the twin's body is on the page.
 *
 * Words are compared, not formatting: case, quote marks, dashes, Markdown syntax, link targets and
 * the spacing between elements are set aside. Navigation is not the page's words: <nav>, the
 * elements marked data-page-words="skip" (a note's contents list and "Keep reading", the field-notes
 * filter, as in src/integrations/page-dates.ts), and anything aria-hidden (decorative numbering).
 * Each exception below names the passage, how often it occurs and why the other view goes without
 * it, so no new sentence can hide behind one.
 */
import { describe, expect, it } from 'vitest';
import { parse, type HTMLElement as ParsedElement } from 'node-html-parser';
import { allHtmlFiles, readDistFile, resolveInDist, SITE_HOST, type BuiltPage } from './support/dist';
import { SERVICE_OPTIONS, SERVICE_PARAM } from '../src/data/enquiry';

/** Elements whose end starts a new block of text, so words in neighbouring cards never run together. */
const BLOCK = new Set([
  'address', 'article', 'aside', 'blockquote', 'br', 'dd', 'details', 'div', 'dl', 'dt', 'fieldset', 'figcaption', 'figure',
  'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'label', 'legend', 'li', 'ol', 'p', 'section', 'summary',
  'table', 'td', 'th', 'tr', 'ul',
]);

/**
 * The words a person reads in `main`, one block per line. With `all`, navigation and the labels
 * of button-styled links too: a twin may name where to go next, but need not.
 */
function pageBlocks(main: ParsedElement, { all = false } = {}): string {
  const walk = (el: ParsedElement): string =>
    el.childNodes
      .map((n) => {
        if (n.nodeType === 3) return n.text;
        if (n.nodeType !== 1) return '';
        const child = n as ParsedElement;
        const tag = child.rawTagName?.toLowerCase() ?? '';
        if (['script', 'style', 'template', 'svg', 'noscript'].includes(tag)) return '';
        if (child.getAttribute('aria-hidden') === 'true') return '';
        // Shown later (the form once its script runs, its confirmation once sent): a twin may say it, need not.
        if (!all && (child.hasAttribute('hidden') || /display:\s*none/.test(child.getAttribute('style') ?? ''))) return '';
        if (!all && (tag === 'nav' || child.getAttribute('data-page-words') === 'skip')) return '';
        // A button-styled link is where to go next, not what the page says (its from-price is held
        // by tests/agent-readiness.test.ts), and so is an arrow link ("Read the note →") and a case
        // card's link to its sources.
        const cls = ` ${child.getAttribute('class') ?? ''} `;
        if (!all && ((tag === 'a' && (/\s(btn|case-card__src)\s/.test(cls) || /→\s*$/.test(child.text))) || cls.includes(' arrow-link '))) return '\n';
        const words = walk(child);
        return BLOCK.has(tag) ? `\n${words}\n` : ` ${words} `;
      })
      .join('');
  return walk(main).replace(/[ \t]+([.,;:!?)])/g, '$1');
}

/** The twin's words: its front matter's values and its body, without Markdown syntax or link targets. */
function twinWords(md: string): { front: string; body: string } {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(md);
  const front = (fm?.[1] ?? '')
    .split('\n')
    .map((l) => l.replace(/^[\w-]+:\s*/, '').replace(/^"|"$/g, ''))
    .join('\n');
  const body = md
    .slice(fm?.[0].length ?? 0)
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // [words](url) → words
    .replace(/<https?:[^>]+>/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ') // a comment is not shown
    // A subject's "(2 notes)" is the count the field-notes page shows on that subject's button.
    .replace(/\((\d+) notes?\)/g, '$1')
    // One block per line: a heading, a list item or a paragraph (whose wrapped lines join up).
    .split(/\n\s*\n|\n(?=\s{0,3}(?:#{1,6}\s|[-*+]\s|\d+\.\s|>))/)
    .map((block) =>
      block
        .replace(/^\s{0,3}#{1,6}\s+/, '') // heading
        .replace(/^\s*(?:[-*+]|\d+\.)\s+/, '') // list marker
        .replace(/^\s*>\s?/gm, '') // quote
        .replace(/\n/g, ' ')
    )
    .join('\n')
    .replace(/[*`]|(?<!\w)_+|_+(?!\w)/g, ''); // emphasis and code marks, not the _ inside a word
  return { front, body };
}

/** One spelling for the things that are formatting, not words. */
export function norm(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/ | /g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** The sentences of a text, block by block. A single word on its own ("Sources", "All") is a label, not a sentence. */
export function sentences(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((block) => norm(block).split(/(?<=[.!?:])\s+(?=[^a-z0-9]*[a-z0-9])/))
    .map((s) => s.replace(/[.!?:;,]+$/, '').trim())
    .filter((s) => s.split(' ').length >= 2);
}

/** Only the words and figures, in order: punctuation and the spacing between elements set aside. */
export const words = (text: string): string => ` ${norm(text).replace(/[^\p{L}\p{N}£%]+/gu, ' ').trim()} `;

/**
 * A sentence is in a text when its words are, in order. A line of short labels joined by a
 * separator ("13 July 2026 · Operations · Waseem Ilyas", "v2026.11.26.1 — 26 November 2026") is
 * laid out differently in each view, so it is there when each label is. `haystack` is words().
 */
export function contains(haystack: string, sentence: string): boolean {
  if (haystack.includes(words(sentence))) return true;
  const parts = sentence.split(/\s*[·|→:]\s*|\s+-\s+/).map((p) => p.trim()).filter(Boolean);
  return parts.length > 1 && parts.every((p) => p.split(' ').length <= 6 && haystack.includes(words(p)));
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
/** A twin dates things as ISO 8601 (front matter) where its page writes "13 July 2026": both spellings count. */
const longDates = (text: string): string =>
  [...text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)]
    .flatMap(([, y, m, d]) => {
      const month = MONTHS[Number(m) - 1]!;
      const short = month === 'september' ? 'sept' : month.slice(0, 3);
      return [`${Number(d)} ${month} ${y}`, `${d} ${short} ${y}`, `${Number(d)} ${short} ${y}`];
    })
    .join(' · ');

/** A named exception: a sentence one view leaves out, how many times, and why. */
type Named = [passage: RegExp, times: number, why: string];

/** Sentences on the page that its twin leaves out on purpose. */
const PAGE_ONLY: Record<string, Named[]> = {
  '/contact/': [[/^please email .* to get in touch$/, 1, 'shown only where the form cannot run; the twin gives the same address as a route']],
};

/** Sentences in a twin that its page does not show, on purpose. */
const TWIN_ONLY: Record<string, Named[]> = {
  '/contact/': [
    [/^agents - use email$/, 1, 'tells an agent how to act on the page: the form needs a browser'],
    [/^the form needs a browser; a plain email reaches the same human$/, 1, 'the same, for agents'],
    [/^the routes, the form's fields and limits, and an email template .* are published as data at /, 1, 'points an agent at /api/enquiry.json, the form as data'],
    [/^the form is at https:\/\/automancer\.uk\/contact\/$/, 1, 'where the form a person sees is'],
  ],
  '/field-notes/': [[/^all notes$/, 1, 'the list\'s heading: the page lists the notes under its subject buttons']],
  '/work/': [[/^each case study is also available as clean markdown at its url plus \.md$/, 1, 'where the machine copy of each study is']],
};

function twinOf(page: BuiltPage): string | null {
  const href = page.doc.querySelector('link[rel="alternate"][type="text/markdown"]')?.getAttribute('href');
  if (!href) return null;
  return readDistFile(new URL(href).pathname.slice(1));
}

/** The sentences of `from` that `into` does not contain, less the named exceptions (which must each match exactly `times`). */
function missing(route: string, from: string[], into: string, named: readonly Named[]): string[] {
  const used = new Map<Named, number>();
  const out: string[] = [];
  for (const s of from) {
    if (contains(into, s)) continue;
    const hit = named.find(([p]) => p.test(s));
    if (hit) used.set(hit, (used.get(hit) ?? 0) + 1);
    else out.push(`${route}: “${s}”`);
  }
  for (const n of named) if ((used.get(n) ?? 0) !== n[1]) out.push(`${route}: exception ${n[0]} matched ${used.get(n) ?? 0} times, named ${n[1]} (${n[2]})`);
  return out;
}

const pages = allHtmlFiles()
  .filter((p) => !p.isRedirectStub && !p.is404)
  .map((page) => ({ page, twin: twinOf(page) }))
  .filter((p): p is { page: BuiltPage; twin: string } => p.twin !== null);

const views = pages.map(({ page, twin }) => {
  const main = page.doc.querySelector('main');
  expect(main, `${page.route} has no <main>`).toBeTruthy();
  const { front, body } = twinWords(twin);
  return {
    route: page.route,
    pageSentences: sentences(pageBlocks(main!)),
    pageAll: words(pageBlocks(main!, { all: true })),
    twinSentences: sentences(body),
    twinAll: words(`${front}\n${longDates(`${front}\n${body}`)}\n${body}`),
  };
});

describe('the parity check (it is looking at something)', () => {
  it('finds a sentence one view has and the other lacks, and ignores formatting', () => {
    const page = sentences(pageBlocks(parse('<main><h1>We’re in Bradford — UK-wide.</h1><p>We publish prices. <a href="/x">Every one</a> of them, today.</p><nav><p>Read the next note now please</p></nav></main>').querySelector('main')!));
    expect(page).toEqual(["we're in bradford - uk-wide", 'we publish prices', 'every one of them, today']);
    const { body } = twinWords('---\ntitle: "T"\n---\n# We\'re in Bradford -- no\n\nWe publish *prices*. [Every one](https://x) of _them_, today.<!-- not shown -->\n');
    expect(missing('t', page, words(body), [])).toEqual(['t: “we\'re in bradford - uk-wide”']);
    expect(sentences(body)).not.toContain('not shown');
  });

  it('reads every page that has a twin', () => {
    expect(pages.length).toBeGreaterThanOrEqual(29);
    for (const v of views) expect(v.pageSentences.length, `${v.route} shows no sentences`).toBeGreaterThan(3);
  });
});

describe('every page and its Markdown twin say the same things', () => {
  it('every sentence a person reads is in the twin', () => {
    const gaps = views.flatMap((v) => missing(v.route, v.pageSentences, v.twinAll, PAGE_ONLY[v.route] ?? []));
    expect(gaps, `the twin leaves out what its page says: add it to the twin (src/data/static-markdown.ts or the entry), or name it in PAGE_ONLY with why:\n${gaps.join('\n')}`).toEqual([]);
  });

  it('every sentence in a twin is on its page', () => {
    const gaps = views.flatMap((v) => missing(v.route, v.twinSentences, v.pageAll, TWIN_ONLY[v.route] ?? []));
    expect(gaps, `the twin says what its page does not: take it out, put it on the page, or name it in TWIN_ONLY with why:\n${gaps.join('\n')}`).toEqual([]);
  });

  it('every link in a twin leads to a page or file the site serves, and to its section there', () => {
    // A link the page's script reads (#service=<offer>, #topic-…) names no element; any other fragment does.
    const byFile = new Map(allHtmlFiles().map((p) => [p.file, p]));
    const broken: string[] = [];
    for (const { page, twin } of pages) {
      for (const [, href] of twin.matchAll(/\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g)) {
        const url = new URL(href!, 'https://automancer.uk');
        if (url.host !== SITE_HOST) continue;
        const file = resolveInDist(page.file, href!);
        if (!file) { broken.push(`${page.route}: ${href} serves nothing`); continue; }
        const id = decodeURIComponent(url.hash.slice(1));
        if (id.startsWith(`${SERVICE_PARAM}=`)) {
          if (!SERVICE_OPTIONS.some((o) => `${SERVICE_PARAM}=${o.value}` === id)) broken.push(`${page.route}: ${href} names no service`);
          continue;
        }
        if (!id || id.startsWith('topic-')) continue;
        if (!byFile.get(file)?.doc.getElementById(id)) broken.push(`${page.route}: ${href} names no element on ${file}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('names no exception for a page without a twin', () => {
    const routes = new Set(views.map((v) => v.route));
    for (const route of [...Object.keys(PAGE_ONLY), ...Object.keys(TWIN_ONLY)]) expect(routes, route).toContain(route);
  });
});
