/**
 * The machine-readable surface added by feat/agent-readiness
 * (docs/AGENT-READINESS.md): Markdown twins, llms.txt/llms-full.txt, the
 * /api/*.json endpoints, the agent manifest and security.txt (each served at
 * BOTH /<name> and /.well-known/<name>), feeds and robots.txt.
 *
 * These files are consumed by agents and crawlers without a human in the
 * loop, so the failures they hide are silent by nature: a twin that drifted
 * from its page, a manifest advertising a 404, a security.txt that quietly
 * expired, a feed missing the newest post. Everything here audits the bytes
 * actually emitted into dist/, never the source templates — and even that is
 * not enough on GitHub Pages, which does not serve dot-prefixed paths at all
 * (measured 2026-08-22): a file can be present and correct in dist/ and
 * still 404 live. That is why the servable non-dot copies and the
 * advertisements pointing at THEM are asserted just as hard as the bytes.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DIST, ROOT, SITE_URL, contentPages, readDistFile, resolveInDist } from './support/dist';
import { contentEntries } from './support/content';
import { business, services } from '../src/data/business';
import { fitDescription, fitTitle } from '../src/lib/meta';

/** Every file emitted into dist/, as dist-relative POSIX paths. */
function allDistFiles(): string[] {
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full, out);
      else out.push(full.slice(DIST.length + 1).split(/[\\/]/).join('/'));
    }
    return out;
  };
  return walk(DIST);
}

/** Parse the YAML front matter our generators emit (`key: "json-string"`). */
function frontMatterOf(text: string, label: string): Record<string, string> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  expect(match, `${label}: does not begin with YAML front matter`).toBeTruthy();
  const fm: Record<string, string> = {};
  for (const line of match![1].split(/\r?\n/)) {
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    try {
      fm[kv[1]] = JSON.parse(kv[2]) as string;
    } catch {
      fm[kv[1]] = kv[2];
    }
  }
  return fm;
}

/**
 * Well-formedness gate for the generated RSS: comments, processing
 * instructions and CDATA bodies are stripped, then every remaining tag must
 * nest correctly. This is what catches a truncated or hand-mangled feed —
 * the realistic failure mode for build-time XML.
 */
function assertWellFormedXml(xml: string, label: string): void {
  const stripped = xml
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA[\s\S]*?\]\]>/g, '');
  const tagRe = /<(\/?)([A-Za-z][\w.:-]*)([^>]*?)(\/?)>/g;
  const stack: string[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(stripped)) !== null) {
    expect(
      stripped.slice(last, m.index).includes('<'),
      `${label}: stray "<" outside any tag — malformed markup`
    ).toBe(false);
    last = tagRe.lastIndex;
    const [, closing, name, , selfClosing] = m;
    if (selfClosing) continue;
    if (closing) {
      expect(
        stack.pop(),
        `${label}: closing </${name}> has no matching open tag`
      ).toBe(name);
    } else {
      stack.push(name);
    }
  }
  expect(
    stripped.slice(last).includes('<'),
    `${label}: stray "<" outside any tag — malformed markup`
  ).toBe(false);
  expect(stack, `${label}: unclosed element(s): ${stack.join(', ')}`).toEqual([]);
}

/**
 * Shape gates for JSON parsed off disk (`parsed.get(endpoint)` hands back
 * `unknown`, and a runtime expect() cannot teach the compiler anything).
 * Each gate does both jobs at once: it fails with a message naming the
 * file, what was expected and what was actually found, then its `asserts`
 * signature narrows the value so TypeScript sees the shape the runtime
 * just verified — no `!` and no casts, which would trade a clear failure
 * message for a confusing crash.
 */
function describeFound(value: unknown): string {
  return value === null ? 'null' : Array.isArray(value) ? 'an array' : `type '${typeof value}'`;
}

function assertJsonObject(value: unknown, file: string): asserts value is Record<string, unknown> {
  expect(
    typeof value === 'object' && value !== null && !Array.isArray(value),
    `dist/${file}: expected a top-level JSON object — got ${describeFound(value)}`
  ).toBe(true);
}

function assertJsonArray<T>(value: unknown, file: string, expected: string): asserts value is T[] {
  expect(
    Array.isArray(value),
    `dist/${file}: expected ${expected} to be present as an array — got ${describeFound(value)}`
  ).toBe(true);
}

// ─── shared expectations ─────────────────────────────────────────────────────

const nonDraftEntries = contentEntries().filter((e) => !e.draft);

/** Route → dist-relative twin path, mirroring markdownTwinPath()'s rule. */
function twinPathFor(route: string): string {
  return route === '/' ? 'index.md' : route.replace(/^\//, '').replace(/\/$/, '') + '.md';
}

const STATIC_TWIN_ROUTES = ['/', '/services/', '/work/', '/field-notes/', '/about/', '/contact/'];
const expectedTwins = new Map<string, string>();
for (const route of STATIC_TWIN_ROUTES) expectedTwins.set(twinPathFor(route), route);
for (const entry of nonDraftEntries) {
  const dir = entry.collection === 'case-studies' ? 'work' : 'field-notes';
  expectedTwins.set(`${dir}/${entry.slug}.md`, `/${dir}/${entry.slug}/`);
}

const nonDraftSlugs = (collection: 'case-studies' | 'field-notes'): string[] =>
  nonDraftEntries.filter((e) => e.collection === collection).map((e) => e.slug).sort();

describe('markdown twins — every content page also speaks Markdown', () => {
  const actualTwins = allDistFiles().filter((f) => f.endsWith('.md'));

  it('emits exactly one twin per content page — none missing, none extra', () => {
    const missing = [...expectedTwins.keys()].filter((t) => !actualTwins.includes(t));
    const extra = actualTwins.filter((t) => !expectedTwins.has(t));
    expect(missing, 'content pages shipped without their .md twin').toEqual([]);
    expect(extra, '.md files in dist/ that are no content page’s twin').toEqual([]);
    expect(actualTwins.length).toBe(expectedTwins.size);
  });

  it('every twin is non-empty and begins with YAML front matter carrying title + description', () => {
    for (const [twinPath] of expectedTwins) {
      const raw = readDistFile(twinPath);
      expect(raw, `dist/${twinPath} missing`).toBeTruthy();
      expect(raw!.trim().length, `dist/${twinPath} is empty`).toBeGreaterThan(0);
      const fm = frontMatterOf(raw!, `dist/${twinPath}`);
      expect(fm.title?.trim(), `dist/${twinPath}: front matter has no title`).toBeTruthy();
      expect(
        fm.description?.trim(),
        `dist/${twinPath}: front matter has no description`
      ).toBeTruthy();
    }
  });

  it('every twin carries real body content below its front matter', () => {
    // An empty entry body would emit a twin that is front matter and
    // nothing else — non-empty as a FILE, so the test above passes. The
    // published surface must carry the entry's actual content.
    for (const [twinPath] of expectedTwins) {
      const raw = readDistFile(twinPath)!;
      const fmMatch = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(raw);
      expect(fmMatch, `dist/${twinPath}: does not begin with YAML front matter`).toBeTruthy();
      expect(
        raw.slice(fmMatch![0].length).trim().length,
        `dist/${twinPath} has NOTHING below its front matter — an entry was published without content`
      ).toBeGreaterThan(0);
    }
  });

  it("every twin's title/description still match its HTML page's <title>/meta description", () => {
    const byRoute = new Map(contentPages().map((p) => [p.route, p]));
    for (const [twinPath, route] of expectedTwins) {
      const page = byRoute.get(route);
      expect(page, `twin ${twinPath} points at route ${route}, which was not emitted`).toBeTruthy();

      const fm = frontMatterOf(readDistFile(twinPath)!, `dist/${twinPath}`);
      const htmlTitle = page!.doc.querySelector('title')?.text.trim() ?? '';
      const metaDesc =
        page!.doc.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() ?? '';

      // <title> is fitted to SERP budget (src/lib/meta.ts) before the brand
        // suffix is appended; the twin carries the unfitted copy. Recomputing
        // the same fit keeps this strict against wording drift while allowing
        // only the deterministic length clamp.
      expect(
        htmlTitle,
        `dist/${twinPath}: front-matter title "${fm.title}" has drifted from the page <title>`
      ).toBe(`${fitTitle(fm.title)} | Automancer`);
      expect(
        metaDesc,
        `dist/${twinPath}: front-matter description has drifted from the page meta description`
      ).toBe(fitDescription(fm.description));
    }
  });
});

describe('/llms.txt and /llms-full.txt', () => {
  const llms = readDistFile('llms.txt');
  const llmsFull = readDistFile('llms-full.txt');

  it('both exist and are non-empty', () => {
    expect(llms, 'dist/llms.txt missing').toBeTruthy();
    expect(llms!.trim().length).toBeGreaterThan(0);
    expect(llmsFull, 'dist/llms-full.txt missing').toBeTruthy();
    expect(llmsFull!.trim().length).toBeGreaterThan(0);
  });

  it('advertises llms-full.txt and the agent manifest by absolute URL', () => {
    expect(llms, 'llms.txt should point agents at the full-text file').toContain(
      `${SITE_URL}/llms-full.txt`
    );
    // The servable path: GitHub Pages does not serve dot-prefixed paths, so
    // /.well-known/agent.json 404s live (measured 2026-08-22) while every
    // dist/ check stayed green. Agents must be pointed at what resolves.
    expect(llms, 'llms.txt should point agents at the servable /agent.json').toContain(
      `${SITE_URL}/agent.json`
    );
  });

  it('mentions the servable manifest URL first — a /.well-known/ mention may only follow as clearly secondary', () => {
    const primary = llms!.indexOf(`${SITE_URL}/agent.json`);
    const secondary = llms!.indexOf(`${SITE_URL}/.well-known/agent.json`);
    expect(primary, 'llms.txt does not advertise /agent.json at all').toBeGreaterThanOrEqual(0);
    if (secondary !== -1) {
      // Substring safety: "${SITE_URL}/.well-known/agent.json" does NOT
      // contain "${SITE_URL}/agent.json", so these indexes are real mentions.
      expect(
        primary,
        'llms.txt mentions the 404ing /.well-known/ location BEFORE the servable /agent.json'
      ).toBeLessThan(secondary);
    }
  });

  it('lists canonical sitemap URLs with trailing slashes matching pagePath for directory pages', () => {
    expect(llms, 'dist/llms.txt missing').toBeTruthy();
    const siteMapSection = llms!.split('## Site map')[1]?.split(/^##\s/m)[0] ?? '';
    expect(siteMapSection, 'Site map section missing from llms.txt').toBeTruthy();

    const urls = [...siteMapSection.matchAll(/-\s+(https?:\/\/\S+)/g)].map((m) => m[1]);
    expect(urls.length, 'expected sitemap URLs in llms.txt').toBeGreaterThan(0);

    for (const url of urls) {
      const parsed = new URL(url);
      expect(
        parsed.pathname.endsWith('/'),
        `sitemap URL "${url}" lacks canonical trailing slash (would cause redirect hop)`
      ).toBe(true);
    }
  });

  it('gives every collection entry a section with non-empty text in llms-full.txt', () => {
    // `e.body ?? ''` makes an empty entry body indistinguishable from "no
    // content yet" — the section would still be emitted, headed and all,
    // with blank text. Sections are delimited by the '=' rule; element 0 is
    // the file header.
    const RULE = '='.repeat(72);
    const THIN = '-'.repeat(72);
    const sections = llmsFull!.split(`\n${RULE}\n`).slice(1);
    const entryUrls: string[] = [];
    for (const section of sections) {
      const url = /^URL: (\S+)/m.exec(section)?.[1] ?? '';
      // Collection ENTRY pages only (/work/<slug>/, /field-notes/<slug>/,
      // abs() appends the trailing slash) — not the two index pages.
      if (!/^https:\/\/automancer\.uk\/(?:work|field-notes)\/[^/]+\/?$/.test(url)) continue;
      entryUrls.push(url);
      const sep = section.indexOf(`\n${THIN}\n`);
      expect(sep, `llms-full.txt section ${url} has no separator line — generator format changed`).toBeGreaterThanOrEqual(0);
      expect(
        section.slice(sep + THIN.length + 2).trim().length,
        `llms-full.txt section for ${url} is EMPTY — an entry was published without content`
      ).toBeGreaterThan(0);
    }
    // Count guard: if the URL filter above ever matched nothing, every
    // per-section assertion would be skipped vacuously.
    expect(entryUrls, 'llms-full.txt lost collection-entry sections entirely').toHaveLength(
      nonDraftEntries.length
    );
  });
});

describe('/api/*.json endpoints', () => {
  const ENDPOINTS = [
    'api/index.json',
    'api/business.json',
    'api/services.json',
    'api/case-studies.json',
    'api/field-notes.json',
    'api/pages.json',
  ];

  const parsed = new Map<string, unknown>();
  for (const endpoint of ENDPOINTS) {
    const raw = readDistFile(endpoint);
    it(`${endpoint} exists and parses as JSON`, () => {
      expect(raw, `dist/${endpoint} missing`).toBeTruthy();
      let json: unknown;
      expect(() => {
        json = JSON.parse(raw!);
      }, `dist/${endpoint} is not valid JSON`).not.toThrow();
      parsed.set(endpoint, json);
    });
  }

  it('index.json advertises the manifest and security.txt through servable non-dot paths only', () => {
    const payload = parsed.get('api/index.json');
    assertJsonObject(payload, 'api/index.json');
    assertJsonArray<{ path?: string }>(
      payload['related'],
      'api/index.json',
      '"related" (a list of {path} pointers)'
    );
    const related = payload['related'] as Array<{ path?: string }>;
    const paths = related.map((r) => r.path ?? '');
    expect(paths, 'index.json should point agents at the servable /agent.json').toContain(
      '/agent.json'
    );
    expect(paths, 'index.json should point agents at the servable /security.txt').toContain(
      '/security.txt'
    );
    const dotted = related.filter((r) => typeof r.path === 'string' && r.path!.startsWith('/.'));
    expect(
      dotted.map((r) => r.path),
      'index.json still advertises dot-prefixed paths — GitHub Pages 404s those (measured 2026-08-22)'
    ).toEqual([]);
  });

  it('services.json states exactly the services in src/data/business.ts (name, price, unit)', () => {
    const payload = parsed.get('api/services.json') as { services?: unknown[] };
    expect(payload?.services, 'services.json has no services array').toBeTruthy();
    const emitted = payload.services as Array<{
      name: string;
      priceFrom: number;
      priceUnit: string;
    }>;
    expect(emitted, 'service count disagrees with business.ts').toHaveLength(services.length);
    emitted.forEach((s, i) => {
      expect(
        [s.name, s.priceFrom, s.priceUnit],
        `services.json[${i}] has drifted from business.ts`
      ).toEqual([services[i].name, services[i].priceFrom, services[i].priceUnit]);
    });
  });

  it('case-studies.json contains exactly the non-draft case studies — no others', () => {
    const payload = parsed.get('api/case-studies.json');
    assertJsonObject(payload, 'api/case-studies.json');
    assertJsonArray<{ slug: string }>(
      payload['caseStudies'],
      'api/case-studies.json',
      '"caseStudies" (a list of {slug} entries)'
    );
    const caseStudies = payload['caseStudies'];
    const slugs = caseStudies.map((s) => s.slug).sort();
    expect(slugs, 'case-studies.json slug set disagrees with the collection').toEqual(
      nonDraftSlugs('case-studies')
    );
    expect(payload['count'], 'case-studies.json count field disagrees with its own array').toBe(
      caseStudies.length
    );
  });

  it('field-notes.json contains exactly the non-draft field notes — no others', () => {
    const payload = parsed.get('api/field-notes.json');
    assertJsonObject(payload, 'api/field-notes.json');
    assertJsonArray<{ slug: string }>(
      payload['fieldNotes'],
      'api/field-notes.json',
      '"fieldNotes" (a list of {slug} entries)'
    );
    const fieldNotes = payload['fieldNotes'];
    const slugs = fieldNotes.map((n) => n.slug).sort();
    expect(slugs, 'field-notes.json slug set disagrees with the collection').toEqual(
      nonDraftSlugs('field-notes')
    );
    expect(payload['count'], 'field-notes.json count field disagrees with its own array').toBe(
      fieldNotes.length
    );
  });
});

describe('security.txt — RFC 9116, served from one builder at two routes', () => {
  // /security.txt is the copy GitHub Pages actually serves (dot-prefixed
  // paths 404 live on this host, measured 2026-08-22);
  // /.well-known/security.txt stays emitted for hosts that serve dot-paths.
  // Both render from src/data/wellknown-security.ts and must be identical.
  const copies = [
    { label: 'dist/security.txt', raw: readDistFile('security.txt') },
    { label: 'dist/.well-known/security.txt', raw: readDistFile('.well-known/security.txt') },
  ];

  function fieldsOf(raw: string): Map<string, string> {
    const fields = new Map<string, string>();
    for (const line of raw.split('\n')) {
      const kv = /^([A-Za-z-]+):\s*(.+)$/.exec(line.trim());
      if (kv && !fields.has(kv[1])) fields.set(kv[1], kv[2].trim());
    }
    return fields;
  }

  it('is emitted at BOTH the servable non-dot path and the conventional dot path', () => {
    expect(copies[0].raw, 'dist/security.txt missing — the only copy GitHub Pages will serve').toBeTruthy();
    expect(copies[1].raw, 'dist/.well-known/security.txt missing').toBeTruthy();
  });

  it('both copies are byte-identical — one builder, zero drift', () => {
    expect(
      copies[0].raw,
      'the served /security.txt has drifted from /.well-known/security.txt'
    ).toBe(copies[1].raw);
  });

  it('carries the fields RFC 9116 requires of us: Contact, Expires, Preferred-Languages, Canonical', () => {
    for (const { label, raw } of copies) {
      const fields = fieldsOf(raw!);
      for (const field of ['Contact', 'Expires', 'Preferred-Languages', 'Canonical']) {
        expect(fields.get(field), `${label} is missing ${field}`).toBeTruthy();
      }
    }
  });

  it('Contact points at the published mailbox in both copies', () => {
    for (const { raw } of copies) {
      expect(fieldsOf(raw!).get('Contact')).toBe(`mailto:${business.email}`);
    }
  });

  it('Canonical names the SERVED url (/security.txt) in both copies — a Canonical resolving to a 404 is non-conformant', () => {
    for (const { label, raw } of copies) {
      expect(
        fieldsOf(raw!).get('Canonical'),
        `${label}: Canonical must be the URL the file actually resolves at`
      ).toBe(`${SITE_URL}/security.txt`);
    }
  });

  it('Expires parses as a date IN THE FUTURE in both copies — an expired security.txt is invalid', () => {
    for (const { label, raw } of copies) {
      const expires = fieldsOf(raw!).get('Expires')!;
      const parsed_ = Date.parse(expires);
      expect(parsed_, `${label}: Expires "${expires}" is not a parseable date`).not.toBeNaN();
      expect(
        parsed_,
        `${label}: security.txt EXPIRED on ${expires} — regenerate it (the generator derives it from the build date)`
      ).toBeGreaterThan(Date.now());
    }
  });
});

describe('/agent.json — capability manifest, served from one builder at two routes', () => {
  // /agent.json is the copy GitHub Pages actually serves (dot-prefixed paths
  // 404 live on this host, measured 2026-08-22); /.well-known/agent.json
  // stays emitted for hosts that serve dot-paths. Both render from
  // src/data/wellknown-agent.ts and must be identical.
  const wellKnownRaw = readDistFile('.well-known/agent.json');
  const rootRaw = readDistFile('agent.json');
  let agent: unknown;

  it('is emitted at BOTH routes, byte-identical, and parses as JSON', () => {
    expect(rootRaw, 'dist/agent.json missing — the only copy GitHub Pages will serve').toBeTruthy();
    expect(wellKnownRaw, 'dist/.well-known/agent.json missing').toBeTruthy();
    expect(() => {
      agent = JSON.parse(rootRaw!);
    }, 'dist/agent.json is not valid JSON').not.toThrow();
    expect(
      rootRaw!,
      'the served /agent.json has drifted from /.well-known/agent.json — one payload, two routes'
    ).toBe(wellKnownRaw!);
  });

  it('every URL it advertises is absolute https, every site path resolves to an emitted file, and none is dot-prefixed', () => {
    const urls: string[] = [];
    const paths: string[] = [];
    const collect = (node: unknown): void => {
      if (typeof node === 'string') {
        if (/^https?:\/\//i.test(node)) urls.push(node);
        else if (/^\//.test(node)) paths.push(node);
        return;
      }
      if (Array.isArray(node)) node.forEach(collect);
      else if (node && typeof node === 'object') Object.values(node).forEach(collect);
    };
    collect(agent);

    expect(urls.length + paths.length, 'agent.json advertises no URLs at all').toBeGreaterThan(5);

    const ownHost = new URL(SITE_URL).host;
    for (const url of urls) {
      expect(url.startsWith('https://'), `agent.json URL is not absolute https: ${url}`).toBe(true);
      const parsedUrl = new URL(url);
      if (parsedUrl.host === ownHost) {
        expect(
          parsedUrl.pathname.startsWith('/.'),
          `agent.json advertises ${url} — a dot-prefixed path this host does not serve (measured: HTTP 404 live)`
        ).toBe(false);
        expect(
          resolveInDist('index.html', parsedUrl.pathname),
          `agent.json advertises ${url} but nothing was emitted at that path — a manifest advertising a 404 is worse than no manifest`
        ).toBeTruthy();
      }
    }
    for (const path of paths) {
      expect(
        path.startsWith('/.'),
        `agent.json advertises path ${path} — a dot-prefixed path this host does not serve`
      ).toBe(false);
      expect(
        resolveInDist('index.html', path),
        `agent.json advertises path ${path} but nothing was emitted there`
      ).toBeTruthy();
    }
  });

  it('points agents at security.txt through the servable non-dot path', () => {
    const machineReadable = (
      agent as { machineReadable?: { securityTxt?: { url?: string } } }
    ).machineReadable;
    expect(
      machineReadable?.securityTxt?.url,
      'agent.json should point agents at the servable /security.txt'
    ).toBe(`${SITE_URL}/security.txt`);
  });
});

describe('feeds — /work and /field-notes, RSS 2.0 + JSON Feed 1.1', () => {
  /** Slug list from a feed's <guid>s (CDATA stripped first). */
  const rssSlugs = (xml: string): string[] =>
    [...xml.matchAll(/<guid>(.*?)<\/guid>/g)].map(
      (m) => new URL(m[1]).pathname.split('/').filter(Boolean).pop()!
    );

  for (const [collection, dir] of [
    ['case-studies', 'work'],
    ['field-notes', 'field-notes'],
  ] as const) {
    const expected = nonDraftSlugs(collection);

    it(`${dir}/rss.xml is well-formed XML with exactly the non-draft ${collection}`, () => {
      const xml = readDistFile(`${dir}/rss.xml`);
      expect(xml, `dist/${dir}/rss.xml missing`).toBeTruthy();
      assertWellFormedXml(xml!, `dist/${dir}/rss.xml`);
      expect(
        xml!.replace(/^\s*<\?xml[^>]*\?>/, '').trimStart().startsWith('<rss'),
        `dist/${dir}/rss.xml does not start with an <rss> root element`
      ).toBe(true);
      const slugs = rssSlugs(xml!).sort();
      expect(slugs, `${dir}/rss.xml item set disagrees with the collection`).toEqual(expected);
      expect(slugs, `${dir}/rss.xml item count disagrees with the collection`).toHaveLength(
        expected.length
      );
    });

    it(`${dir}/rss.xml gives every item non-empty full content`, () => {
      // An entry published with an empty body would still emit a complete,
      // well-formed <item> whose <content:encoded> is an empty CDATA block —
      // invisible to the count assertions above.
      const xml = readDistFile(`${dir}/rss.xml`)!;
      const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
      // Count guard: zero parsed items would make the loop below vacuous.
      expect(items.length, `${dir}/rss.xml: parsed ${items.length} <item> blocks`).toBe(
        expected.length
      );
      for (const item of items) {
        const link = /<link>(.*?)<\/link>/.exec(item[1])?.[1] ?? '(item without <link>)';
        const content =
          /<content:encoded[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/.exec(item[1])?.[1];
        expect(
          content?.trim().length,
          `${link}: RSS <content:encoded> is EMPTY — an entry was published without content`
        ).toBeGreaterThan(0);
      }
    });

    it(`${dir}/feed.json is valid JSON Feed with exactly the non-draft ${collection}`, () => {
      const raw = readDistFile(`${dir}/feed.json`);
      expect(raw, `dist/${dir}/feed.json missing`).toBeTruthy();
      let feed: { version?: string; items?: Array<{ id?: string; url?: string; content_text?: string }> };
      expect(() => {
        feed = JSON.parse(raw!);
      }, `dist/${dir}/feed.json is not valid JSON`).not.toThrow();
      expect(feed!.version, 'not a JSON Feed document').toMatch(
        /^https:\/\/jsonfeed\.org\/version\/1\.\d$/
      );
      const items = feed!.items;
      expect(Array.isArray(items), 'JSON Feed has no items array').toBe(true);
      for (const item of items!) {
        expect(item.id && item.url, `JSON Feed item without id/url in ${dir}/feed.json`).toBeTruthy();
        expect(
          typeof item.content_text === 'string' && item.content_text.trim().length > 0,
          `JSON Feed item ${item.id} has no full content_text — feeds must carry full content, not excerpts`
        ).toBe(true);
      }
      const slugs = items!.map((i) => new URL(i.url!).pathname.split('/').filter(Boolean).pop()!).sort();
      expect(slugs, `${dir}/feed.json item set disagrees with the collection`).toEqual(expected);
      expect(slugs, `${dir}/feed.json item count disagrees with the collection`).toHaveLength(
        expected.length
      );
    });
  }
});

describe('/robots.txt', () => {
  const robots = readDistFile('robots.txt');

  it('is emitted and references the sitemap', () => {
    expect(robots, 'dist/robots.txt missing').toBeTruthy();
    expect(robots!.trim()).toContain(`Sitemap: ${SITE_URL}/sitemap-index.xml`);
  });

  it('contains no Disallow: rule — all site content stays crawlable', () => {
    const disallows = robots!.split('\n').filter((l) => /^\s*Disallow:/i.test(l));
    expect(
      disallows,
      'robots.txt grew Disallow rules — policy is that no site content may be disallowed'
    ).toEqual([]);
  });

  it('advertises the agent manifest at the servable non-dot path, before any /.well-known/ mention', () => {
    const primary = robots!.indexOf(`${SITE_URL}/agent.json`);
    const secondary = robots!.indexOf(`${SITE_URL}/.well-known/agent.json`);
    expect(primary, 'robots.txt does not advertise /agent.json at all').toBeGreaterThanOrEqual(0);
    if (secondary !== -1) {
      expect(primary, 'robots.txt mentions /.well-known/ before the servable /agent.json').toBeLessThan(
        secondary
      );
    }
  });
});

describe('legal pages (/privacy/, /terms/) are never mirrored', () => {
  // Phrases lifted verbatim from each page's rendered BODY and verified
  // unique across dist/ (they appear ONLY in the canonical HTML). The
  // presence self-check below fails loudly if the pages are rewritten, so
  // the absence assertions can never rot into vacuous passes.
  const LEGAL_PAGES = [
    {
      name: '/privacy/',
      canonicalFile: 'privacy/index.html',
      phrases: [
        'no Formspree, no Typeform, no Google Forms',
        "It isn't used to profile or track you",
      ],
    },
    {
      name: '/terms/',
      canonicalFile: 'terms/index.html',
      phrases: [
        'Service descriptions are indicative. Specific scope, timelines and fees are agreed in writing.',
      ],
    },
  ];

  it('no machine-readable surface carries a legal-page body sentence', () => {
    const distFiles = allDistFiles();
    for (const { name, canonicalFile, phrases } of LEGAL_PAGES) {
      const canonical = readDistFile(canonicalFile)!;
      for (const phrase of phrases) {
        expect(
          canonical.includes(phrase),
          `"${phrase.slice(0, 50)}…" no longer appears in dist/${canonicalFile} — pick fresh distinctive phrases for this test`
        ).toBe(true);

        for (const file of distFiles) {
          if (file === canonicalFile) continue;
          const data = readFileSync(join(DIST, file), 'utf8');
          expect(
            data.includes(phrase),
            `LEGAL LEAK: a body sentence of ${name} appears in dist/${file} — legal-page text must exist only as canonical HTML`
          ).toBe(false);
        }
      }
    }
  });

  it('no .md twin exists for either legal page', () => {
    for (const twin of allDistFiles().filter((f) => f.endsWith('.md'))) {
      expect(
        /^privacy\b|^terms\b|\/privacy\/|\/terms\//.test(twin),
        `dist/${twin} mirrors a legal page — privacy/terms bodies are deliberately never transcribed`
      ).toBe(false);
    }
  });
});

describe('GitHub Pages serving constraints', () => {
  // MEASURED LIVE against production on 2026-08-22: GitHub Pages does NOT
  // serve ANY dot-prefixed path on this host. /.nojekyll IS in the deployed
  // artifact and still answers 404, as do /.well-known/agent.json and
  // /.well-known/security.txt, while non-dot paths of the same build and
  // deploy answer 200. So .nojekyll does NOT make dot-paths servable here,
  // and a file can be present and correct in dist/ yet 404 live — which is
  // why the servable non-dot copies (/agent.json, /security.txt) and every
  // advertisement pointing at THEM are asserted above. The /.well-known/
  // emissions stay for when the host serves them.
  it('emits .nojekyll anyway — correct hygiene even though it did not fix dot-path serving', () => {
    expect(
      existsSync(join(DIST, '.nojekyll')),
      '.nojekyll is missing from dist/ — GitHub Pages will Jekyll-process the build'
    ).toBe(true);
  });
});

/**
 * VISION.md: what a machine is told never differs from what a person is shown.
 *
 * The human pages already publish one commitment, in one wording:
 * "We promise a meeting within one week of first contact." The two machine
 * surfaces (agent.json and llms.txt) used to say something weaker — a first
 * *response* within a *working* week. This pin is the independent copy of
 * the human sentence; it is not imported from the generators, so a generator
 * that drifts cannot pass by agreeing with itself.
 */
const MEETING_PROMISE = 'We promise a meeting within one week of first contact.';
/** Human pages capitalise We/we by sentence position; the words are the same. */
const MEETING_PROMISE_RE = /we promise a meeting within one week of first contact/i;

function collapsedSource(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8').replace(/\s+/g, ' ');
}

describe('one-week meeting promise — people and machines, same words', () => {
  const humanSources = [
    'src/data/static-markdown.ts',
    'src/data/site-content.ts',
    'src/pages/contact.astro',
    'src/pages/services.astro',
    'src/pages/work/[slug].astro',
    'src/pages/about.astro',
    'src/pages/index.astro',
  ];

  it('every listed human source still states the published promise', () => {
    for (const rel of humanSources) {
      expect(
        collapsedSource(rel),
        `${rel} no longer states the one-week meeting promise — that wording is a live public commitment, not a copy-edit`
      ).toMatch(MEETING_PROMISE_RE);
    }
  });

  it('machine surfaces state that same promise in the same words', () => {
    expect(
      collapsedSource('src/data/wellknown-agent.ts'),
      'src/data/wellknown-agent.ts drifted from the human one-week meeting promise'
    ).toContain(MEETING_PROMISE);
    expect(
      collapsedSource('src/pages/llms.txt.ts'),
      'src/pages/llms.txt.ts drifted from the human one-week meeting promise'
    ).toContain(MEETING_PROMISE);

    const agent = JSON.parse(readDistFile('agent.json') ?? '{}') as {
      contact?: { responseTime?: string };
    };
    expect(
      agent.contact?.responseTime,
      'dist/agent.json contact.responseTime is not the human one-week meeting promise'
    ).toContain(MEETING_PROMISE);
    expect(
      readDistFile('llms.txt'),
      'dist/llms.txt drifted from the human one-week meeting promise'
    ).toContain(MEETING_PROMISE);
  });
});
