// /.well-known/api-catalog — RFC 9727 API catalog: a linkset (RFC 9264)
// pointing at the one API this site publishes, its OpenAPI description,
// its human documentation and its stability policy.
import type { APIRoute } from 'astro';
import { abs } from './urls';

export const GET: APIRoute = () =>
  new Response(
    JSON.stringify(
      {
        linkset: [
          {
            anchor: abs('/api/index.json'),
            'service-desc': [{ href: abs('/openapi.json'), type: 'application/vnd.oai.openapi+json' }],
            'service-doc': [{ href: abs('/developers'), type: 'text/html' }],
            'service-meta': [{ href: abs('/api/stability.json'), type: 'application/json' }],
          },
        ],
      },
      null,
      2
    ) + '\n',
    { headers: { 'Content-Type': 'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"' } }
  );
