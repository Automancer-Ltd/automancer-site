import { describe, expect, it } from 'vitest';
import { parse } from 'node-html-parser';
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
    'manufacturer-trade-portal': [
      ['manufacturer_portal_phase_status', 'Apr 2026'], ['manufacturer_portal_pricing_units', '5 units'],
    ],
  };
  // Rendered numbers whose source is in the evidence record but which have no
  // registry entry yet in automancer-bd data/claims.toml. Shrink, never grow.
  const awaitingRegistry: Record<string, string[]> = {};

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
        const stat = study.stats.find((st: { value: string }) => st.value.includes(inStat));
        expect(stat, `${slug}: ${inStat} is not a rendered headline statistic`).toBeTruthy();
        expect(stat.claims, `${slug}: ${inStat} does not name claim ${id} in /api/case-studies.json`).toContain(id);
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

  // t23334: a person reads the same evidence a machine is given. Every figure with a claim links
  // to its line under "Where these numbers come from", which quotes each claim's sourceQuote word
  // for word; the Markdown twin carries the same lines; a figure without one gets no link.
  const quote = (id: string) => (byIdQuote.get(id) ?? '').replace(/\*\*/g, '');
  const byIdQuote = new Map<string, string>((claims?.claims ?? []).map((c: { id: string; sourceQuote: string }) => [c.id, c.sourceQuote]));
  const words = (t: string) => t.replace(/\s+/g, ' ').trim();

  it('shows people the evidence line behind every sourced figure, as /api/claims.json gives machines', () => {
    let sourced = 0;
    for (const study of studies.caseStudies as { slug: string; stats: { value: string; claims: string[] }[] }[]) {
      const html = readDistFile(`work/${study.slug}/index.html`);
      expect(html, `work/${study.slug}/ not built`).toBeTruthy();
      const doc = parse(html!);
      const cells = doc.querySelectorAll('.statband .stat');
      expect(cells.length).toBe(study.stats.length);
      study.stats.forEach((stat, i) => {
        const cell = cells[i]!;
        expect(words(cell.querySelector('.stat__v')!.text)).toBe(stat.value);
        const link = cell.querySelector('a.stat__src');
        if (stat.claims.length === 0) {
          expect(link, `${study.slug}: "${stat.value}" has no claim but links to a source`).toBeNull();
          return;
        }
        sourced++;
        expect(link, `${study.slug}: "${stat.value}" has claims but no Source link`).toBeTruthy();
        const target = link!.getAttribute('href')!.slice(1);
        const item = doc.querySelector(`.evidence__item[id="${target}"]`);
        expect(item, `${study.slug}: Source for "${stat.value}" points at #${target}, which is not on the page`).toBeTruthy();
        expect(words(item!.querySelector('.evidence__fig strong')!.text)).toBe(stat.value);
        const quoted = item!.querySelectorAll('.evidence__quote').map((q) => words(q.text));
        for (const id of stat.claims) expect(quoted, `${study.slug}: ${id}'s evidence missing under "${stat.value}"`).toContain(`“${words(quote(id))}”`);
      });
      const twin = readDistFile(`work/${study.slug}.md`) ?? '';
      const hasSources = study.stats.some((stat) => stat.claims.length > 0);
      expect(twin.includes('## Where these numbers come from'), `${study.slug}.md`).toBe(hasSources);
      expect(doc.querySelector('#sources-title') !== null, `work/${study.slug}/`).toBe(hasSources);
      for (const stat of study.stats) for (const id of stat.claims) expect(twin, `${study.slug}.md lacks ${id}'s line`).toContain(`> “${quote(id)}”`);
    }
    expect(sourced, 'no case study shows a sourced figure').toBeGreaterThanOrEqual(10);
  });
});

