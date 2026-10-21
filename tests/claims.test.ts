import { describe, expect, it } from 'vitest';
import { readDistFile } from './support/dist';

describe('/api/claims.json — headline figures trace to truth-layer records', () => {
  const claims = JSON.parse(readDistFile('api/claims.json') ?? 'null');
  const studies = JSON.parse(readDistFile('api/case-studies.json') ?? 'null');

  it('publishes every numeric stat on the flagship case study with a registry entry', () => {
    expect(claims?.source).toBe('Automancer BD truth-layer claims registry');
    const byId = new Map(claims.claims.map((claim: { id: string }) => [claim.id, claim]));
    const care = studies.caseStudies.find((study: { slug: string }) => study.slug === 'care-provider-transformation');
    expect(care, 'published care-provider case study missing').toBeTruthy();
    const expected = [
      ['carer_record_count', '294'], ['service_user_record_count', '293'],
      ['supervision_schedule_count', '588'], ['identity_matching_auto_resolved', '274 / 418'],
      ['infrastructure_audit_result', '0 / 0'],
    ] as const;
    for (const [id, headline] of expected) {
      const claim = byId.get(id) as { value: string; evidenceRecord: string; registry: string; sourceQuote: string } | undefined;
      expect(claim, `headline ${headline} has no truth-layer claim entry`).toBeTruthy();
      expect(claim!.evidenceRecord).toContain('automancer-bd:docs/case-study-dossier.md');
      expect(claim!.registry).toContain('automancer-bd:data/claims.toml');
      expect(claim!.sourceQuote.length, `${id} has no evidence quote`).toBeGreaterThan(0);
      expect(care.stats.some((stat: { value: string }) => stat.value.includes(headline)), `${headline} is not a rendered headline statistic`).toBe(true);
    }
  });
});
