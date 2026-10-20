// What machines may rely on: the published stability & deprecation policy.
//
// Generated from src/data/stability.ts — the same module that supplies the
// OpenAPI schema and the /developers wording — so the promise cannot be
// described two ways, and the paths and service ids it covers are read from
// the modules that actually serve them.
import type { APIRoute } from 'astro';
import { stabilityPolicy } from '../../data/stability';

export const GET: APIRoute = () =>
  new Response(JSON.stringify(stabilityPolicy(), null, 2) + '\n', {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
