// /security.txt — the SERVED copy of the RFC 9116 security.txt file.
//
// Until 22 Oct 2026 the deploy dropped dot-prefixed paths from its upload (measured live 2026-08-22:
// /.well-known/security.txt returns 404 in production even with .nojekyll
// in the artifact), so this non-dot route is where the file actually
// resolves — and it is therefore the URL the Canonical field names. Both
// this route and /.well-known/security.txt render from the single field
// builder in src/data/wellknown-security.ts, so the two copies cannot drift.
import type { APIRoute } from 'astro';
import { renderSecurityTxt } from '../data/wellknown-security';

export const GET: APIRoute = () => renderSecurityTxt();
