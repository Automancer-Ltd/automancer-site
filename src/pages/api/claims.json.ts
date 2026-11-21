import type { APIRoute } from 'astro';
import { publishedClaims } from '../../data/claims';
import { claimEvidenceUrls } from '../../data/site-content';

export const GET: APIRoute = async () => {
  // evidenceUrl (t23577): the line a person reads for the same claim, so both views point at one place.
  const urls = await claimEvidenceUrls();
  return new Response(JSON.stringify({
    schemaVersion: '1.0',
    source: 'Automancer BD truth-layer claims registry',
    claims: publishedClaims.map((claim) => ({ ...claim, evidenceUrl: urls.get(claim.id) })),
  }, null, 2) + '\n', { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
