import { describe, expect, it } from 'vitest';
import { readDistFile } from './support/dist';

describe('/api/claims.json — headline figures trace to truth-layer records', () => {
  const claims = JSON.parse(readDistFile('api/claims.json') ?? 'null');
  const studies = JSON.parse(readDistFile('api/case-studies.json') ?? 'null');

  // Each published case study's numeric headline stats, keyed by slug: the
  // part of the rendered stat value a registry claim covers, and that claim.
  const expected: Record<string, [claimId: string, inStat: string][]> = {
    'care-provider-transformation': [
      ['carer_record_count', '294'], ['service_user_record_count', '293'],
      ['supervision_schedule_count', '588'], ['identity_matching_auto_resolved', '274 / 418'],
      ['infrastructure_audit_result', '0 / 0'],
    ],
    'debiaser-ai-product': [
      ['debiaser_per_engagement_cost', '£300–400'], ['debiaser_self_service_cost', '£10–80'],
      ['debiaser_hourly_rate_range', '£100–200'], ['debiaser_live_since', '12 Jun 2026'],
    ],
    'manufacturer-trade-portal': [['iq_mouldings_phase_status', 'Apr 2026']],
  };
  // Rendered numbers whose source is in the evidence record but which have no
  // registry entry yet in automancer-bd data/claims.toml. Shrink, never grow.
  const awaitingRegistry: Record<string, string[]> = {
    'manufacturer-trade-portal': ['5 units'],
  };

  it('publishes every mapped headline stat with a registry entry', () => {
    expect(claims?.source).toBe('Automancer BD truth-layer claims registry');
    const byId = new Map(claims.claims.map((claim: { id: string }) => [claim.id, claim]));
    for (const [slug, entries] of Object.entries(expected)) {
      const study = studies.caseStudies.find((s: { slug: string }) => s.slug === slug);
      expect(study, `published case study ${slug} missing`).toBeTruthy();
      for (const [id, inStat] of entries) {
        const claim = byId.get(id) as { value: string; evidenceRecord: string; registry: string; sourceQuote: string } | undefined;
        expect(claim, `${slug}: headline ${inStat} has no truth-layer claim entry`).toBeTruthy();
        expect(claim!.evidenceRecord).toContain('automancer-bd:docs/case-study-dossier.md');
        expect(claim!.registry).toContain('automancer-bd:data/claims.toml');
        expect(claim!.sourceQuote.length, `${id} has no evidence quote`).toBeGreaterThan(0);
        expect(study.stats.some((stat: { value: string }) => stat.value.includes(inStat)), `${slug}: ${inStat} is not a rendered headline statistic`).toBe(true);
      }
    }
  });

  it('leaves no numeric headline stat on any case study without a claim', () => {
    for (const study of studies.caseStudies as { slug: string; stats: { value: string }[] }[]) {
      const covered = [...(expected[study.slug] ?? []).map(([, inStat]) => inStat), ...(awaitingRegistry[study.slug] ?? [])];
      for (const { value } of study.stats.filter((stat) => /\d/.test(stat.value))) {
        expect(
          covered.some((inStat) => value.includes(inStat)),
          `${study.slug}: headline stat "${value}" has no claims.json entry — add it to automancer-bd data/claims.toml, then src/data/claims.ts`
        ).toBe(true);
      }
    }
  });
});
