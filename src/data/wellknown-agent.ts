// Agent-facing capability manifest — the ONE payload behind BOTH routes:
//
//   /agent.json                 (src/pages/agent.json.ts — SERVED by GitHub Pages)
//   /.well-known/agent.json     (injected in astro.config.mjs — standardised location)
//
// Until 22 Oct 2026 the deploy dropped dot-prefixed paths from its upload (measured live 2026-08-22,
// with .nojekyll present), so /agent.json is the canonical copy agents can
// actually fetch; the /.well-known/ route stays emitted for when the host
// supports it. The manifest deliberately contains NO self-URL: both routes
// serve these exact bytes, so a self-reference could not be correct for both.
// Generated from the same single sources as the HTML site: business facts,
// the API surface and the build timestamp, so it cannot drift from what is
// actually served.
import type { APIRoute } from 'astro';
import { business } from './business';
import { build } from './build';
import { abs } from './urls';
import { API_ENDPOINTS } from './api';

const api = (path: string, description: string) => ({
  path,
  url: `${business.url}${path}`,
  description,
});

const agentManifestBody = {
  schemaVersion: '1.0',
  lastUpdated: build.time.toISOString(),
  name: business.tradingName,
  legalName: business.legalName,
  description: business.description,
  url: business.url,
  contact: {
    email: business.email,
    phone: business.phone,
    phoneNote: 'Voicemail line — messages reach a human (Waseem), not a bot menu.',
    webForm: abs('/contact'),
    formNote:
      'The form requires JavaScript and a browser security check; agents should prefer email.',
    responseTime: 'We promise a meeting within one week of first contact.',
  },
  // Everything an agent can fetch without JavaScript or credentials.
  machineReadable: {
    discoveryDocument: { url: `${business.url}/api/index.json`, description: 'Lists every JSON endpoint below with descriptions.' },
    developerDocs: {
      url: abs('/developers'),
      description: 'Human-readable guide to every endpoint, Markdown twin, feed and manifest, with example requests.',
    },
    openApiSpec: {
      url: abs('/openapi.json'),
      specVersion: '3.1.0',
      description:
        'OpenAPI 3.1 specification of every JSON endpoint — unique operationIds and typed response schemas, suitable for LLM function calling.',
    },
    // Every endpoint the discovery document lists, from the same registry.
    endpoints: API_ENDPOINTS.filter((e) => e.path !== '/api/index.json').map((e) => api(e.path, e.summary)),
    markdownTwins: {
      convention:
        'Every content page is also available as clean Markdown with YAML front matter at the same path plus ".md" (for example /about/ -> /about.md).',
      indexPage: `${business.url}/index.md`,
    },
    fullText: [
      { path: '/llms.txt', url: `${business.url}/llms.txt`, description: 'Plain-text guide to the site for LLMs and agents.' },
      { path: '/llms-full.txt', url: `${business.url}/llms-full.txt`, description: 'The complete site content in one plain-text file.' },
    ],
    feeds: [
      { title: 'Field notes (RSS 2.0)', path: '/field-notes/rss.xml' },
      { title: 'Field notes (JSON Feed 1.1)', path: '/field-notes/feed.json' },
      { title: 'Case studies (RSS 2.0)', path: '/work/rss.xml' },
      { title: 'Case studies (JSON Feed 1.1)', path: '/work/feed.json' },
    ].map((f) => ({ ...f, url: `${business.url}${f.path}` })),
    sitemap: `${business.url}/sitemap-index.xml`,
    structuredData: 'Every HTML page embeds one schema.org JSON-LD @graph with absolute @ids.',
    securityTxt: {
      url: `${business.url}/security.txt`,
      description: 'RFC 9116 security.txt: how to report security issues in this site or its content.',
    },
    legalPagesPolicy:
      'The bodies of /privacy/ and /terms/ are deliberately NOT mirrored in any machine-readable format (transcription drifts silently). Fetch those canonical HTML URLs for their current full text.',
  },
  policy: {
    crawling: 'Allowed and encouraged. robots.txt explicitly permits all well-behaved crawlers including AI crawlers; there are no Disallow rules for content.',
    rateLimits: 'No formal rate limit. This is a static site on GitHub Pages; keep requests modest and cache responses — payloads change only at deploy time.',
    authentication: 'None. Every endpoint listed here is public, static and key-free.',
    cost: 'Free to read. No paid API tier exists.',
    stability:
      'Endpoints are generated at build time from the same sources as the HTML pages; within a schemaVersion at a given path, changes are additive only. The full promise — stable paths, operation ids, service ids and field names, what may change without notice, and the minimum notice a removal gets — is published as data at ' +
      business.url +
      '/api/stability.json.',
  },
  permissions: {
    statement:
      'You may read, index, summarise and quote this content with attribution to Automancer Ltd. Wholesale republication of site content as your own is not permitted without written permission — consistent with our website terms at /terms/.',
    allowed: ['read', 'index', 'summarise', 'quote-with-attribution'],
    requiresPermission: ['wholesale-republication'],
    prohibited: [
      'representing this business or its content as your own',
      'using contact details for unsolicited marketing to us',
    ],
  },
};

/** Render the manifest as the HTTP response both routes serve. */
export function renderAgentManifest(): Response {
  return new Response(JSON.stringify(agentManifestBody, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

// /.well-known/agent.json — injected as a route in astro.config.mjs because
// Astro's page scanner ignores dotted directories.
export const GET: APIRoute = () => renderAgentManifest();
