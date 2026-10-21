// /agent.json — the SERVED copy of the agent capability manifest.
//
// Until 22 Oct 2026 the deploy dropped dot-prefixed paths from its upload (measured live 2026-08-22:
// /.well-known/agent.json returns 404 in production even with .nojekyll in
// the artifact), so this non-dot route is where agents can actually fetch
// the manifest. Both this route and /.well-known/agent.json render from the
// single payload builder in src/data/wellknown-agent.ts, so the two copies
// cannot drift.
import type { APIRoute } from 'astro';
import { renderAgentManifest } from '../data/wellknown-agent';

export const GET: APIRoute = () => renderAgentManifest();
