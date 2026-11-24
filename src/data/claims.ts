/** Public claim provenance copied only from the Automancer BD truth-layer registry. */
const truthLayer = 'Automancer-Ltd/automancer-bd:data/claims.toml';
const evidence = 'Automancer-Ltd/automancer-bd:docs/case-study-dossier.md';

export const publishedClaims = [
  { id: 'care_provider_size', value: 'a ~600-person supported-living care provider', evidenceRecord: evidence, registry: truthLayer, sourceQuote: '~100 office staff + ~500 support workers' },
  { id: 'care_provider_staff_split', value: 'around 100 office staff and 500 support workers', evidenceRecord: evidence, registry: truthLayer, sourceQuote: '~100 office staff + ~500 support workers' },
  { id: 'governed_workstream_count', value: '~18 governed workstreams', evidenceRecord: evidence, registry: truthLayer, sourceQuote: "Automancer's flagship account: a whole-business digital transformation delivered as ~18 governed workstreams, several already live in production." },
  { id: 'carer_record_count', value: '294 carers imported as clean canonical records', evidenceRecord: evidence, registry: truthLayer, sourceQuote: 'roster import created **294 carers + 293 service users** as canonical records from real client CSVs' },
  { id: 'service_user_record_count', value: '293 service users imported as clean canonical records', evidenceRecord: evidence, registry: truthLayer, sourceQuote: 'roster import created **294 carers + 293 service users** as canonical records from real client CSVs' },
  { id: 'identity_matching_auto_resolved', value: '274 of 418 duplicate-review candidates auto-resolved', evidenceRecord: evidence, registry: truthLayer, sourceQuote: 'identity matching **auto-resolved 274 of 418 review candidates**' },
  { id: 'supervision_schedule_count', value: '588 supervision schedules created automatically', evidenceRecord: evidence, registry: truthLayer, sourceQuote: '**588 supervision/spot-check schedules instantiated automatically**' },
  { id: 'reconciliation_visit_count', value: '500 visits reconciled against real April exports', evidenceRecord: evidence, registry: truthLayer, sourceQuote: 'reconciliation verified against real April exports (500 visits, 175 medication alerts, 416 names routed to review).' },
  { id: 'reconciliation_medication_alert_count', value: '175 medication alerts reconciled against real April exports', evidenceRecord: evidence, registry: truthLayer, sourceQuote: 'reconciliation verified against real April exports (500 visits, 175 medication alerts, 416 names routed to review).' },
  { id: 'reconciliation_names_routed_to_review', value: '416 names routed to review', evidenceRecord: evidence, registry: truthLayer, sourceQuote: 'reconciliation verified against real April exports (500 visits, 175 medication alerts, 416 names routed to review).' },
  { id: 'infrastructure_audit_result', value: '0 failures, 0 warnings across every layer', evidenceRecord: evidence, registry: truthLayer, sourceQuote: 'Documented audits: **0 failures, 0 warnings across every layer**.' },
  { id: 'debiaser_hourly_rate_range', value: '£100–200/hour consultant review time', evidenceRecord: evidence, registry: truthLayer, sourceQuote: 'replaces **hours of consultant review at £100–200/hour (~£300–400/engagement) with a self-service task costing £10–80, completed in minutes**' },
  { id: 'debiaser_per_engagement_cost', value: '~£300–400 per consultant engagement', evidenceRecord: evidence, registry: truthLayer, sourceQuote: 'replaces **hours of consultant review at £100–200/hour (~£300–400/engagement) with a self-service task costing £10–80, completed in minutes**' },
  { id: 'debiaser_self_service_cost', value: '£10–80 per self-service document review', evidenceRecord: evidence, registry: truthLayer, sourceQuote: 'replaces **hours of consultant review at £100–200/hour (~£300–400/engagement) with a self-service task costing £10–80, completed in minutes**' },
  { id: 'debiaser_live_since', value: 'live in production since 12 June 2026', evidenceRecord: evidence, registry: truthLayer, sourceQuote: 'live in production since 12 Jun 2026 (v1.0)' },
  { id: 'manufacturer_portal_phase_status', value: 'Phase 1 signed off April 2026', evidenceRecord: evidence, registry: truthLayer, sourceQuote: 'Phase 1 signed off (Apr 2026) as "usable foundation", staged for client review — not yet full production launch.' },
  { id: 'manufacturer_portal_pricing_units', value: '5 units', evidenceRecord: evidence, registry: truthLayer, sourceQuote: 'a multi-unit pricing matrix (feet/metres/sqft/sqm/each) with bulk reprice' },
  { id: 'manufacturer_portal_demo_seed_data', value: 'demo seeded with ~74 customers, 888 products and 1,263 price rules', evidenceRecord: evidence, registry: truthLayer, sourceQuote: "Demo seed data (built from the client's real price-list workbook): ~74 customers, 888 products, 1,263 price rules." },
] as const;

export type ClaimId = (typeof publishedClaims)[number]['id'];
export type PublishedClaim = (typeof publishedClaims)[number];

/**
 * How each claim's figure reads in running text: every published claim needs one. The build uses
 * it to name the claims a field note states (/api/field-notes.json `claims`), and the tests to
 * find every place a figure is shown and hold it to its evidence (tests/figure-sources.test.ts).
 */
export const CLAIM_MENTIONS: Record<ClaimId, RegExp> = {
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

export const claimIds: readonly string[] = publishedClaims.map((c) => c.id);

/** The registry entry for `id`; an id the registry does not hold stops the build. */
export function claimById(id: string): PublishedClaim {
  const claim = publishedClaims.find((c) => c.id === id);
  if (!claim) throw new Error(`No published claim "${id}" in src/data/claims.ts (copy it from automancer-bd data/claims.toml first)`);
  return claim;
}

/** A source quote as a reader sees it: the record's Markdown emphasis removed, words unchanged. */
export function quoteText(quote: string): string {
  return quote.replace(/\*\*/g, '');
}

/**
 * What a case study shows under "Where these numbers come from" for one headline figure: the
 * evidence record's own lines behind it, each once (two claims can share a line). The same lines
 * are in /api/claims.json, so a person reads what a machine is told (t23334).
 */
export function statQuotes(claims: readonly string[]): string[] {
  return [...new Set(claims.map((id) => quoteText(claimById(id).sourceQuote)))];
}

/** The private record every published claim quotes, named the way the claims registry names it. */
export const EVIDENCE_RECORD = evidence;
export const CLAIMS_REGISTRY = truthLayer;

/** The one sentence that opens "Where these numbers come from" on a case study and in its twin. */
export const SOURCES_INTRO =
  'These figures are quoted from our case-study dossier, the private record we keep of the delivered work. We publish the line each one comes from, word for word, not the record itself.';

/** One line under "Where these numbers come from": a figure, its label and the claims behind it. */
export interface EvidenceRow {
  /** Fragment id of the row on its case study: `source-` and its first claim id (t23577). */
  anchor: string;
  v: string;
  l: string;
  claims: readonly string[];
  /** The evidence record's lines behind the figure, each once. */
  quotes: string[];
}

interface Figure { v: string; l: string; claims: readonly string[] }

/** The fragment a figure's evidence row answers at: stable while its first claim id is. */
export function evidenceAnchor(claims: readonly string[]): string {
  return `source-${claims[0]!.replace(/_/g, '-')}`;
}

/**
 * A case study's evidence rows: its headline figures backed by a claim, in band order, then the
 * figures its hero states outside the band (`facts`). Two rows on one page may not share an anchor.
 */
export function evidenceRows(study: { stats: readonly Figure[]; facts?: readonly Figure[] }): EvidenceRow[] {
  const rows = [...study.stats, ...(study.facts ?? [])]
    .filter((f) => f.claims.length > 0)
    .map((f) => ({ anchor: evidenceAnchor(f.claims), v: f.v, l: f.l, claims: f.claims, quotes: statQuotes(f.claims) }));
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.anchor)) throw new Error(`Two figures on one case study start with claim "${row.claims[0]}": give the second one its own first claim`);
    seen.add(row.anchor);
  }
  return rows;
}

/** Where a case study's evidence section starts, for links that cover every figure on it. */
export const SOURCES_ANCHOR = 'sources';
