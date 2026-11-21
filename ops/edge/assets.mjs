#!/usr/bin/env node
// Upload a built dist/ as a Worker's static assets (Workers Static Assets, t23645) and print the
// completion token that ops/edge/deploy.sh attaches to the Worker version it creates.
//
//   node ops/edge/assets.mjs <dist> <executor-account> <cloudflare-account> <script>
//
// Three steps (developers.cloudflare.com/workers/static-assets/direct-upload/):
//   1. the manifest (every file's path, size and hash) opens an upload session through Executor
//      (`cloudflare-full-access`, no local token); Cloudflare answers which files it lacks;
//   2. those files go straight to Cloudflare in buckets, authorised by the session's one-hour
//      upload token, each with the Content-Type GitHub Pages serves it with (TYPES in local.mjs),
//      so a file reads the same from either origin;
//   3. the last upload's answer (or the session's, when nothing was missing) is the completion
//      token, printed on stdout for deploy.sh and nowhere else.
// Every file in dist/ is listed every time: a version's assets are exactly its manifest.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { TYPES } from './local.mjs';

/** Every file under `dist`, keyed by its path on the site ("/services/index.html"). */
export function assetManifest(dist) {
  const root = path.resolve(dist);
  const files = new Map();
  for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const full = path.join(entry.parentPath, entry.name);
    const key = '/' + path.relative(root, full).split(path.sep).join('/');
    const bytes = readFileSync(full);
    // Cloudflare's hash: SHA-256 of the base64 content and the extension, first 32 hex digits.
    const hash = createHash('sha256').update(bytes.toString('base64') + path.extname(key).slice(1)).digest('hex').slice(0, 32);
    files.set(key, { hash, size: bytes.length, bytes, type: TYPES[path.extname(key)] ?? 'application/octet-stream' });
  }
  return files;
}

function executor(toolPath, input) {
  const run = spawnSync('executor-tool', ['call', toolPath, '-', '--no-redact'], { input: JSON.stringify(input), encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`executor-tool ${toolPath} exited ${run.status}: ${run.stderr.slice(0, 500)}`);
  return JSON.parse(run.stdout);
}

async function main() {
  const [dist, executorAccount, cfAccount, script] = process.argv.slice(2);
  if (!script) {
    console.error('usage: assets.mjs <dist> <executor-account> <cloudflare-account> <script>');
    process.exit(2);
  }
  const files = assetManifest(dist);
  const manifest = Object.fromEntries([...files].map(([key, f]) => [key, { hash: f.hash, size: f.size }]));
  const session = executor('tools["cloudflare-full-access"].api.workerScript.workerScriptUpdateCreateAssetsUploadSession', {
    accountId: executorAccount,
    input: { path: { account_id: cfAccount, script_name: script }, contentType: 'application/json', body: { manifest } },
  });
  if (!session?.success || !session.result?.jwt) throw new Error(`upload session refused: ${JSON.stringify(session?.errors ?? session).slice(0, 500)}`);
  const byHash = new Map([...files.values()].map((f) => [f.hash, f]));
  const buckets = session.result.buckets ?? [];
  let token = session.result.jwt;
  let sent = 0;
  for (const bucket of buckets) {
    const form = new FormData();
    for (const hash of bucket) {
      const f = byHash.get(hash);
      form.append(hash, new File([f.bytes.toString('base64')], hash, { type: f.type }));
      sent += 1;
    }
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${cfAccount}/workers/assets/upload?base64=true`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.result.jwt}` },
      body: form,
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.success) throw new Error(`asset upload answered HTTP ${res.status}: ${JSON.stringify(body?.errors ?? body).slice(0, 500)}`);
    if (body.result?.jwt) token = body.result.jwt;
  }
  console.error(`assets: ${files.size} files in the manifest, ${sent} uploaded in ${buckets.length} bucket(s)`);
  process.stdout.write(token);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(String(err?.message ?? err));
    process.exit(1);
  });
}
