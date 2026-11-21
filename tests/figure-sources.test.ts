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
 *   - the study page itself for those introduction figures, for the same reason;
 *   - a field note's standfirst, when the note's body links the same figure to its evidence.
 * A new page that quotes a figure without its source fails here.
 */
import { describe, expect, it } from 'vitest';
import type { HTMLElement as ParsedElement, Node as ParsedNode } from 'node-html-parser';
import { allHtmlFiles, readDistFile, SITE_URL, type BuiltPage } from './support/dist';
import { publishedClaims, type ClaimId } from '../src/data/claims';

// How each claim's figure reads in running text. Every published claim needs one.
const MENTIONS: Record<ClaimId, RegExp> = {
  care_provider_size: /~?600-person|~600 people/,
  governed_workstream_count: /~18\b|\beighteen staged/i,
  carer_record_count: /(?<![\d,.])294(?![\d,])/,
  service_user_record_count: /(?<![\d,.])293(?![\d,])/,
  identity_matching_auto_resolved: /(?<![\d,.])274(?![\d,])/,
  supervision_schedule_count: /(?<![\d,.])588(?![\d,])/,
  infrastructure_audit_result: /\b0 failures|(?<![\d])0 \/ 0(?![\d])/,
  debiaser_hourly_rate_range: /£100–200/,
  debiaser_per_engagement_cost: /£300–400/,
  debiaser_self_service_cost: /£10–80/,
  debiaser_live_since: /12 Jun(e)? 2026|since June 2026/,
  manufacturer_portal_phase_status: /Phase 1 signed off/i,
  manufacturer_portal_pricing_units: /\b5 units\b|\bfive units\b/,
};

interface Figure { value: string; label: string; claims: string[] }
interface Study { slug: string; stats: Figure[]; facts: Figure[] }

const studies: Study[] = JSON.parse(readDistFile('api/case-studies.json') ?? '{"caseStudies":[]}').caseStudies;
const claimsDoc = JSON.parse(readDistFile('api/claims.json') ?? '{"claims":[]}') as { claims: { id: ClaimId; evidenceUrl: string }[] };

const anchorOf = (claims: string[]) => `source-${claims[0]!.replace(/_/g, '-')}`;
const studyPath = (slug: string) => `/work/${slug}/`;

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

const pagesByPath = new Map(allHtmlFiles().map((p) => [p.route, p]));

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
