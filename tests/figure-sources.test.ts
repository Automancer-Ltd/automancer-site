/**
 * Every truth-layer figure a person reads links to the evidence behind it (t23577).
 *
 * The case studies' headline figures (294 carers, 588 supervisions, £300–400 → £10–80 ...) are
 * repeated on the home page, /work/, /services/, /about/ and in field notes. /api/claims.json
 * gives a machine the evidence line behind each one; a person must be able to reach the same line
 * from wherever the figure is shown, not only from the case study's stat band. So: wherever a
 * page's <main> states a figure the claims registry backs, the paragraph, list item, stat or card
 * it sits in links to that claim's line under "Where these numbers come from", or to the study's
 * evidence section. Three things also count:
 *   - a teaser row (a field-notes list row, one link around the whole summary) whose note itself
 *     links the figure to its evidence;
 *   - for a figure the study states in its introduction (`facts`: its size, its workstreams), a
 *     link to the study, whose hero states it and links to its line;
 *   - the study page itself for those introduction figures, since its hero states them and links
 *     to their lines (a figure in `facts` the hero does not state is not one of them);
 *   - a field note's standfirst, when the note's body links the same figure to its evidence.
 * A new page that quotes a figure without its source fails here.
 */
import { describe, expect, it } from 'vitest';
import type { HTMLElement as ParsedElement, Node as ParsedNode } from 'node-html-parser';
import { allHtmlFiles, readDistFile, SITE_URL, type BuiltPage } from './support/dist';
import { CLAIM_MENTIONS, publishedClaims, type ClaimId } from '../src/data/claims';
import { business, formatGBP, services } from '../src/data/business';
import { parse } from 'node-html-parser';

const MENTIONS = CLAIM_MENTIONS;

interface Figure { value: string; label: string; claims: string[] }
interface Study { slug: string; stats: Figure[]; facts: Figure[] }

const studies: Study[] = JSON.parse(readDistFile('api/case-studies.json') ?? '{"caseStudies":[]}').caseStudies;
const claimsDoc = JSON.parse(readDistFile('api/claims.json') ?? '{"claims":[]}') as { claims: { id: ClaimId; evidenceUrl: string }[] };

const anchorOf = (claims: string[]) => `source-${claims[0]!.replace(/_/g, '-')}`;
const studyPath = (slug: string) => `/work/${slug}/`;
// A legacy `x.html` redirect stub maps to the same route as its page; only the page has words.
const pagesByPath = new Map(allHtmlFiles().filter((p) => !p.isRedirectStub).map((p) => [p.route, p]));
// What a study's hero states (headline, subhead, client line): only a `facts` figure found here
// is an introduction figure. One the study states only in its story needs a link like any other.
const heroText = (slug: string) => pagesByPath.get(studyPath(slug))?.doc.querySelector('main .case-hero')?.text ?? '';

// Where each claim's evidence is: the rows (page path + fragment) that quote it, and the studies
// that state it in their introduction.
const rowsFor = new Map<string, Set<string>>();
const introOf = new Map<string, Set<string>>();
const sourcedStudies = new Set<string>();
for (const study of studies) {
  for (const figure of [...study.stats, ...study.facts]) {
    if (figure.claims.length === 0) continue;
    sourcedStudies.add(study.slug);
    for (const id of figure.claims) {
      if (!rowsFor.has(id)) rowsFor.set(id, new Set());
      rowsFor.get(id)!.add(`${studyPath(study.slug)}#${anchorOf(figure.claims)}`);
    }
  }
  for (const figure of study.facts) for (const id of figure.claims) {
    if (!MENTIONS[id as ClaimId]?.test(heroText(study.slug))) continue;
    if (!introOf.has(id)) introOf.set(id, new Set());
    introOf.get(id)!.add(studyPath(study.slug));
  }
}

const UNIT = new Set(['p', 'li', 'td', 'th', 'blockquote', 'figcaption', 'dd', 'h1', 'h2', 'h3', 'h4']);
const UNIT_CLASSES = ['stat', 'case-card', 'page-hero__inner', 'offer__catch', 'evidence__item'];
const BOUNDARY = new Set(['main', 'section', 'article', 'header', 'footer', 'nav', 'aside', 'body']);

const classes = (el: ParsedElement) => (el.getAttribute?.('class') ?? '').split(/\s+/);
const isUnit = (el: ParsedElement) => UNIT.has(el.rawTagName?.toLowerCase()) || classes(el).some((c) => UNIT_CLASSES.includes(c));
const isBoundary = (el: ParsedElement) => BOUNDARY.has(el.rawTagName?.toLowerCase()) || classes(el).includes('prose');

function target(page: BuiltPage, href: string): { path: string; hash: string } | null {
  const url = new URL(href, `${SITE_URL}${page.route}`);
  if (url.origin !== SITE_URL) return null;
  return { path: url.pathname, hash: url.hash };
}

/** Does a link to `href` from `page` lead a reader to the evidence for `claim`? */
function leadsToEvidence(page: BuiltPage, href: string, claim: string): boolean {
  const t = target(page, href);
  if (!t) return false;
  if (rowsFor.get(claim)?.has(`${t.path}${t.hash}`)) return true;
  const slug = t.path.match(/^\/work\/([^/]+)\/$/)?.[1];
  if (slug && t.hash === '#sources' && [...(rowsFor.get(claim) ?? [])].some((row) => row.startsWith(studyPath(slug)))) return true;
  return introOf.get(claim)?.has(t.path) === true && (t.hash === '' || t.hash === '#sources');
}

interface Mention { page: string; claim: string; text: string; sourced: boolean }

function mentions(page: BuiltPage, teaserDepth = 1): Mention[] {
  const main = page.doc.querySelector('main');
  if (!main) return [];
  const found: Mention[] = [];
  const walk = (node: ParsedNode, ancestors: ParsedElement[]) => {
    if (node.nodeType === 3) {
      const text = (node as unknown as { text: string }).text;
      for (const [claim, pattern] of Object.entries(MENTIONS)) {
        if (!pattern.test(text)) continue;
        found.push({ page: page.route, claim, text: text.trim().slice(0, 90), sourced: sourced(page, claim, ancestors, teaserDepth) });
      }
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as ParsedElement;
    if (['script', 'style', 'template'].includes(el.rawTagName?.toLowerCase())) return;
    for (const child of el.childNodes) walk(child, [el, ...ancestors]);
  };
  walk(main, []);
  return found;
}

function sourced(page: BuiltPage, claim: string, ancestors: ParsedElement[], teaserDepth: number): boolean {
  // The study's own hero states its introduction figures and links to their lines.
  if (introOf.get(claim)?.has(page.route)) return true;
  for (const el of ancestors) {
    if (classes(el).includes('evidence__item')) return true;
    // A field note's standfirst sums up the note; its body links the same figure a few lines on.
    if (classes(el).includes('page-hero__sub') && page.route.startsWith('/field-notes/') &&
      page.doc.querySelectorAll('main .prose a[href]').some((a) => leadsToEvidence(page, a.getAttribute('href') ?? '', claim))) return true;
    if (el.rawTagName?.toLowerCase() === 'a') {
      const href = el.getAttribute('href') ?? '';
      if (leadsToEvidence(page, href, claim)) return true;
      const t = target(page, href);
      const next = t && t.path !== page.route ? pagesByPath.get(t.path) : undefined;
      if (next && teaserDepth > 0 && classes(el).includes('note-row') && mentions(next, teaserDepth - 1).some((m) => m.claim === claim && m.sourced)) return true;
    }
    if (isUnit(el) && el.querySelectorAll('a[href]').some((a) => leadsToEvidence(page, a.getAttribute('href') ?? '', claim))) return true;
    if (isBoundary(el)) return false;
  }
  return false;
}

describe('truth-layer figures link to their evidence wherever a person reads them', () => {
  it('names how every published claim reads in running text', () => {
    for (const claim of publishedClaims) expect(MENTIONS[claim.id], claim.id).toBeInstanceOf(RegExp);
  });

  it('finds the figures where they are quoted (the check is looking at something)', () => {
    const all = allHtmlFiles().filter((p) => !p.isRedirectStub).flatMap((p) => mentions(p));
    const pages = new Set(all.map((m) => m.page));
    for (const route of ['/', '/work/', '/services/', '/about/', '/work/care-provider-transformation/', '/field-notes/automation-for-care-providers-where-to-start/']) {
      expect(pages, `no figure found on ${route}`).toContain(route);
    }
    expect(all.length).toBeGreaterThan(60);
    const claims = new Set(all.map((m) => m.claim));
    for (const claim of publishedClaims) expect(claims, `${claim.id}: its MENTIONS pattern matches no page`).toContain(claim.id);
  });

  it('every page that states a figure links it to the line of evidence behind it', () => {
    const offenders = allHtmlFiles()
      .filter((p) => !p.isRedirectStub)
      .flatMap((p) => mentions(p))
      .filter((m) => !m.sourced)
      .map((m) => `${m.page}  ${m.claim}  “${m.text}”`);
    expect(offenders, `figures shown without a link to their evidence:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('every evidence row a link names is on its case study, once', () => {
    for (const study of studies.filter((s) => sourcedStudies.has(s.slug))) {
      const page = pagesByPath.get(studyPath(study.slug))!;
      expect(page.doc.querySelectorAll('section#sources').length, study.slug).toBe(1);
      expect(page.doc.querySelector('.case-hero__src')?.getAttribute('href'), `${study.slug}: the hero links its sources`).toBe('#sources');
      for (const figure of [...study.stats, ...study.facts].filter((f) => f.claims.length > 0)) {
        expect(page.doc.querySelectorAll(`.evidence__item[id="${anchorOf(figure.claims)}"]`).length, `${study.slug}: ${figure.value}`).toBe(1);
      }
    }
  });

  it('/api/claims.json points each claim at the line a person reads for it', () => {
    expect(claimsDoc.claims.length).toBe(publishedClaims.length);
    for (const claim of claimsDoc.claims) {
      const url = new URL(claim.evidenceUrl);
      expect(url.origin).toBe(SITE_URL);
      expect(rowsFor.get(claim.id), claim.id).toContain(`${url.pathname}${url.hash}`);
      const page = pagesByPath.get(url.pathname);
      expect(page?.doc.querySelector(`.evidence__item[id="${url.hash.slice(1)}"]`), claim.evidenceUrl).toBeTruthy();
    }
  });
});

// ─── Every number a buyer reads is accounted for ───────────────────────────────────────────────

const MONTH = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Numbers the shared business truth publishes in a service's own words ("1–3 workflows",
// "No 12-month lock-in"): src/data/business.ts is their one source, and /services/ shows them.
const serviceNumbers = [...new Set(services.flatMap((s) => [s.description, ...s.includes]).flatMap((t) => t.match(/\S*\d\S*/g) ?? []).map((t) => t.replace(/[.,;:]$/, '')))];
/** What is never a claim about delivered work, on any page. */
const NOT_A_CLAIM: RegExp[] = [
  ...services.map((s) => new RegExp(`${escape(formatGBP(s.priceFrom))}(?!\\d|,\\d)`, 'g')),
  ...serviceNumbers.map((n) => new RegExp(`(?<![\\w\\d])${escape(n)}(?![\\d])`, 'g')),
  new RegExp(escape(business.phone), 'g'),
  new RegExp(`\\b(?:\\d{1,2} )?${MONTH}(?: 20\\d\\d)?\\b`, 'g'),
  /\b20\d\d\b/g, // a year
  /\b[Pp]hase \d\b/g,
  /\bB2B\b/g,
  /(?<![\d:])\b0\d\b(?!:\d)/g, // a zero-padded item label: 01 · the name, Rung 02
];
const claimPatterns = Object.values(MENTIONS).map((p) => new RegExp(p.source, `${p.flags.replace('g', '')}g`));
// A heading's own item number ("1. How old is the newest backup?", "Sign 3: …") numbers the
// note's list, it states nothing.
const HEADING_ORDINAL = /^\s*(?:Sign )?\d{1,2}[.:](?=\s)/;

/** An element's words, a space between text nodes so a figure never runs into the line before. */
const spaced = (el: ParsedElement): string => el.childNodes.map((n) => {
  if (n.nodeType === 3) return n.text;
  if (n.nodeType !== 1) return '';
  const child = n as ParsedElement;
  if (['script', 'style', 'template'].includes(child.rawTagName?.toLowerCase())) return '';
  const words = spaced(child);
  return /^h[2-4]$/i.test(child.rawTagName ?? '') ? words.replace(HEADING_ORDINAL, ' ') : words;
}).join(' ');

/** A named exception: a passage on one page, how many times it is there, and why it is allowed. */
type Named = [passage: RegExp, times: number, why: string];

/**
 * The numbers left in `text` once claims, prices, the business's own facts, dates and the named
 * passages are taken out, each with the words around it.
 */
function unaccounted(where: string, text: string, named: readonly Named[] = []): string[] {
  let rest = text.replace(/\s+/g, ' ');
  for (const p of [...claimPatterns, ...NOT_A_CLAIM, ...named.map(([p]) => new RegExp(p.source, `${p.flags.replace('g', '')}g`))]) rest = rest.replace(p, ' ');
  return [...rest.matchAll(/\S*\d\S*/g)].map((m) => `${where}: ${m[0]} in “…${rest.slice(Math.max(0, m.index - 40), m.index + 40).trim()}…”`);
}

/** Each named passage must be on its page exactly as often as it says: never reused, never left behind. */
function namedCounts(where: string, text: string, named: readonly Named[]): string[] {
  const flat = text.replace(/\s+/g, ' ');
  return named.flatMap(([p, times, why]) => {
    const found = flat.match(new RegExp(p.source, `${p.flags.replace('g', '')}g`))?.length ?? 0;
    return found === times ? [] : [`${where}: ${p} (${why}) is there ${found} time(s), named for ${times}`];
  });
}

/** A built page's <main> as a reader reads it: without its evidence rows, contents list and scripts. */
function readerText(route: string): string {
  const main = pagesByPath.get(route)?.doc.querySelector('main')?.clone() as ParsedElement | undefined;
  expect(main, `${route} not built`).toBeTruthy();
  // The evidence rows quote the record itself; the contents list and "Keep reading" repeat other words.
  for (const el of main!.querySelectorAll('#sources, [data-page-words="skip"]')) el.remove();
  return spaced(main!);
}

describe('the number check (the check is looking at something)', () => {
  it('finds a number nothing accounts for, and accounts for claims, prices, dates and labels', () => {
    expect(unaccounted('t', 'It imported 295 carers.')).toHaveLength(1);
    expect(unaccounted('t', 'It imported 294 carers in June 2026 for £450, 28 Sept 2026, on 8 October.')).toEqual([]);
    expect(unaccounted('t', '01 · the name. Phase 1. A B2B portal for 1–3 workflows, no 12-month lock-in. Call +44 7451 261333.')).toEqual([]);
    expect(unaccounted('t', 'A drill put it back in about 200 seconds at 04:01 UTC.')).toHaveLength(2);
    expect(unaccounted('t', 'Restored in 200 seconds.', [[/200 seconds/, 1, 'example']])).toEqual([]);
  });

  it('fails a named passage that is used more or less often than named', () => {
    expect(namedCounts('t', 'at 8pm, and again at 8pm', [[/8pm/, 1, 'example']])).toHaveLength(1);
    expect(namedCounts('t', 'nothing here', [[/8pm/, 1, 'example']])).toHaveLength(1);
    expect(namedCounts('t', 'at 8pm', [[/8pm/, 1, 'example']])).toEqual([]);
  });

  it('drops a heading\'s own item number, and only that', () => {
    const doc = parse('<main><h2>1. How old is the newest backup?</h2><h3>Sign 2: one person knows</h3><p>1. Not a heading</p></main>');
    expect(spaced(doc.querySelector('main')!).replace(/\s+/g, ' ').trim()).toBe('How old is the newest backup? one person knows 1. Not a heading');
  });
});

/**
 * A case study is a record of delivered work, so every number it states is a claim about that work
 * and must come from the truth layer (VISION.md: "Claims come from the truth layer"). The check
 * above only looks at figures the registry already holds; this one finds the rest. Each number a
 * case study's page, card line (statline), summary or description states must be a registered
 * claim (MENTIONS), a published from-price, a date or a phase, or be named in NOT_A_FIGURE with
 * why it is not a claim. A new number in a case study fails here until its claim is copied from
 * automancer-bd data/claims.toml into src/data/claims.ts (t25118).
 */
describe('a case study states no number the truth layer does not hold', () => {
  // Numbers that are not figures, by study, with the reason. Shrink, never grow without one.
  const NOT_A_FIGURE: Record<string, [RegExp, string][]> = {
    'care-provider-transformation': [[/Microsoft 365/g, 'a product name']],
  };
  const named = (slug: string): Named[] => (NOT_A_FIGURE[slug] ?? []).map(([p, why]) => [p, 0, why]);

  // What the home page's and /work/'s cards say about a study: its title, summary and statline.
  function cardTexts(slug: string): string[] {
    return ['/', '/work/'].flatMap((route) => pagesByPath.get(route)?.doc.querySelectorAll('main .case-card') ?? [])
      .filter((card) => card.querySelectorAll('a[href]').some((a) => a.getAttribute('href') === studyPath(slug)))
      .map(spaced);
  }

  it('every number on a case study is a registered claim, a price, a date or named here', () => {
    expect(studies.length).toBeGreaterThan(0);
    for (const study of studies) expect(cardTexts(study.slug).length, `${study.slug}: no case card found`).toBeGreaterThan(0);
    const offenders = studies.flatMap((study) => [
      ...unaccounted(study.slug, readerText(studyPath(study.slug)), named(study.slug)),
      ...cardTexts(study.slug).flatMap((text) => unaccounted(study.slug, text, named(study.slug))),
      ...unaccounted(study.slug, (study as Study & { description: string }).description, named(study.slug)),
    ]);
    expect(offenders, `numbers with no truth-layer claim: copy the claim from automancer-bd data/claims.toml into src/data/claims.ts, or remove the number:\n${offenders.join('\n')}`).toEqual([]);
  });
});

/**
 * The same holds for every field note and every page a buyer reads before getting in touch
 * (t25645): VISION.md says every number in a field note "comes from evidence held elsewhere in the
 * estate". A number there is a registered claim (linked to its evidence by the check above), a
 * published from-price or one of the business's own published facts (src/data/business.ts,
 * src/data/enquiry.ts), a date, a phase or an item label, or it is named below with its reason.
 *
 * NOT_A_FIGURE names numbers that state nothing about our work: a reader's own sums, an example,
 * a pointer to the note's own list. UNBACKED names facts about our own or a client's systems that
 * the site states with no truth-layer claim behind them yet. They were published before this check
 * existed; each is named so no new one can join it, and leaves the list when its claim is copied
 * from automancer-bd data/claims.toml or the passage goes. Each entry counts how often its passage
 * appears, so neither list can quietly cover a new sentence. /releases/ (the site's own change
 * log), /developers/ (protocol numbers) and the legal pages are out of scope.
 */
describe('every number a buyer reads is a claim, a price, a date or named with its reason', () => {
  const NOT_A_FIGURE: Record<string, Named[]> = {
    '/': [[/capabilities: 4/, 1, 'counts the four capabilities listed under it']],
    '/services/': [[/live in ~2 weeks/, 1, 'the Sprint\'s "around two weeks" in src/data/business.ts (registry: workflow_sprint_timeline)']],
    '/about/': [[/rules_kept: 5\/5/, 1, 'counts the five rules listed under it']],
    '/contact/': [[/1 week to a meeting/, 1, 'the response promise, RESPONSE_PROMISE in src/data/enquiry.ts']],
    '/404/': [[/\(404\)/, 1, 'the HTTP status of the page']],
    '/field-notes/': [[/[Uu]nder[- ]£1,000/, 2, 'the budget the under-£1,000 note is about, not a price we charge']],
    '/field-notes/under-1000-automation-whats-actually-possible/': [[/[Uu]nder[- ]£1,000/, 4, 'the budget the note is about, not a price we charge']],
    '/field-notes/small-business-website-cost-2026/': [[/24 months of every recurring line/, 1, 'a sum the reader is asked to do']],
    '/field-notes/credit-hire-website-compliance-trust-checklist/': [
      [/items 1, 6 and 7/, 1, 'points at the note\'s own checklist'],
      [/missing 2 and 3/, 1, 'points at the note\'s own checklist'],
    ],
    '/field-notes/backup-restore-evidence-five-questions/': [
      [/from 03:30 this morning/, 1, 'an example of an answer to ask a supplier for'],
      [/the number in question 1/, 1, 'points at the note\'s own first question'],
    ],
    '/field-notes/duplicate-data-what-identity-matching-fixes/': [[/checking all 418 by hand/, 1, 'the total of the linked "274 of 418" one paragraph up (identity_matching_auto_resolved)']],
    '/field-notes/self-storage-software-what-to-check-before-you-sign/': [
      [/breaks at 8pm/, 1, 'an example evening call-out'],
      [/a 50 square foot unit/, 1, 'an example customer question'],
    ],
  };
  const UNBACKED: Record<string, Named[]> = {
    '/field-notes/backup-restore-evidence-five-questions/': [
      [/a power cycle at 03:17/, 1, 'our own power cycle on 1 November 2026'],
      [/The nightly backup runs at 03:30/, 1, 'our own backup schedule'],
      [/about 200 seconds/, 1, 'a client ERP restore drill on 31 August 2026'],
      [/due at 04:01 UTC/, 1, 'our first offsite restore check'],
    ],
    '/field-notes/duplicate-data-what-identity-matching-fixes/': [
      [/review the 144 genuinely ambiguous records/, 1, 'registry claim identity_matching_manual_remainder (418 − 274), sourced to a LinkedIn draft rather than the dossier, so not published as a claim'],
    ],
  };
  const notePages = allHtmlFiles().filter((p) => !p.isRedirectStub && /^\/field-notes\/[^/]+\/$/.test(p.route)).map((p) => p.route);
  const routes = ['/', '/services/', '/work/', '/about/', '/contact/', '/field-notes/', '/404/', ...notePages];
  const namedOn = (route: string) => [...(NOT_A_FIGURE[route] ?? []), ...(UNBACKED[route] ?? [])];

  it('reads every field note and every page a buyer reads', () => {
    expect(notePages.length).toBeGreaterThanOrEqual(18);
    for (const route of routes) expect(pagesByPath.has(route), route).toBe(true);
    for (const route of [...Object.keys(NOT_A_FIGURE), ...Object.keys(UNBACKED)]) expect(routes, `${route} is named but not read`).toContain(route);
    const numbers = routes.flatMap((route) => readerText(route).match(/\S*\d\S*/g) ?? []);
    expect(numbers.length).toBeGreaterThan(300);
  });

  it('states no number that is not a claim, a price, a date or named here', () => {
    const offenders = routes.flatMap((route) => unaccounted(route, readerText(route), namedOn(route)));
    expect(offenders, `numbers with no truth-layer claim: copy the claim from automancer-bd data/claims.toml into src/data/claims.ts (and link it), or name it here with its reason:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('names every exception exactly as often as its page uses it', () => {
    const wrong = routes.flatMap((route) => namedCounts(route, readerText(route), namedOn(route)));
    expect(wrong, wrong.join('\n')).toEqual([]);
  });
});

/**
 * /api/field-notes.json names the truth-layer claims each note states, with the same evidence line
 * /api/claims.json gives (t25645): an agent quoting a note can cite what a reader can open.
 */
describe('/api/field-notes.json names the claims each note states', () => {
  const payload = JSON.parse(readDistFile('api/field-notes.json') ?? '{"fieldNotes":[]}') as { fieldNotes: { slug: string; claims: { id: ClaimId; evidenceUrl: string }[] }[] };
  const evidenceOf = new Map(claimsDoc.claims.map((c) => [c.id, c.evidenceUrl]));

  it('lists the claims the page shows, each with its evidence line', () => {
    expect(payload.fieldNotes.length).toBeGreaterThanOrEqual(18);
    let stated = 0;
    for (const note of payload.fieldNotes) {
      const page = pagesByPath.get(`/field-notes/${note.slug}/`)!;
      expect(page, note.slug).toBeTruthy();
      const words = readerText(page.route);
      const shown = new Set(publishedClaims.map((c) => c.id).filter((id) => MENTIONS[id].test(words)));
      expect(new Set(note.claims.map((c) => c.id)), note.slug).toEqual(shown);
      for (const claim of note.claims) expect(claim.evidenceUrl, `${note.slug}: ${claim.id}`).toBe(evidenceOf.get(claim.id));
      stated += note.claims.length;
    }
    expect(stated).toBeGreaterThan(10);
  });
});
