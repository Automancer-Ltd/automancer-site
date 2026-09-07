/**
 * Page-weight budgets — the gate that makes regressions impossible to miss.
 *
 * Every budget below is derived from a MEASURED build of 2026-08-31
 * (one pass of every page against a fresh `PUBLIC_AUT_SENTRY_WEB_DSN=""`
 * build, matching the empty DSN the 2026-08-22 measurement used and that
 * `ci.yml`'s test job builds with; deploy.yml's Build step injects the same
 * variable from `vars.PUBLIC_AUT_SENTRY_WEB_DSN`. Full tables and method in
 * docs/PERFORMANCE.md). Budget = measured + headroom,
 * where headroom = max(1024, ceil(measured × 0.02)) — enough slack for
 * routine copy edits and Astro hashing noise, small enough that adding an
 * asset, font weight or dependency-sized script trips it. Never round a
 * budget to a number that "looks right": re-measure instead.
 *
 * If this test fails on a deliberate change: re-run
 *   node tests/support/perf-cli.ts --csv
 * against the fresh build, update the measured values here with the new date,
 * and explain the jump in docs/PERFORMANCE.md. A budget raised without a new
 * measurement is a guess, not a gate.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { measureAllPages, DIST, ROOT } from './support/perf';

/** Measured 2026-08-31: total page weight per route, bytes (see --csv command above). */
const MEASURED_TOTAL: Record<string, number> = {
  '/': 205797,
  '/404/': 202696,
  '/about/': 201722,
  '/contact/': 209842,
  '/developers/': 204304,
  '/field-notes/': 202589,
  '/field-notes/automation-for-care-providers-where-to-start/': 204202,
  '/field-notes/b2b-trade-portals-what-to-build-first/': 204679,
  '/field-notes/cqc-compliance-evidence-stop-scrambling/': 203978,
  '/field-notes/credit-hire-website-compliance-trust-checklist/': 206179,
  '/field-notes/five-signs-spreadsheet-problem/': 205242,
  // Measured 2026-09-07 (added with this post): node tests/support/perf-cli.ts --csv
  // against a fresh PUBLIC_AUT_SENTRY_WEB_DSN="" build.
  '/field-notes/how-ai-agents-actually-make-decisions/': 203444,
  '/field-notes/manufacturing-order-processing-phone-and-memory-pricing/': 204965,
  '/field-notes/new-business-website-legal-compliance-checklist/': 205529,
  '/field-notes/self-storage-software-what-to-check-before-you-sign/': 204657,
  '/field-notes/small-business-website-cost-2026/': 204682,
  '/field-notes/what-does-an-ai-agent-actually-cost/': 203469,
  '/privacy/': 206084,
  '/services/': 207911,
  '/terms/': 196795,
  '/work/': 200277,
  '/work/care-provider-transformation/': 204691,
  '/work/debiaser-ai-product/': 202299,
  '/work/fast-small-business-websites/': 200418,
  '/work/manufacturer-trade-portal/': 201233,
};

/** Measured 2026-08-31: identical on every layout page (shared layout assets). */
const MEASURED_JS = 4751; // dist/assets/js/main.js — the only external script
const MEASURED_FONTS = 120620; // 4 variable woff2 files reachable from fonts.css

/**
 * Redirect stubs (e.g. /services.html/) are meta-refresh pages with no
 * layout and no assets; they get their own flat ceiling instead of budgets.
 */
const STUB_CEILING = 1024;

function headroom(measured: number): number {
  return Math.max(1024, Math.ceil(measured * 0.02));
}

const pages = measureAllPages();
const layoutPages = pages.filter((p) => !p.file.includes('.html/'));

describe('page-weight budgets', () => {
  it('has a measured budget for every layout page — no page ships unmeasured', () => {
    const unbudgeted = layoutPages.filter((p) => !(p.route in MEASURED_TOTAL));
    expect(
      unbudgeted.map((p) => p.route),
      'these pages have no budget entry. Measure them (node tests/support/perf-cli.ts --csv), ' +
        'add entries derived from those numbers, and note them in docs/PERFORMANCE.md',
    ).toEqual([]);
  });

  it('keeps every layout page within its measured total-weight budget', () => {
    for (const p of layoutPages) {
      const measured = MEASURED_TOTAL[p.route];
      if (measured === undefined) continue; // reported by the previous test
      const budget = measured + headroom(measured);
      expect(
        p.totalBytes,
        `${p.route}: total ${p.totalBytes} B > budget ${budget} B ` +
          `(measured ${measured} B on 2026-08-31 + ${headroom(measured)} B headroom). ` +
          'Something got heavier — see docs/PERFORMANCE.md for how to re-derive.',
      ).toBeLessThanOrEqual(budget);
    }
  });

  it('keeps JavaScript within budget on every layout page', () => {
    const budget = MEASURED_JS + headroom(MEASURED_JS); // 5775 B from 4751 B @ 2026-08-31
    for (const p of layoutPages) {
      expect(
        p.jsBytes,
        `${p.route}: js ${p.jsBytes} B > budget ${budget} B (measured 4751 B on 2026-08-31). ` +
          'A script grew or a new one was added.',
      ).toBeLessThanOrEqual(budget);
    }
  });

  it('keeps font payload within budget on every layout page', () => {
    const budget = MEASURED_FONTS + headroom(MEASURED_FONTS); // 123033 B from 120620 B @ 2026-08-31
    for (const p of layoutPages) {
      expect(
        p.fontBytes,
        `${p.route}: fonts ${p.fontBytes} B > budget ${budget} B (measured 120620 B on 2026-08-31). ` +
          'A new font file or @font-face rule crept in — four variable woff2 files serve ' +
          'every family and weight today.',
      ).toBeLessThanOrEqual(budget);
    }
  });

  it('keeps redirect stubs tiny', () => {
    const stubs = pages.filter((p) => p.file.includes('.html/'));
    expect(stubs.length, 'expected meta-refresh stub pages in dist').toBeGreaterThan(0);
    for (const p of stubs) {
      expect(p.totalBytes, `${p.route}: stub grew past ${STUB_CEILING} B`).toBeLessThanOrEqual(
        STUB_CEILING,
      );
    }
  });

  it('refuses an empty dist the same way dist.ts does', () => {
    const distSrc = readFileSync(join(ROOT, 'tests/support/dist.ts'), 'utf8');
    const perfSrc = readFileSync(join(ROOT, 'tests/support/perf.ts'), 'utf8');
    expect(
      distSrc,
      'dist.ts lost its empty-build throw — restore it, do not weaken perf.ts to match',
    ).toMatch(/if \(cachedPages\.length === 0\)/);
    expect(distSrc).toContain('No HTML files found in ${DIST}');
    expect(
      perfSrc,
      'perf.ts must throw on an empty dist/ the way dist.ts does — without this, page-weight budgets pass vacuously',
    ).toMatch(/if \(cachedMeasurements\.length === 0\)/);
    expect(perfSrc).toContain('No HTML files found in ${DIST}');
    expect(perfSrc).toContain(
      'every page-level assertion in this suite would pass without examining',
    );
  });
});

describe('asset integrity behind the budgets', () => {
  it('never references an asset that is missing from dist/', () => {
    const dangling = pages.flatMap((p) =>
      p.missing.map((m) => `${p.route} -> ${m}`),
    );
    expect(
      dangling,
      'CSS/HTML references point at files that were not emitted — a prune removed ' +
        'something a rule still names, or a rename missed a reference',
    ).toEqual([]);
  });

  it('ships no unreferenced font file (rot-guard mirroring assets.test.ts)', () => {
    const fontDir = join(ROOT, 'public', 'assets', 'fonts');
    const shipped = readdirSync(fontDir).filter((f) => f.endsWith('.woff2')).sort();

    const wired = new Set<string>();
    walkCssForFonts(join(DIST, 'assets', 'css', 'fonts.css'), wired);

    const dead = shipped.filter((f) => !wired.has(`assets/fonts/${f}`));
    expect(
      dead,
      'these woff2 files ship but no emitted CSS references them — delete them or wire them up',
    ).toEqual([]);
    expect(shipped.length).toBeGreaterThan(0);
  });
});

/** Collect url() targets ending in .woff2 from an emitted CSS file (no recursion needed today). */
function walkCssForFonts(cssPath: string, into: Set<string>): void {
  let text: string;
  try {
    text = readFileSync(cssPath, 'utf8');
  } catch {
    return;
  }
  for (const m of text.matchAll(/url\(\s*["']?([^"')\s]+)/g)) {
    const target = m[1].replace(/^https?:\/\/automancer\.uk/, '');
    if (target.endsWith('.woff2')) {
      const rel = target.replace(/^\//, '');
      try {
        readFileSync(join(DIST, rel)); // only count files that actually exist
        into.add(rel);
      } catch {
        /* missing files fail the dangling-reference test above */
      }
    }
  }
}
