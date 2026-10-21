import type { APIRoute } from 'astro';
import { publishedClaims } from '../../data/claims';

export const GET: APIRoute = () => new Response(JSON.stringify({
  schemaVersion: '1.0',
  source: 'Automancer BD truth-layer claims registry',
  claims: publishedClaims,
}, null, 2) + '\n', { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
