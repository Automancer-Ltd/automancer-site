/**
 * The published contract between releases (t25827).
 *
 * /api/stability.json promises six things a machine may rely on between
 * deploys. It is generated from the build it ships with, so the tests that
 * read it (tests/developer-surface.test.ts) can only show that a build agrees
 * with itself. ops/contract/ compares a build with the release before it, as
 * CI and the deploy run it against production. These tests hold that check to
 * the promise: every kind of break it must catch, the deprecations that may
 * let an identifier go, and the workflows that must keep running it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { distReader } from '../ops/contract/check-surface.mjs';
import { PROMISE_KINDS, brokenPromises, countByKind, readSurface } from '../ops/contract/surface.mjs';
import { DIST, ROOT, readDistFile } from './support/dist';

type Json = Record<string, any>;
type Patch = Record<string, (payload: Json) => void>;

/** dist/ as a reader, with some payloads changed and some URLs gone: a candidate release. */
function candidate({ patch = {}, gone = [] as string[] }: { patch?: Patch; gone?: string[] } = {}) {
  const dist = distReader(DIST);
  return {
    name: 'candidate',
    read: async (path: string) => {
      if (gone.includes(path)) return null;
      const raw = await dist.read(path);
      if (raw === null || !patch[path]) return raw;
      const payload = JSON.parse(raw) as Json;
      patch[path](payload);
      return JSON.stringify(payload);
    },
    resolves: async (path: string) => !gone.includes(path) && (await dist.resolves(path)),
  };
}

async function breaks(options: Parameters<typeof candidate>[0], before?: Awaited<ReturnType<typeof readSurface>>, today?: Date) {
  const site = candidate(options);
  const baseline = before ?? (await readSurface(distReader(DIST)));
  const found = await brokenPromises(baseline, await readSurface(site), { resolves: site.resolves, today });
  return found.map((p) => p.key);
}

const policy = JSON.parse(readDistFile('api/stability.json') ?? '{}') as Json;

describe('the published contract (ops/contract/surface.mjs)', () => {
  it('reads every kind of promise /api/stability.json makes, from the built site', async () => {
    const surface = await readSurface(distReader(DIST));
    const counts = countByKind(surface);
    for (const kind of PROMISE_KINDS) expect(counts[kind], `no ${kind} promises read from dist/`).toBeGreaterThan(0);
    // One kind per rule the policy publishes, so a new rule needs a check.
    expect(policy.stable.length, 'stable[] gained or lost a rule: teach ops/contract/surface.mjs to hold it').toBe(PROMISE_KINDS.length);
    expect(counts.endpoint).toBe(policy.endpointPaths.length);
    expect(counts.service).toBe(policy.stableServiceIds.length);
    for (const key of [
      'field /api/services.json services[].priceFrom',
      'operation /api/services.json getServices',
      'enum /api/services.json services[].priceUnit month',
      'service automation-opportunity-audit',
      'page /contact/',
      'page /developers/', // in the sitemap only
    ]) {
      expect(surface.promises.has(key), `${key} is not read as a promise`).toBe(true);
    }
  });

  it('a build keeps every promise it makes itself', async () => {
    expect(await breaks({})).toEqual([]);
  });

  it('catches a renamed field, a changed operationId, a dropped enum value and a changed service id', async () => {
    const found = await breaks({
      patch: {
        '/api/services.json': (p) => {
          for (const s of p.services) {
            s.unit = s.priceUnit;
            delete s.priceUnit;
          }
          p.services[0].id = 'audit';
        },
        '/openapi.json': (spec) => {
          spec.paths['/api/claims.json'].get.operationId = 'listClaims';
          const items = spec.components.schemas.ServicesResponse.properties.services.items.properties;
          items.unit = items.priceUnit;
          delete items.priceUnit;
          const channel = spec.components.schemas.EnquiryContract.properties.routes.items.properties.channel;
          channel.enum = channel.enum.filter((v: string) => v !== 'phone');
        },
      },
    });
    expect(found.sort()).toEqual(
      [
        'field /api/services.json services[].priceUnit',
        'enum /api/services.json services[].priceUnit project',
        'enum /api/services.json services[].priceUnit month',
        'enum /api/enquiry.json routes[].channel phone',
        'operation /api/claims.json getClaims',
        'service automation-opportunity-audit',
      ].sort()
    );
  });

  it('keeps an optional field the schema still declares when no payload carries a value today', async () => {
    expect(
      await breaks({
        patch: {
          '/api/field-notes.json': (p) => {
            for (const note of p.fieldNotes) delete note.claims;
          },
        },
      })
    ).toEqual([]);
  });

  it('catches an endpoint that stops being served, and a page with nothing left at its URL', async () => {
    const found = await breaks({ gone: ['/api/releases.json', '/work/'] });
    expect(found).toContain('endpoint /api/releases.json');
    expect(found).toContain('field /api/releases.json releases[].version');
    expect(found).toContain('page /work/');
  });

  it('lets a page leave the inventory when a redirect is left at its URL', async () => {
    const found = await breaks({
      patch: { '/api/pages.json': (p) => (p.pages = p.pages.filter((page: Json) => !page.url.endsWith('/work/'))) },
    });
    expect(found).toEqual([]);
  });

  describe('a deprecation lets an identifier go only as the policy says', () => {
    const removeReleases = { gone: ['/api/releases.json'] };
    type Entry = { path: string; field?: string; replacement: string; deprecatedOn: string; sunset: string };
    const announced = async (entry: Entry) => {
      const before = await readSurface(distReader(DIST));
      return { ...before, deprecations: [entry] };
    };
    const entry: Entry = { path: '/api/releases.json', replacement: '/api/v2/releases.json', deprecatedOn: '2027-01-01', sunset: '2027-04-01' };
    const after = new Date('2027-04-02T00:00:00Z');

    it('after its sunset, announced by the release before with the full notice', async () => {
      expect(await breaks(removeReleases, await announced(entry), after)).toEqual([]);
    });

    it('not before its sunset', async () => {
      expect(await breaks(removeReleases, await announced(entry), new Date('2027-03-31T00:00:00Z'))).toContain('endpoint /api/releases.json');
    });

    it('not with less notice than the policy promises', async () => {
      const short = { ...entry, deprecatedOn: '2027-02-01' };
      expect(await breaks(removeReleases, await announced(short), after)).toContain('endpoint /api/releases.json');
    });

    it('not when only the new release announces it', async () => {
      expect(await breaks(removeReleases, undefined, after)).toContain('endpoint /api/releases.json');
    });

    it('a field deprecation withdraws that field and nothing else', async () => {
      const fieldEntry = { ...entry, field: 'releases[].notes' };
      const found = await breaks(
        {
          patch: {
            '/api/releases.json': (p) => {
              for (const r of p.releases) {
                delete r.notes;
                delete r.summary;
              }
            },
            '/openapi.json': (spec) => {
              const props = spec.components.schemas.ReleasesResponse.properties.releases.items.properties;
              delete props.notes;
              delete props.summary;
            },
          },
        },
        await announced(fieldEntry),
        after
      );
      expect(found).toEqual(['field /api/releases.json releases[].summary']);
    });
  });
});

describe('the release check runs where the policy says it does', () => {
  it('/api/stability.json publishes how the promise is enforced, and its source exists', () => {
    const source: string = policy.enforcement?.source ?? '';
    const prefix = 'https://github.com/Automancer-Ltd/automancer-site/blob/main/';
    expect(source.startsWith(prefix), 'enforcement.source is not a file on main').toBe(true);
    expect(() => readFileSync(join(ROOT, source.slice(prefix.length))), `${source} does not exist`).not.toThrow();
    expect(policy.enforcement.limits, 'enforcement must say what it does not catch').toBeTruthy();
  });

  it('every pull request is compared with production, strictly', () => {
    const ci = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');
    const step = ci.match(/^.*ops\/contract\/check-surface\.mjs.*$/m)?.[0] ?? '';
    expect(step, 'ci.yml no longer runs the contract check').toContain('--baseline=https://automancer.uk');
    expect(step, 'the pull request check must fail when production cannot be read').not.toContain('--allow-unreachable');
  });

  it('every release compares the exact build it publishes, before it uploads it', () => {
    const deploy = readFileSync(join(ROOT, '.github/workflows/deploy.yml'), 'utf8');
    const check = deploy.indexOf('ops/contract/check-surface.mjs --baseline=https://automancer.uk');
    expect(check, 'deploy.yml no longer runs the contract check').toBeGreaterThan(-1);
    expect(check, 'the contract check must run before the Pages archive is uploaded').toBeLessThan(deploy.indexOf('upload-pages-artifact'));
  });
});
