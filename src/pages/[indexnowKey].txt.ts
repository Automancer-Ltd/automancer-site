// /<key>.txt: the IndexNow key file (t26811). Search engines fetch it to check that whoever
// announces automancer.uk's changed pages (ops/indexnow.mjs, run by each deploy) can publish files
// here. It holds the key and nothing else; the key is public by design.
import type { APIRoute, GetStaticPaths } from 'astro';
import { INDEXNOW_KEY } from '../../ops/indexnow.mjs';

export const getStaticPaths: GetStaticPaths = () => [{ params: { indexnowKey: INDEXNOW_KEY } }];

export const GET: APIRoute = () =>
  new Response(`${INDEXNOW_KEY}\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
