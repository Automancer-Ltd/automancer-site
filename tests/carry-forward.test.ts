// A page kept from an earlier release still loads the files it names (t26531).
//
// The edge Worker serves a kept copy of a page for up to 7 days, so after a release a visitor can
// get a page whose <script src> and compression dictionary name files that release's build made.
// ops/carry-forward.mjs adds those files to each release from production. These tests run it
// against the built dist/ served through the edge Worker, as production serves it: without a
// ledger (the first release), with one (every release after), past its 8 days, and with
// production unreachable, when the release must still ship.
import { afterEach, describe, expect, it } from 'vitest';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { KEEP_DAYS, LEDGER_PATH, carryForward, checkCarried } from '../ops/carry-forward.mjs';
import { siteFromDist } from '../ops/edge/local.mjs';
import { DIST, allHtmlFiles } from './support/dist';

const FROM = 'https://automancer.uk';
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-11-25T18:00:00Z');
const quiet = () => {};

/** Production as `dir` serves it through the edge Worker, as fetch() sees it. */
const production = (dir: string) => {
  const site = siteFromDist(dir);
  return (input: URL | RequestInfo, init?: RequestInit) => site(new Request(input, init));
};

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A release's dist/ holding only what carrying reads: /_astro/, /_dictionary/ and a 404 page. */
function release(from: string, rename: (name: string) => string = (name) => name): string {
  const dir = mkdtempSync(join(tmpdir(), 'carry-'));
  made.push(dir);
  for (const sub of ['_astro', '_dictionary']) {
    mkdirSync(join(dir, sub));
    for (const name of readdirSync(join(from, sub))) {
      cpSync(join(from, sub, name), join(dir, sub, rename(name)));
    }
  }
  writeFileSync(join(dir, '404.html'), '<html>404</html>');
  return dir;
}

// What the built pages name: the page-load module and the dictionary every page carries.
const page = allHtmlFiles().find((p) => p.route === '/')!;
const moduleName = /\/_astro\/(BaseLayout[\w.-]+\.js)/.exec(page.html)![1];
const dictionaryName = /\/_dictionary\/([0-9a-f]{16}\.txt)/.exec(page.html)![1];
// Release n changed both, so it builds them under other names (release 0 is dist/ itself).
const moduleIn = (n: number) => (n ? moduleName.replace(/\.js$/, `v${n}.js`) : moduleName);
const dictionaryIn = (n: number) => (n ? `${String(n).repeat(16)}.txt` : dictionaryName);
const namesIn = (n: number) => (name: string) =>
  name.replace(moduleName, moduleIn(n)).replace(dictionaryName, dictionaryIn(n));
const at = (days: number) => new Date(NOW + days * DAY).toISOString();

describe('files an earlier release built stay served', () => {
  it('carries what production pages name when production has no list yet, as its own bytes', async () => {
    const next = release(DIST, namesIn(1));
    const result = await carryForward({ dist: next, from: FROM, now: NOW, fetcher: production(DIST), log: quiet });

    expect(result.source).toBe('pages');
    expect(result.carried.map((f) => f.path)).toEqual([`/_astro/${moduleName}`, `/_dictionary/${dictionaryName}`]);
    for (const file of result.carried) {
      const bytes = readFileSync(join(next, file.path));
      expect(bytes.equals(readFileSync(join(DIST, file.path))), file.path).toBe(true);
      // The Worker sends a Brotli browser the build's .br copy, so that comes too.
      expect(brotliDecompressSync(readFileSync(join(next, `${file.path}.br`))).equals(bytes), file.path).toBe(true);
    }
    const ledger = JSON.parse(readFileSync(join(next, LEDGER_PATH), 'utf8'));
    expect(ledger.keepDays).toBe(KEEP_DAYS);
    const retired = ledger.files.filter((f: { retired: string | null }) => f.retired).map((f: { path: string }) => f.path);
    expect(retired).toEqual(result.carried.map((f) => f.path));
    expect(ledger.files.length).toBe(result.built.length + result.carried.length);
    expect(brotliDecompressSync(readFileSync(join(next, `${LEDGER_PATH}.br`))).toString()).toBe(readFileSync(join(next, LEDGER_PATH), 'utf8'));

    // Served as production would serve it, the old page's files answer again.
    const site = production(next);
    for (const path of [`/_astro/${moduleName}`, `/_dictionary/${dictionaryName}`]) {
      expect((await site(`${FROM}${path}`)).status, path).toBe(200);
      expect((await production(release(DIST, namesIn(1)))(`${FROM}${path}`)).status, `${path} without carrying`).toBe(404);
    }
    expect(await checkCarried({ from: FROM, fetcher: site })).toMatchObject({ failed: [], carried: 2 });
  });

  it('keeps carrying from the list for 8 days after a file stopped being built, then drops it', async () => {
    const second = release(DIST, namesIn(1));
    await carryForward({ dist: second, from: FROM, now: NOW, fetcher: production(DIST), log: quiet });
    // Two days later a third release changes both again: it carries the second's and keeps the first's.
    const third = release(DIST, namesIn(2));
    const soon = await carryForward({ dist: third, from: FROM, now: NOW + 2 * DAY, fetcher: production(second), log: quiet });
    expect(soon.source).toBe('ledger');
    expect(Object.fromEntries(soon.carried.map((f) => [f.path, f.retired]))).toEqual({
      // Retired at the second release: its date is kept, not reset.
      [`/_astro/${moduleIn(0)}`]: at(0),
      [`/_dictionary/${dictionaryIn(0)}`]: at(0),
      [`/_astro/${moduleIn(1)}`]: at(2),
      [`/_dictionary/${dictionaryIn(1)}`]: at(2),
    });

    // Eight days after the second release, its predecessor's files are no longer carried.
    const fourth = release(DIST, namesIn(3));
    const late = await carryForward({ dist: fourth, from: FROM, now: NOW + KEEP_DAYS * DAY, fetcher: production(third), log: quiet });
    expect(late.carried.map((f) => f.path)).toEqual([
      `/_astro/${moduleIn(1)}`, `/_astro/${moduleIn(2)}`, `/_dictionary/${dictionaryIn(1)}`, `/_dictionary/${dictionaryIn(2)}`,
    ]);
    expect(existsSync(join(fourth, '_astro', moduleIn(0)))).toBe(false);
  });

  it('never replaces a file the release built itself', async () => {
    const next = release(DIST);
    const result = await carryForward({ dist: next, from: FROM, now: NOW, fetcher: production(DIST), log: quiet });
    expect(result.carried).toEqual([]);
    expect(readFileSync(join(next, '_astro', moduleName)).equals(readFileSync(join(DIST, '_astro', moduleName)))).toBe(true);
  });

  it('still ships, carrying nothing and saying so, when production cannot be read', async () => {
    const next = release(DIST, namesIn(1));
    const said: string[] = [];
    const result = await carryForward({
      dist: next, from: FROM, now: NOW, log: (line: string) => said.push(line),
      fetcher: () => Promise.reject(new Error('connect ECONNREFUSED')),
    });
    expect(result).toMatchObject({ carried: [], source: null });
    expect(said.join('\n')).toMatch(/WARNING .*nothing carried/);
    expect(existsSync(join(next, LEDGER_PATH))).toBe(true);
    expect(existsSync(join(next, '_astro', moduleName))).toBe(false);
  });
});

