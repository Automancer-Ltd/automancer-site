/** Public claim provenance copied only from the Automancer BD truth-layer registry. */
const truthLayer = 'Automancer-Ltd/automancer-bd:data/claims.toml';
const evidence = 'Automancer-Ltd/automancer-bd:docs/case-study-dossier.md';

export const publishedClaims = [
  { id: 'care_provider_size', value: 'a ~600-person supported-living care provider', evidenceRecord: evidence, registry: truthLayer, sourceQuote: '~100 office staff + ~500 support workers (~600 potential learners, per LMS requirements spec); M365 tenant shows 143 users / 81 groups / 20 SharePoint sites; 3 branches (Bradford primary, Birmingham, Worcester).' },
  { id: 'governed_workstream_count', value: '~18 governed workstreams', evidenceRecord: evidence, registry: truthLayer, sourceQuote: "Automancer's flagship account: a whole-business digital transformation delivered as ~18 governed workstreams, several already live in production." },
  { id: 'carer_record_count', value: '294 carers imported as clean canonical records', evidenceRecord: evidence, registry: truthLayer, sourceQuote: 'roster import created **294 carers + 293 service users** as canonical records from real client CSVs' },
  { id: 'service_user_record_count', value: '293 service users imported as clean canonical records', evidenceRecord: evidence, registry: truthLayer, sourceQuote: 'roster import created **294 carers + 293 service users** as canonical records from real client CSVs' },
  { id: 'identity_matching_auto_resolved', value: '274 of 418 duplicate-review candidates auto-resolved', evidenceRecord: evidence, registry: truthLayer, sourceQuote: 'identity matching **auto-resolved 274 of 418 review candidates**' },
  { id: 'supervision_schedule_count', value: '588 supervision schedules created automatically', evidenceRecord: evidence, registry: truthLayer, sourceQuote: '**588 supervision/spot-check schedules instantiated automatically**' },
  { id: 'infrastructure_audit_result', value: '0 failures, 0 warnings across every layer', evidenceRecord: evidence, registry: truthLayer, sourceQuote: 'Documented audits: **0 failures, 0 warnings across every layer**.' },
  { id: 'debiaser_hourly_rate_range', value: '£100–200/hour consultant review time', evidenceRecord: evidence, registry: truthLayer, sourceQuote: 'replaces **hours of consultant review at £100–200/hour (~£300–400/engagement) with a self-service task costing £10–80, completed in minutes**' },
  { id: 'debiaser_per_engagement_cost', value: '~£300–400 per consultant engagement', evidenceRecord: evidence, registry: truthLayer, sourceQuote: 'replaces **hours of consultant review at £100–200/hour (~£300–400/engagement) with a self-service task costing £10–80, completed in minutes**' },
  { id: 'debiaser_self_service_cost', value: '£10–80 per self-service document review', evidenceRecord: evidence, registry: truthLayer, sourceQuote: 'replaces **hours of consultant review at £100–200/hour (~£300–400/engagement) with a self-service task costing £10–80, completed in minutes**' },
  { id: 'debiaser_live_since', value: 'live in production since 12 June 2026', evidenceRecord: evidence, registry: truthLayer, sourceQuote: 'live in production since 12 Jun 2026 (v1.0)' },
  { id: 'iq_mouldings_phase_status', value: 'Phase 1 signed off April 2026', evidenceRecord: evidence, registry: truthLayer, sourceQuote: 'Phase 1 signed off (Apr 2026) as "usable foundation", staged for client review — not yet full production launch.' },
  { id: 'iq_mouldings_pricing_units', value: '5 units', evidenceRecord: evidence, registry: truthLayer, sourceQuote: 'a multi-unit pricing matrix (feet/metres/sqft/sqm/each) with bulk reprice' },
] as const;
