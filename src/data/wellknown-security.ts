// security.txt — RFC 9116 responsible-disclosure file.
//
// The ONE payload behind BOTH routes:
//
//   /security.txt               (src/pages/security.txt.ts — SERVED by GitHub Pages)
//   /.well-known/security.txt   (injected in astro.config.mjs — standardised location)
//
// Until 22 Oct 2026 the deploy dropped dot-prefixed paths from its upload (measured live 2026-08-22,
// with .nojekyll present), so /security.txt was where the file resolved; both routes are served
// since then. RFC 9116 §2.5.2: a file fetched from a URI that no Canonical field lists "SHOULD NOT
// be trusted", and /.well-known/security.txt is where every scanner and researcher looks first. It
// named only /security.txt until t23673 (internet.nl reported it as an error), so there is one
// Canonical line for each URL the file is served at, the standard location first.
// Expires is REQUIRED by RFC 9116 and is generated at build time (~1 year
// out), so it never goes stale silently.
import type { APIRoute } from 'astro';
import { business } from './business';
import { build } from './build';

/** Every path the file is served at; each is a Canonical field. */
export const SECURITY_TXT_PATHS = ['/.well-known/security.txt', '/security.txt'] as const;

/** The RFC 9116 field set, shared by both routes — build it exactly once here. */
export function securityTxt(): string {
  const expires = new Date(build.time);
  expires.setUTCFullYear(expires.getUTCFullYear() + 1);

  const lines = [
    `Contact: mailto:${business.email}`,
    `Expires: ${expires.toISOString()}`,
    'Preferred-Languages: en',
    ...SECURITY_TXT_PATHS.map((path) => `Canonical: ${new URL(path, business.url).toString()}`),
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
