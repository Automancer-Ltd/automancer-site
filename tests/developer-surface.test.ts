/**
 * The agent/developer surface added after the is-agentic.com scan of
 * 2026-08-22 (baseline 63/100): /openapi.json, the /developers page, the
 * llms.txt "When to use" guidance, and the 404 recovery links.
 *
 * These tests audit dist/ — the bytes GitHub Pages serves — and pin the
 * cross-file promises that make the surface trustworthy: the OpenAPI spec
 * describes exactly what /api/index.json lists, the /developers page links
 * every one of those endpoints, and the emitted payloads still match the
 * schemas the spec declares. A spec that drifted from the payloads would be
 * worse than no spec: an LLM would call functions against a fictional API.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT, SITE_URL, allHtmlFiles, contentPages, readDistFile, resolveInDist } from './support/dist';
import { API_ENDPOINTS } from '../src/data/api';

// ─── helpers ─────────────────────────────────────────────────────────────────

type Spec = Record<string, unknown>;

function assertJsonObject(value: unknown, file: string): asserts value is Record<string, unknown> {
  expect(
    typeof value === 'object' && value !== null && !Array.isArray(value),
    `dist/${file}: expected a top-level JSON object`
  ).toBe(true);
}

/** Resolve a local $ref like "#/components/schemas/X" inside the spec. */
function resolveRef(spec: Spec, ref: string): Record<string, unknown> | null {
  if (!ref.startsWith('#/')) return null;
  let node: unknown = spec;
  for (const seg of ref.slice(2).split('/')) {
    if (!node || typeof node !== 'object') return null;
    node = (node as Spec)[seg];
  }
  return node && typeof node === 'object' && !Array.isArray(node) ? (node as Spec) : null;
}

/** Dereference a schema node that may be inline or a local $ref. */
function deref(schemaNode: unknown, spec: Spec): Spec {
  if (!schemaNode || typeof schemaNode !== 'object' || Array.isArray(schemaNode)) return {};
  const ref = (schemaNode as Spec).$ref;
  if (typeof ref !== 'string') return schemaNode as Spec;
  return resolveRef(spec, ref) ?? {};
}

function typeOk(value: unknown, type: string): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'integer':
      return Number.isInteger(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'null':
      return value === null;
    default:
      return true; // unknown type keyword — not ours to police
  }
}

/**
 * Conformance check of an emitted payload against its declared schema:
 * required keys present, present properties type-check (unions included),
 * arrays' items checked, nested objects recursed to `maxDepth`.
 */
function checkConformance(
  payload: unknown,
  schema: unknown,
  spec: Spec,
  label: string,
  errors: string[],
  depth = 0,
  maxDepth = 8
): void {
  if (depth > maxDepth) return;
  const s = deref(schema, spec);
  const types = Array.isArray(s.type) ? (s.type as string[]) : s.type ? [s.type as string] : [];

  if (types.length > 0 && !types.some((t) => typeOk(payload, t))) {
    errors.push(`${label}: expected type ${types.join('|')}`);
    return;
  }
  if (typeof payload !== 'object' || payload === null) return;

  if (Array.isArray(payload)) {
    if (s.items) {
      payload.forEach((el, i) =>
        checkConformance(el, s.items, spec, `${label}[${i}]`, errors, depth + 1, maxDepth)
      );
    }
    return;
  }

  const record = payload as Record<string, unknown>;
  for (const key of (s.required as string[] | undefined) ?? []) {
    if (!(key in record)) errors.push(`${label}: missing required property "${key}"`);
  }
  const props = (s.properties ?? {}) as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    if (!(key in props)) {
      // additionalProperties:false means the spec must name EVERY field the
      // payload emits — an unnamed field is spec drift in the other direction.
      if (s.additionalProperties === false) {
        errors.push(`${label}: payload emits "${key}" but the schema does not declare it`);
      }
      continue;
    }
    checkConformance(value, props[key], spec, `${label}.${key}`, errors, depth + 1, maxDepth);
  }
}

// ─── shared fixtures ─────────────────────────────────────────────────────────

const apiIndexRaw = readDistFile('api/index.json');
let apiIndexParsed: unknown;
expect(() => {
  apiIndexParsed = JSON.parse(apiIndexRaw!);
}, 'dist/api/index.json no longer parses').not.toThrow();
const apiIndex = apiIndexParsed as {
  endpoints?: Array<{ path?: string }>;
  related?: Array<{ path?: string }>;
};

const listedPaths = (apiIndex.endpoints ?? []).map((e) => e.path ?? '');

const openApiRaw = readDistFile('openapi.json');
let spec: Spec = {};

// ─── /openapi.json ───────────────────────────────────────────────────────────

describe('/openapi.json — OpenAPI 3.1 of the public JSON API', () => {
  it('is emitted, parses as JSON, and declares OpenAPI 3.1', () => {
    expect(openApiRaw, 'dist/openapi.json missing').toBeTruthy();
    expect(() => {
      spec = JSON.parse(openApiRaw!);
    }, 'dist/openapi.json is not valid JSON').not.toThrow();
    assertJsonObject(spec, 'openapi.json');
    expect(String(spec.openapi), 'openapi.json must declare an OpenAPI 3.1.x version').toMatch(
      /^3\.1\.\d+$/
    );
  });

  it('carries usable metadata: info title/version/description, server on our origin', () => {
    const info = spec.info as Spec | undefined;
    expect(info?.title, 'info.title missing').toBeTruthy();
    expect(info?.version, 'info.version missing').toBeTruthy();
    expect(String(info?.description ?? '').length, 'info.description too thin to be useful').toBeGreaterThan(
      50
    );
    const servers = (spec.servers ?? []) as Array<{ url?: string }>;
    expect(servers.map((s) => s.url), 'servers must include the production origin').toContain(SITE_URL);
  });

  it('documents that the whole API needs no authentication (empty security requirement)', () => {
    expect(Array.isArray(spec.security), 'root security must be an array').toBe(true);
    expect(spec.security as string[], 'root security must be EMPTY — the API is key-free').toEqual([]);
    for (const [path, item] of Object.entries(spec.paths as Spec)) {
      const get = (item as Spec).get as Spec | undefined;
      expect(get?.security, `${path}: operation security must be empty`).toEqual([]);
    }
  });

  it('describes EXACTLY the endpoints /api/index.json lists — no more, no fewer', () => {
    const specPaths = Object.keys((spec.paths ?? {}) as Spec);
    expect([...specPaths].sort(), 'openapi.json paths disagree with api/index.json').toEqual(
      [...listedPaths].sort()
    );
    expect(specPaths.length, 'the registry should list every endpoint').toBe(API_ENDPOINTS.length);
  });

  it('every operation has a UNIQUE operationId plus summary, description, parameters and a real 200 schema', () => {
    const ids: string[] = [];
    for (const [path, item] of Object.entries((spec.paths ?? {}) as Spec)) {
      const get = (item as Spec).get as Spec | undefined;
      expect(get, `${path}: no GET operation`).toBeTruthy();
      ids.push(get!.operationId as string);
      expect(get!.operationId, `${path}: operationId missing`).toBeTruthy();
      expect(String(get!.summary ?? '').length, `${path}: summary missing`).toBeGreaterThan(0);
      expect(String(get!.description ?? '').length, `${path}: description missing`).toBeGreaterThan(20);
      expect(Array.isArray(get!.parameters), `${path}: parameters must be an explicit array`).toBe(true);
      const responses = (get!.responses ?? {}) as Spec;
      const ok = responses['200'] as Spec | undefined;
      expect(ok, `${path}: no 200 response documented`).toBeTruthy();
      const jsonContent = ((ok?.content ?? {}) as Spec)['application/json'] as Spec | undefined;
      expect(
        (jsonContent?.schema as Spec | undefined)?.$ref,
        `${path}: 200 response has no schema reference`
      ).toBeTruthy();
    }
    expect(new Set(ids).size, `operationIds must be unique across the document (got: ${ids.join(', ')})`).toBe(
      ids.length
    );
    expect(ids.length, 'one operation per registry endpoint').toBe(API_ENDPOINTS.length);
  });

  it('every local $ref resolves inside the document', () => {
    const refs: string[] = [];
    const walk = (node: unknown): void => {
      if (typeof node === 'string') {
        if (node.startsWith('#/')) refs.push(node);
        return;
      }
      if (Array.isArray(node)) node.forEach(walk);
      else if (node && typeof node === 'object') Object.values(node).forEach(walk);
    };
    walk(spec);
    expect(refs.length, 'no $refs found — schemas were never wired up').toBeGreaterThan(0);
    for (const ref of refs) {
      expect(resolveRef(spec, ref), `dangling $ref ${ref}`).not.toBeNull();
    }
  });

  it('every emitted endpoint payload conforms to the schema the spec declares for it', () => {
    const errors: string[] = [];
    for (const endpoint of API_ENDPOINTS) {
      const raw = readDistFile(endpoint.path.replace(/^\//, ''));
      expect(raw, `dist${endpoint.path} missing`).toBeTruthy();
      const payload: unknown = JSON.parse(raw!);

      const get = (((spec.paths as Spec)[endpoint.path] as Spec).get ?? {}) as Spec;
      const ref = (
        ((((get.responses as Spec)['200'] as Spec).content as Spec)[
          'application/json'
        ] as Spec).schema as Spec
      ).$ref as string;
      const schema = resolveRef(spec, ref);
      expect(schema, `${endpoint.path}: $ref ${ref} unresolved`).not.toBeNull();

      checkConformance(payload, schema, spec, endpoint.path, errors);
    }
    expect(errors, `payloads drifted from their declared schemas:\n${errors.join('\n')}`).toEqual([]);
  });
});

// ─── /developers ─────────────────────────────────────────────────────────────

describe('/developers — human-readable docs linked from the homepage', () => {
  const page = contentPages().find((p) => p.route === '/developers/');
  const homepage = contentPages().find((p) => p.route === '/');
  const hrefsOf = (p: { doc: ReturnType<typeof contentPages>[number]['doc'] }) =>
    p.doc.querySelectorAll('a[href]').map((a) => a.getAttribute('href') ?? '');

  it('is emitted with the full layout', () => {
    expect(page, 'dist/developers/index.html was not built').toBeTruthy();
  });

  it('states plainly that the API needs no authentication and is read-only', () => {
    expect(page!.html, '/developers must say the API needs no authentication').toMatch(
      /no authentication/i
    );
    expect(page!.html, '/developers must say the API is read-only').toMatch(/read-only/i);
  });

  it('links every endpoint that /api/index.json lists', () => {
    const hrefs = hrefsOf(page!);
    for (const path of listedPaths) {
      expect(
        hrefs,
        `/developers must link ${path} — it lists it nowhere or under another URL`
      ).toContain(path);
    }
  });

  it('links the OpenAPI spec, llms.txt and documents twins + feeds + manifest + sitemap', () => {
    const html = page!.html;
    for (const needle of [
      'href="/openapi.json"',
      'href="/llms.txt"',
      '.md',
      '/work/feed.json',
      '/field-notes/rss.xml',
      'href="/agent.json"',
      '/sitemap-index.xml',
    ]) {
      expect(html, `/developers should mention/link ${needle}`).toContain(needle);
    }
  });

  it('is linked from the homepage', () => {
    expect(homepage, 'homepage missing?!').toBeTruthy();
    expect(
      hrefsOf(homepage!),
      'the homepage must link /developers — the is-agentic finding was exactly this gap'
    ).toContain('/developers');
  });

  it('llms.txt and robots.txt advertise both /developers and /openapi.json', () => {
    const llms = readDistFile('llms.txt');
    expect(llms, 'dist/llms.txt missing').toBeTruthy();
    expect(llms!, 'llms.txt should point agents at /developers').toContain(`${SITE_URL}/developers`);
    expect(llms!, 'llms.txt should point agents at the OpenAPI spec').toContain(
      `${SITE_URL}/openapi.json`
    );
    const robots = readDistFile('robots.txt');
    expect(robots!, 'robots.txt should comment-advertise /developers').toContain(
      `${SITE_URL}/developers`
    );
    expect(robots!, 'robots.txt should comment-advertise /openapi.json').toContain(
      `${SITE_URL}/openapi.json`
    );
  });

  it('agent.json advertises the developer docs and OpenAPI spec at servable paths', () => {
    const agent = JSON.parse(readDistFile('agent.json')!) as {
      machineReadable?: {
        developerDocs?: { url?: string };
        openApiSpec?: { url?: string };
      };
    };
    // abs() normalises page paths to the canonical directory form — /developers/
    const docsUrl = agent.machineReadable?.developerDocs?.url;
    const specUrl = agent.machineReadable?.openApiSpec?.url;
    expect(docsUrl, 'agent.json machineReadable.developerDocs.url missing').toBe(
      `${SITE_URL}/developers/`
    );
    expect(specUrl, 'agent.json machineReadable.openApiSpec.url missing').toBe(
      `${SITE_URL}/openapi.json`
    );
    for (const url of [docsUrl!, specUrl!]) {
      expect(
        resolveInDist('agent.json', url),
        `agent.json advertises ${url} but nothing was emitted at that path`
      ).toBeTruthy();
    }
  });
});

// ─── llms.txt when-to-use guidance ───────────────────────────────────────────

describe('llms.txt — when-to-use guidance for agents', () => {
  const llms = readDistFile('llms.txt')!;
  const sectionStart = llms.indexOf('## When to use Automancer');
  const section = sectionStart >= 0 ? llms.slice(sectionStart, llms.indexOf('\n## ', sectionStart + 1)) : '';

  it('has a dedicated "When to use Automancer" section', () => {
    expect(sectionStart, 'llms.txt carries no "When to use Automancer" section').toBeGreaterThanOrEqual(0);
  });

  it('names concrete jobs grounded in the published services and delivered work', () => {
    const bullets = section.split('\n').filter((l) => l.startsWith('- '));
    expect(bullets.length, 'the when-to-use section is too thin to guide anyone').toBeGreaterThanOrEqual(5);
    // Real service names from src/data/business.ts — generic marketing copy
    // does not read as guidance; named offerings do.
    expect(section, 'when-to-use should name the Automation Opportunity Audit').toContain(
      'Automation Opportunity Audit'
    );
    expect(section, 'when-to-use should name the AI Ops Partner plan').toContain('AI Ops Partner');
    expect(section, 'when-to-use should state a published price').toMatch(/£\d/);
  });

  it('says when an agent should look elsewhere, not just when we fit', () => {
    expect(section, 'when-to-use must include a look-elsewhere list').toMatch(
      /look elsewhere/i
    );
    expect(
      section.split('look elsewhere')[1]?.split('- ').length,
      'the look-elsewhere list needs actual entries'
    ).toBeGreaterThan(2);
  });
});

// ─── 404 agent recovery ──────────────────────────────────────────────────────

describe('404 page — machine-readable recovery block', () => {
  const notFound = allHtmlFiles().find((p) => p.is404)!;

  it('points stranded agents at the four wayfinding surfaces', () => {
    expect(notFound, 'dist/404.html missing').toBeTruthy();
    const hrefs = notFound.doc.querySelectorAll('a[href]').map((a) => a.getAttribute('href') ?? '');
    for (const path of ['/sitemap-index.xml', '/llms.txt', '/llms-full.txt', '/developers']) {
      expect(hrefs, `the 404 recovery block must link ${path}`).toContain(path);
    }
  });

  it('stays useful to humans — the recovery block did not wreck the page', () => {
    const h1 = notFound.doc.querySelector('h1')?.text.trim() ?? '';
    expect(h1, '404 page lost its human-facing h1').toContain('404');
    expect(notFound.html, '404 page lost the contact route').toContain(businessEmail());
  });

  it('offers the human section list before the agent-recovery block', () => {
    const html = notFound.html;
    const human = html.indexOf('Where were you heading?');
    const agent = html.indexOf('id="agent-recovery"');
    expect(human, 'human recovery heading missing from 404.html').toBeGreaterThan(-1);
    expect(agent, '#agent-recovery missing from 404.html').toBeGreaterThan(-1);
    expect(human, 'agent-recovery still precedes the human section list').toBeLessThan(agent);
  });

  /** The published mailbox, straight from the single source of truth. */
  function businessEmail(): string {
    return (
      (JSON.parse(readDistFile('agent.json') ?? '{}') as { contact?: { email?: string } }).contact
        ?.email ?? ''
    );
  }
});

// ─── JSON-LD person / organisation completeness ──────────────────────────────

describe('JSON-LD — Person and ProfessionalService nodes are complete', () => {
  /**
   * Honesty guard for sameAs: the repo publishes no public profile URLs, so
   * none may appear in structured data either. If one is ever added here,
   * it must ALSO exist verbatim in src/data/ — invented profiles fail.
   */
  function sameAsGuardAllows(url: string): boolean {
    const dataDir = join(ROOT, 'src', 'data');
    for (const f of readdirSync(dataDir)) {
      if (!f.endsWith('.ts')) continue;
      if (readFileSync(join(dataDir, f), 'utf8').includes(url)) return true;
    }
    return false;
  }

  it('every content page describes the founder Person with name, jobTitle AND url', () => {
    let personChecked = 0;
    for (const page of contentPages()) {
      const blocks = page.doc.querySelectorAll('script[type="application/ld+json"]');
      for (const block of blocks) {
        const graph = (JSON.parse(block.text) as { '@graph'?: Spec[] })['@graph'] ?? [];
        for (const node of graph) {
          if (node['@type'] !== 'Person' || !String(node.name ?? '').includes('Waseem')) continue;
          personChecked++;
          expect(node.jobTitle, `${page.route}: Person node lacks jobTitle`).toBeTruthy();
          const url = node.url as string | undefined;
          expect(url, `${page.route}: Person node lacks url`).toBeTruthy();
          expect(url?.startsWith('https://'), `${page.route}: Person url not absolute`).toBe(true);
        }
      }
    }
    expect(personChecked, 'no founder Person node found anywhere — layout regressed').toBeGreaterThan(5);
  });

  it('the ProfessionalService node carries name, description and url on every page', () => {
    for (const page of contentPages()) {
      const blocks = page.doc.querySelectorAll('script[type="application/ld+json"]');
      let seen = 0;
      for (const block of blocks) {
        const graph = (JSON.parse(block.text) as { '@graph'?: Spec[] })['@graph'] ?? [];
        for (const node of graph) {
          if (node['@type'] !== 'ProfessionalService') continue;
          seen++;
          expect(node.name, `${page.route}: org node lacks name`).toBeTruthy();
          expect(node.description, `${page.route}: org node lacks description`).toBeTruthy();
          expect(node.url, `${page.route}: org node lacks url`).toBeTruthy();
        }
      }
      expect(seen, `${page.route}: no ProfessionalService node in the @graph`).toBe(1);
    }
  });

  it('publishes no social profile unless it genuinely exists in src/data/', () => {
    const offenders: string[] = [];
    for (const page of contentPages()) {
      for (const block of page.doc.querySelectorAll('script[type="application/ld+json"]')) {
        const graph = (JSON.parse(block.text) as { '@graph'?: Spec[] })['@graph'] ?? [];
        const visit = (node: unknown): void => {
          if (Array.isArray(node)) return node.forEach(visit);
          if (!node || typeof node !== 'object') return;
          const rec = node as Spec;
          for (const v of (rec.sameAs as string[] | undefined) ?? []) {
            if (!sameAsGuardAllows(v)) offenders.push(`${page.route}: sameAs → ${v}`);
          }
          Object.values(rec).forEach(visit);
        };
        graph.forEach(visit);
      }
    }
    expect(
      offenders,
      'structured data claims social profiles that exist nowhere in src/data/ — do not invent them'
    ).toEqual([]);
  });

  it('field-note BlogPosting nodes publish a wordCount that matches the body the API serves', () => {
    // The word count in JSON-LD must equal the whitespace-token count of the
    // same note's body in /api/field-notes.json: one article, one length, and
    // a "wordCount: 0" on a full-length note is exactly the machine/human
    // disagreement the site must never publish.
    const payload = JSON.parse(readDistFile('api/field-notes.json') ?? 'null') as {
      fieldNotes: { slug: string; body: string }[];
    };
    const bodyBySlug = new Map(payload.fieldNotes.map((n) => [n.slug, n.body]));
    expect(bodyBySlug.size, 'api/field-notes.json emitted no notes').toBeGreaterThan(0);

    let checked = 0;
    for (const page of contentPages()) {
      const slug = /^\/field-notes\/([^/]+)\/$/.exec(page.route)?.[1];
      if (!slug) continue;
      const body = bodyBySlug.get(slug);
      expect(body, `${page.route}: no matching body in api/field-notes.json`).toBeTruthy();
      const expected = (body ?? '').split(/\s+/).filter(Boolean).length;
      for (const block of page.doc.querySelectorAll('script[type="application/ld+json"]')) {
        const graph = (JSON.parse(block.text) as { '@graph'?: Spec[] })['@graph'] ?? [];
        for (const node of graph) {
          if (node['@type'] !== 'BlogPosting') continue;
          checked++;
          expect(
            node.wordCount,
            `${page.route}: BlogPosting wordCount ${String(node.wordCount)} != body token count ${expected}`
          ).toBe(expected);
        }
      }
    }
    expect(checked, 'no BlogPosting node found on any field-note page').toBe(bodyBySlug.size);
  });
});
