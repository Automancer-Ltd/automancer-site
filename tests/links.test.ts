/**
 * Link and asset integrity across every emitted page — the test that makes
 * refactors safe. A typo'd href, a renamed asset, or a deleted page that is
 * still linked fails here before it fails a visitor.
 *
 * Also enforces the outbound policy: nothing points at localhost, and
 * automancer.uk URLs are always https.
 */
import { describe, expect, it } from 'vitest';
import { allHtmlFiles, distHasFile, resolveInDist } from './support/dist';

/** Collect every href/src/srcset URL from a page with its location. */
interface Ref {
  page: string;
  file: string;
  attr: string;
  value: string;
}

function collectRefs(): Ref[] {
  const refs: Ref[] = [];
  for (const page of allHtmlFiles()) {
    for (const el of page.doc.querySelectorAll('a[href], link[href], [src]')) {
      for (const attr of ['href', 'src'] as const) {
        const value = el.getAttribute(attr);
        if (value !== undefined && value !== null) {
          refs.push({ page: page.route, file: page.file, attr, value });
        }
      }
    }
    // srcset candidates (none today; guarded so future use stays honest).
    for (const el of page.doc.querySelectorAll('[srcset]')) {
      const srcset = el.getAttribute('srcset') ?? '';
      for (const candidate of srcset.split(',')) {
        const url = candidate.trim().split(/\s+/)[0];
        if (url) refs.push({ page: page.route, file: page.file, attr: 'srcset', value: url });
      }
    }
  }
  return refs;
}

const refs = collectRefs();

describe('internal references resolve to emitted files', () => {
  it('every internal href/src points at a real file in dist/', () => {
    const broken: string[] = [];

    for (const ref of refs) {
      const { value } = ref;

      // Non-URL schemes are out of scope for file resolution.
      if (/^(mailto|tel|data|javascript|blob):/i.test(value)) continue;
      // Protocol-relative URLs have no place in a single-origin static build.
      if (value.startsWith('//')) {
        broken.push(`${ref.page}: ${ref.attr}="${value}" is protocol-relative`);
        continue;
      }

      // Pure fragments must target an id in the same document.
      if (value.startsWith('#')) {
        const id = value.slice(1);
        const page = allHtmlFiles().find((p) => p.route === ref.page)!;
        if (!page.doc.querySelector(`[id="${id}"]`)) broken.push(`${ref.page}: ${value} — no element with id="${id}"`);
        continue;
      }

      // Query-only hrefs refer to the current page.
      if (value.startsWith('?')) continue;

      // Absolute URLs on other origins are external (policy-tested below).
      if (/^https?:\/\//i.test(value)) {
        const host = new URL(value).host;
        if (!['automancer.uk', 'www.automancer.uk'].includes(host)) continue;
      }

      const resolved = resolveInDist(ref.file, value);
      if (!resolved || !distHasFile(resolved)) {
        broken.push(`${ref.page}: ${ref.attr}="${value}" resolves to nothing in dist/`);
      }
    }

    expect(broken, `broken internal references:\n${broken.join('\n')}`).toEqual([]);
  });
});

describe('internal page links', () => {
  it('link to the URL GitHub Pages serves, with its trailing slash', () => {
    // GitHub Pages answers /contact with a 301 to /contact/, so every click
    // on a slashless link pays one extra round trip before the page loads.
    const offenders = refs.filter((r) => {
      if (r.attr !== 'href' || !r.value.startsWith('/') || r.value.startsWith('//')) return false;
      const path = r.value.split(/[?#]/)[0]!;
      const last = path.split('/').pop()!;
      return !path.endsWith('/') && !last.includes('.');
    });
    expect(
      offenders.map((r) => `${r.page}: href="${r.value}"`),
      'internal links without a trailing slash (each costs a redirect)'
    ).toEqual([]);
  });
});

describe('outbound reference policy', () => {
  it('never points at localhost or a loopback address', () => {
    const offenders = refs.filter((r) => {
      const value = r.value.trim();
      if (!/^https?:\/\//i.test(value)) return false;
      try {
        return ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(
          new URL(value).hostname
        );
      } catch {
        return false;
      }
    });
    expect(
      offenders.map((r) => `${r.page}: ${r.attr}="${r.value}"`),
      'localhost references leaked into the build'
    ).toEqual([]);
  });

  it('uses https for every automancer.uk URL', () => {
    const offenders = refs.filter((r) => {
      const value = r.value.trim();
      if (!/^http:\/\//i.test(value)) return false; // insecure scheme only
      return /(^|\.)automancer\.uk$/.test(new URL(value).hostname);
    });
    expect(
      offenders.map((r) => `${r.page}: ${r.attr}="${r.value}"`),
      'insecure http:// automancer.uk links shipped'
    ).toEqual([]);
  });
});

describe('build hygiene', () => {
  it('contains no TODO/FIXME markers or lorem ipsum placeholder text', () => {
    const offenders: string[] = [];
    for (const page of allHtmlFiles()) {
      if (/\bTODO\b/.test(page.html)) offenders.push(`${page.route}: contains TODO`);
      if (/\bFIXME\b/.test(page.html)) offenders.push(`${page.route}: contains FIXME`);
      if (/lorem ipsum/i.test(page.html)) offenders.push(`${page.route}: contains lorem ipsum`);
    }
    expect(offenders).toEqual([]);
  });
});
