// security.txt — RFC 9116 responsible-disclosure file.
//
// The ONE payload behind BOTH routes:
//
//   /security.txt               (src/pages/security.txt.ts — SERVED by GitHub Pages)
//   /.well-known/security.txt   (injected in astro.config.mjs — standardised location)
//
// Until 22 Oct 2026 the deploy dropped dot-prefixed paths from its upload (measured live 2026-08-22,
// with .nojekyll present), so /security.txt is where the file actually
// resolves; the /.well-known/ route stays emitted for when the host supports
// it. Canonical MUST name a URL the file is really served from (RFC 9116
// §3), so it points at /security.txt: a Canonical resolving to a 404 makes
// the whole document non-conformant.
//
// Expires is REQUIRED by RFC 9116 and is generated at build time (~1 year
// out), so it never goes stale silently.
import type { APIRoute } from 'astro';
import { business } from './business';
import { build } from './build';

/** The RFC 9116 field set, shared by both routes — build it exactly once here. */
export function securityTxt(): string {
  const expires = new Date(build.time);
  expires.setUTCFullYear(expires.getUTCFullYear() + 1);

  const lines = [
    `Contact: mailto:${business.email}`,
    `Expires: ${expires.toISOString()}`,
    'Preferred-Languages: en',
    `Canonical: ${new URL('/security.txt', business.url).toString()}`,
  ];

  return lines.join('\n') + '\n';
}

/** Render security.txt as the HTTP response both routes serve. */
export function renderSecurityTxt(): Response {
  return new Response(securityTxt(), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

// /.well-known/security.txt — injected as a route in astro.config.mjs because
// Astro's page scanner ignores dotted directories.
export const GET: APIRoute = () => renderSecurityTxt();
