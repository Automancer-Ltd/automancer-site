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
import { publishedClaims, type ClaimId } from '../src/data/claims';
import { services } from '../src/data/business';

// How each claim's figure reads in running text. Every published claim needs one.
const MENTIONS: Record<ClaimId, RegExp> = {
  care_provider_size: /~?600-person|~600 people/,
  governed_workstream_count: /~18\b|\beighteen staged/i,
  carer_record_count: /(?<![\d,.])294(?![\d,])/,
  service_user_record_count: /(?<![\d,.])293(?![\d,])/,
  identity_matching_auto_resolved: /(?<![\d,.])274(?![\d,])(?:\s*(?:of|\/)\s*418(?![\d,]))?/,
  care_provider_staff_split: /(?<![\d,.~])100 office staff|(?<![\d,.~])500 support workers|500-strong support-worker/,
  supervision_schedule_count: /(?<![\d,.])588(?![\d,])/,
  infrastructure_audit_result: /\b0 failures|(?<![\d])0 \/ 0(?![\d])/,
  debiaser_hourly_rate_range: /£100–200/,
  debiaser_per_engagement_cost: /£300–400/,
  debiaser_self_service_cost: /£10–80/,
  debiaser_live_since: /12 Jun(e)? 2026|since June 2026/,
  manufacturer_portal_phase_status: /Phase 1 signed off/i,
  manufacturer_portal_pricing_units: /\b5 units\b|\bfive units\b/,
  reconciliation_visit_count: /(?<![\d,.])500 visits/,
  reconciliation_medication_alert_count: /(?<![\d,.])175 medication alerts/,
  reconciliation_names_routed_to_review: /(?<![\d,.])416 (?:ambiguous )?names/,
  manufacturer_portal_demo_seed_data: /(?<![\d,.])74 customers|(?<![\d,.])888 products|(?<![\d,.])1,263 price rules/,
};

interface Figure { value: string; label: string; claims: string[] }
interface Study { slug: string; stats: Figure[]; facts: Figure[] }

const studies: Study[] = JSON.parse(readDistFile('api/case-studies.json') ?? '{"caseStudies":[]}').caseStudies;
const claimsDoc = JSON.parse(readDistFile('api/claims.json') ?? '{"claims":[]}') as { claims: { id: ClaimId; evidenceUrl: string }[] };

const anchorOf = (claims: string[]) => `source-${claims[0]!.replace(/_/g, '-')}`;
const studyPath = (slug: string) => `/work/${slug}/`;
const pagesByPath = new Map(allHtmlFiles().map((p) => [p.route, p]));
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
  const MONTH = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
  const NOT_A_CLAIM: RegExp[] = [
    ...services.map((s) => new RegExp(`£${s.priceFrom.toLocaleString('en-GB')}(?![\\d,])`, 'g')),
    new RegExp(`\\b(?:\\d{1,2} )?${MONTH} 20\\d\\d\\b`, 'g'),
    /\bPhase \d\b/g,
  ];
  // Numbers that are not figures, by study, with the reason. Shrink, never grow without one.
  const NOT_A_FIGURE: Record<string, [RegExp, string][]> = {
    'care-provider-transformation': [[/Microsoft 365/g, 'a product name']],
  };
  const claimPatterns = Object.values(MENTIONS).map((p) => new RegExp(p.source, `${p.flags.replace('g', '')}g`));

  // An element's words with a space between text nodes, so a figure never runs into the line before.
  const spaced = (el: ParsedElement): string => el.childNodes.map((n) => n.nodeType === 3 ? n.text : n.nodeType === 1 ? spaced(n as ParsedElement) : '').join(' ');

  function unregistered(slug: string, text: string): string[] {
    let rest = text.replace(/\s+/g, ' ');
    for (const p of [...claimPatterns, ...NOT_A_CLAIM, ...(NOT_A_FIGURE[slug] ?? []).map(([p]) => p)]) rest = rest.replace(p, ' ');
    return [...rest.matchAll(/\S*\d\S*/g)].map((m) => `${slug}: ${m[0]} in “…${rest.slice(Math.max(0, m.index - 40), m.index + 40).trim()}…”`);
  }

  function pageText(slug: string): string {
    const main = pagesByPath.get(studyPath(slug))?.doc.querySelector('main')?.clone() as ParsedElement | undefined;
    expect(main, `${studyPath(slug)} not built`).toBeTruthy();
    // The evidence rows quote the record itself; the contents list repeats the page's headings.
    for (const el of main!.querySelectorAll('#sources, [data-page-words="skip"]')) el.remove();
    return spaced(main!);
  }

  // What the home page's and /work/'s cards say about a study: its title, summary and statline.
  function cardTexts(slug: string): string[] {
    return ['/', '/work/'].flatMap((route) => pagesByPath.get(route)?.doc.querySelectorAll('main .case-card') ?? [])
      .filter((card) => card.querySelectorAll('a[href]').some((a) => a.getAttribute('href') === studyPath(slug)))
      .map(spaced);
  }

  it('finds every number a study states (the check is looking at something)', () => {
    expect(unregistered('care-provider-transformation', 'It imported 295 carers.')).toHaveLength(1);
    expect(unregistered('care-provider-transformation', 'It imported 294 carers in June 2026 for £450.')).toEqual([]);
  });

  it('every number on a case study is a registered claim, a price, a date or named here', () => {
    expect(studies.length).toBeGreaterThan(0);
    for (const study of studies) expect(cardTexts(study.slug).length, `${study.slug}: no case card found`).toBeGreaterThan(0);
    const offenders = studies.flatMap((study) => [
      ...unregistered(study.slug, pageText(study.slug)),
      ...cardTexts(study.slug).flatMap((text) => unregistered(study.slug, text)),
      ...unregistered(study.slug, (study as Study & { description: string }).description),
    ]);
    expect(offenders, `numbers with no truth-layer claim: copy the claim from automancer-bd data/claims.toml into src/data/claims.ts, or remove the number:\n${offenders.join('\n')}`).toEqual([]);
  });
});
