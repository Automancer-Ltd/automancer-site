// Service offerings with published from-prices — same array the /services
// page pricing derives from.
import type { APIRoute } from 'astro';
import { services } from '../../data/business';
import { build } from '../../data/build';
import { abs } from '../../data/urls';

export const GET: APIRoute = () =>
  new Response(
    JSON.stringify(
      {
        schemaVersion: '1.0',
        generatedAt: build.time.toISOString(),
        currency: 'GBP',
        note: 'All prices are "from" prices in GBP, as published on https://automancer.uk/services',
        services: services.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          includes: s.includes,
          priceFrom: s.priceFrom,
          priceCurrency: 'GBP',
          priceUnit: s.priceUnit,
          url: abs('/services'),
        })),
      },
      null,
      2
    ) + '\n',
    { headers: { 'Content-Type': 'application/json; charset=utf-8' } }
  );
