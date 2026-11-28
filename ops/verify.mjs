// The repository's verdict on the working tree (t28204). `pnpm run verify` (what CI, the deploy and
// the preview gate run) and `pnpm run check` (the quick loop) are both this script.
//
//   node ops/verify.mjs           lint, TypeScript, the production-shaped build, then the dist/
//                                 audit (Vitest) with Astro's check of .astro files beside it
//   node ops/verify.mjs --quick   lint, TypeScript and the audit, without astro check; builds only
//                                 when dist/ is missing or older than a file the build reads, so it
//                                 never audits a dist/ your change did not make
//
// SKIP_BUILD=1 audits the dist/ already there, as the deploy does on the bytes it publishes.
//
// astro check only reads: the content types the build has just written to .astro/, and the source.
// Nothing after the build writes .astro/, so it runs beside the audit with --noSync. Beside the
// build instead, the build's own sync would rewrite the files it is reading.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditBuildEnv } from '../tests/support/build-env.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// Everything the build reads: a file here newer than dist/ means dist/ is not this tree's build.
const BUILD_INPUTS = ['src', 'public', 'ops', 'astro.config.mjs', 'package.json', 'pnpm-lock.yaml', 'tsconfig.json'];
const BIN = path.join(ROOT, 'node_modules', '.bin');
const env = { ...process.env, PATH: `${BIN}${path.delimiter}${process.env.PATH ?? ''}` };

/** Runs a command; resolves to its exit code. `quiet` keeps its output to print later. */
function run(command, args, { extraEnv = {}, quiet = false } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env: { ...env, ...extraEnv },
      stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
    let output = '';
    if (quiet) for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => (output += chunk));
    child.on('error', (error) => resolve({ code: 1, output: `${output}${error.message}\n` }));
    child.on('close', (code, signal) => resolve({ code: code ?? (signal ? 1 : 0), output }));
  });
}

async function step(command, args, extraEnv = {}) {
  const { code } = await run(command, args, { extraEnv });
  if (code !== 0) process.exit(code);
}

/** Newest modification time under `entry`, in milliseconds (0 when it does not exist). */
function newest(entry) {
  let stat;
  try {
    stat = fs.statSync(entry);
  } catch {
    return 0;
  }
  if (!stat.isDirectory()) return stat.mtimeMs;
  let latest = stat.mtimeMs;
  for (const name of fs.readdirSync(entry)) latest = Math.max(latest, newest(path.join(entry, name)));
  return latest;
}

/** Why dist/ is not this tree's build, or null when it is. */
function staleDist() {
  const built = newest(path.join(ROOT, 'dist', 'index.html'));
  if (built === 0) return 'there is no dist/';
  const changed = BUILD_INPUTS.find((entry) => newest(path.join(ROOT, entry)) > built);
  return changed ? `${changed} changed after dist/ was built` : null;
}

const quick = process.argv.includes('--quick');

await step('pnpm', ['run', 'lint']);
await step('pnpm', ['run', 'typecheck:ts']);

const skip = process.env.SKIP_BUILD === '1';
const why = skip ? null : quick ? staleDist() : 'verify always builds';
if (why) {
  if (quick) console.log(`\nverify: building first, because ${why}`);
  await step('pnpm', ['run', 'build'], auditBuildEnv(process.env));
} else if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) {
  console.error('verify: SKIP_BUILD=1, but there is no dist/ to audit');
  process.exit(1);
}

const types = quick ? null : run('astro', ['check', '--noSync'], { quiet: true });
const audit = await run('vitest', ['run'], { extraEnv: { SKIP_BUILD: '1' } });
let failed = audit.code !== 0;
if (types) {
  const { code, output } = await types;
  console.log(`\n$ astro check --noSync (ran beside the audit)\n${output.trimEnd()}`);
  failed ||= code !== 0;
}
process.exit(failed ? 1 : 0);
