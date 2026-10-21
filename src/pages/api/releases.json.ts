// Every release of this site, newest first — read from CHANGELOG.md through
// src/data/releases.ts, the same module /releases and /releases.md render.
import type { APIRoute } from 'astro';
import { getReleases } from '../../data/releases';
import { abs } from '../../data/urls';
import { build } from '../../data/build';

export const GET: APIRoute = async () => {
  const releases = await getReleases();
  const payload = {
    schemaVersion: '1.0',
    generatedAt: build.time.toISOString(),
    url: abs('/api/releases.json'),
    page: abs('/releases/'),
    count: releases.length,
    releases: releases.map(({ version, date, summary, notes, url }) => ({ version, date, summary, notes, url })),
  };
  return new Response(JSON.stringify(payload, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
