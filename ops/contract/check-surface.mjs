// Does this build keep every promise the served site makes to machines? (t25827)
//
// /api/stability.json promises that endpoint paths, operation ids, response field names, service
// ids, page URLs and enum values stay stable between deploys. This reads every one of those
// identifiers from the served site (the baseline) and fails when the candidate build no longer
// keeps one, unless a deprecation the baseline already announced has run its notice and passed
// its sunset (ops/contract/surface.mjs says what counts as kept). Additions always pass.
//
// usage, from the repository root, after a build:
//   node ops/contract/check-surface.mjs [--baseline=https://automancer.uk] [--candidate=dist]
//                                       [--allow-unreachable] [--json=<file>]
//
// --baseline is an origin (read over HTTPS, as an agent reads it) or a built dist/ directory (to
// compare two commits). CI runs it against production on every pull request; the deploy runs it
// again on the exact dist/ it publishes, with --allow-unreachable so a fix can still ship while
// production is down (it then prints a warning and says nothing was compared).
// Exit codes: 0 every promise kept, 1 a promise broken, 2 the baseline or candidate unreadable.
import fs from 'node:fs';
import path from 'node:path';
import { brokenPromises, countByKind, readSurface } from './surface.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : true;
};

/** A built dist/ directory, read the way GitHub Pages serves it. */
export function distReader(dir) {
  const root = path.resolve(dir);
  const file = (urlPath) => {
    const joined = path.join(root, decodeURIComponent(urlPath));
    if (!joined.startsWith(root)) return null;
    const candidates = urlPath.endsWith('/') ? [path.join(joined, 'index.html')] : [joined, path.join(joined, 'index.html'), `${joined}.html`];
    return candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile()) ?? null;
  };
  return {
    name: dir,
    read: async (urlPath) => {
      const hit = file(urlPath);
      return hit ? fs.readFileSync(hit, 'utf8') : null;
    },
    resolves: async (urlPath) => file(urlPath) !== null,
  };
}

/** A served origin, read as an agent reads it. Caches are bypassed with a query string. */
export function originReader(origin) {
  const base = origin.replace(/\/+$/, '');
  const bust = `contract=${Date.now()}`;
  const get = async (urlPath, method = 'GET') => {
    const url = `${base}${urlPath}${urlPath.includes('?') ? '&' : '?'}${bust}`;
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await fetch(url, { method, redirect: 'follow', signal: AbortSignal.timeout(20_000), headers: { 'user-agent': 'automancer-site contract check (ops/contract/check-surface.mjs)' } });
      } catch (error) {
        if (attempt >= 3) throw error;
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  };
  return {
    name: base,
    read: async (urlPath) => {
      const res = await get(urlPath);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`${base}${urlPath} answered ${res.status}`);
      return res.text();
    },
    resolves: async (urlPath) => (await get(urlPath)).ok,
  };
}

const looksLikeOrigin = (value) => /^https?:\/\//.test(value);
const readerFor = (value) => (looksLikeOrigin(value) ? originReader(value) : distReader(value));

async function main() {
  const baselineArg = String(flag('baseline', 'https://automancer.uk'));
  const candidateArg = String(flag('candidate', 'dist'));
  const allowUnreachable = flag('allow-unreachable', false) === true;
  const jsonOut = flag('json', null);

  const candidate = readerFor(candidateArg);
  let after;
  try {
    after = await readSurface(candidate);
  } catch (error) {
    console.error(`contract: cannot read the candidate ${candidateArg}: ${error.message}`);
    return 2;
  }

  let before;
  try {
    before = await readSurface(readerFor(baselineArg));
  } catch (error) {
    if (allowUnreachable) {
      console.log(`::warning title=Published contract not compared::${baselineArg} could not be read (${error.message}); this release was not checked against the promises it makes. The pull request's check was.`);
      return 0;
    }
    console.error(`contract: cannot read the baseline ${baselineArg}: ${error.message}`);
    return 2;
  }

  const broken = await brokenPromises(before, after, { resolves: candidate.resolves });
  const counts = countByKind(before);
  const added = [...after.promises.keys()].filter((key) => !before.promises.has(key));
  const summary = Object.entries(counts).map(([kind, n]) => `${n} ${kind}`).join(', ');

  console.log(`contract: ${before.promises.size} promises published by ${baselineArg} (${summary})`);
  console.log(`contract: ${candidateArg} adds ${added.length}${added.length ? `: ${added.slice(0, 12).join('; ')}${added.length > 12 ? '; …' : ''}` : ''}`);
  if (jsonOut) {
    fs.writeFileSync(String(jsonOut), `${JSON.stringify({ baseline: baselineArg, candidate: candidateArg, counts, promises: before.promises.size, added, broken }, null, 2)}\n`);
  }
  if (broken.length === 0) {
    console.log(`contract: ${candidateArg} keeps all ${before.promises.size}`);
    return 0;
  }
  console.error(`contract: ${candidateArg} breaks ${broken.length} published promise${broken.length === 1 ? '' : 's'} (/api/stability.json):`);
  for (const p of broken) {
    console.error(`  ✗ ${p.key}\n      ${p.why}`);
    if (process.env.GITHUB_ACTIONS) console.log(`::error title=Published promise broken::${p.key}: ${p.why}`);
  }
  return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await main();
}
