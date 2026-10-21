// /.well-known/ard.json — Agentic Resource Discovery manifest
// (https://agenticresourcediscovery.org/how_to_publish/). It lists the one
// agentic resource this site really has: the public, read-only JSON API that
// /openapi.json describes. No MCP server, agent or skill exists, so none is listed.
import type { APIRoute } from 'astro';
import { business } from './business';
import { abs } from './urls';

export const GET: APIRoute = () =>
  new Response(
    JSON.stringify(
      {
        entries: [
          {
            identifier: 'urn:air:automancer.uk:api:public-data',
            displayName: `${business.tradingName} public data API`,
            type: 'application/vnd.oai.openapi+json',
            url: abs('/openapi.json'),
            description:
              'Read-only, key-free JSON facts about Automancer Ltd: business details, services with published from-prices, case studies, field notes and every page.',
            capabilities: ['business', 'services', 'case-studies', 'field-notes', 'pages', 'claims', 'stability'],
            representativeQueries: [
              'what does Automancer charge for a workflow automation sprint',
              'what services does Automancer Ltd offer',
              'show Automancer case studies with their published results',
              'how do I contact Automancer about automating admin work',
            ],
          },
        ],
      },
      null,
      2
    ) + '\n',
    { headers: { 'Content-Type': 'application/json; charset=utf-8' } }
  );
