#!/usr/bin/env node
// Ask an edge Worker the same awkward questions and print what it answered, one JSON line each.
//
//   node ops/edge/probe-matrix.mjs <base-url> > answers.jsonl
//   node ops/edge/probe-matrix.mjs https://automancer-site-edge-probe.waseem-d97.workers.dev
//
// Diff two runs (the live Worker and a candidate on the probe, or the probe before and after an
// upload) to see every answer a Worker change moves. Bodies are compared by SHA-256, so a page
// that changes between runs (the footer's deploy clock) shows up: compare pages by status and
// headers, and twins, JSON and redirects by body too. Read-only: GET and HEAD, plus one POST to
// /api/ that the Worker refuses itself (405) before anything reaches the origin.
import { createHash } from 'node:crypto';

const base = process.argv[2]?.replace(/\/$/, '');
if (!base) {
  console.error('usage: probe-matrix.mjs <base-url>');
  process.exit(2);
}

const HTML = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
const MD = 'text/markdown';
const JSON_ = 'application/json';

/** [label, path, accept, method] */
const QUESTIONS = [
  ['home page', '/', HTML],
  ['home twin', '/', MD],
  ['page', '/services/', HTML],
  ['page twin', '/services/', MD],
  ['page without its slash', '/services', HTML],
  ['legacy URL', '/services.html', HTML],
  ['legacy URL, slash', '/about.html/', HTML],
  ['legacy URL, query with a space', '/services.html?utm_campaign=spring%20offer', HTML],
  ['legacy URL, query with an encoded ?', '/terms.html?q=a%3Fb', HTML],
  ['legacy URL, query with + and an encoded +', '/book.html?a=b+c&d=e%2Bf', HTML],
  ['legacy URL, non-ASCII query', '/privacy.html?q=%E2%9C%93', HTML],
  ['double slash at the start', '//services/', HTML],
  ['double slash at the start, twin', '//services/', MD],
  ['double slash at the end', '/services//', HTML],
  ['double slash in the API', '/api//index.json', JSON_],
  ['percent-encoded letter', '/fie%6cd-notes/', HTML],
  ['encoded @ in a missing path', '/a%40b', HTML],
  ['query with a space on a page', '/services/?q=a%20b', HTML],
  ['missing page', '/nope/', HTML],
  ['missing page as Markdown', '/nope/', MD],
  ['missing API file', '/api/nope.json', JSON_],
  ['API file', '/api/services.json', JSON_],
  ['API write', '/api/services.json', JSON_, 'POST'],
  ['API catalog', '/.well-known/api-catalog', '*/*'],
  ['HEAD on a page', '/about/', HTML, 'HEAD'],
  ['HEAD on a twin', '/about/', MD, 'HEAD'],
  ['fingerprinted asset lifetime', '/assets/js/main.js?v=0000000', '*/*', 'HEAD'],
  ['image lifetime', '/assets/images/logo.svg', '*/*', 'HEAD'],
];

const KEEP = ['content-type', 'location', 'content-location', 'cache-control', 'vary', 'link', 'allow',
  'strict-transport-security', 'x-content-type-options', 'referrer-policy', 'content-security-policy', 'permissions-policy',
  'cross-origin-opener-policy', 'nel', 'report-to', 'reporting-endpoints'];

for (const [label, path, accept, method = 'GET'] of QUESTIONS) {
  const started = performance.now();
  const res = await fetch(base + path, { method, redirect: 'manual', headers: { Accept: accept } });
  const body = Buffer.from(await res.arrayBuffer());
  const headers = Object.fromEntries(KEEP.filter((h) => res.headers.has(h)).map((h) => [h, res.headers.get(h)]));
  console.log(JSON.stringify({
    label, method, path, accept, status: res.status, headers,
    bodySha256: createHash('sha256').update(body).digest('hex').slice(0, 16), bodyBytes: body.length,
    ms: Math.round(performance.now() - started),
  }));
}
