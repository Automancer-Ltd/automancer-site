/**
 * Page-weight budgets — the gate that makes regressions impossible to miss.
 *
 * Every layout page ships the same shared payload (CSS, main.js, four variable
 * woff2 fonts, favicons: 184,676 B on 2026-09-24) plus its own HTML, so one
 * default total budget covers them all. The population is whatever the build
 * emits: a new page is budgeted the moment it exists, with no entry to add.
 *
 * Budgets are MEASURED, never guessed: `node tests/support/perf-cli.ts --csv`
 * against a fresh `PUBLIC_AUT_SENTRY_WEB_DSN=""` build (the empty DSN ci.yml's
 * test job builds with; method and tables in docs/PERFORMANCE.md).
 * Budget = measured + headroom, where headroom = max(1024, ceil(measured × 0.02)):
 * slack for copy edits and hashing noise, small enough that adding an asset,
 * font weight or dependency-sized script trips it.
 *
 * If this fails on a deliberate change: a page that genuinely needs more gets an
 * entry in LAYOUT_EXCEPTIONS with its reason; a change to the shared payload
 * re-measures LAYOUT_MEASURED and explains the jump in docs/PERFORMANCE.md.
 */
import { describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { measureAllPages, DIST, ROOT } from './support/perf';

/** Measured 2026-09-24: heaviest layout page (/contact/, 210,164 B; lightest /terms/, 197,117 B). */
const LAYOUT_MEASURED = 210164;

/**
 * Layout pages that genuinely need more than the default, each with its own
 * measured value and the reason. Empty today: every layout page fits.
 */
const LAYOUT_EXCEPTIONS: Record<string, { measured: number; reason: string }> = {};

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
const defaultBudget = LAYOUT_MEASURED + headroom(LAYOUT_MEASURED);

describe('page-weight budgets', () => {
  it('keeps every layout page within its total-weight budget', () => {
    for (const p of layoutPages) {
      const measured = LAYOUT_EXCEPTIONS[p.route]?.measured ?? LAYOUT_MEASURED;
      const budget = measured + headroom(measured);
      expect(
        p.totalBytes,
        `${p.route}: total ${p.totalBytes} B > budget ${budget} B ` +
          `(measured ${measured} B + ${headroom(measured)} B headroom). ` +
          'Something got heavier — see docs/PERFORMANCE.md for how to re-derive.',
      ).toBeLessThanOrEqual(budget);
    }
  });

  it('lists only live exceptions that the default budget would reject', () => {
    const stale = Object.keys(LAYOUT_EXCEPTIONS).filter((route) => {
      const page = layoutPages.find((p) => p.route === route);
      return !page || page.totalBytes <= defaultBudget;
    });
    expect(
      stale,
      `these exceptions name no built layout page, or the page now fits the default ${defaultBudget} B — delete them`,
    ).toEqual([]);
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

  it('refuses an empty dist instead of passing every page check vacuously', async () => {
    vi.resetModules();
    vi.doMock('node:fs', async (importOriginal) => {
      const fs = await importOriginal<typeof import('node:fs')>();
      const emptyDist = (dir: string, ...rest: unknown[]) =>
        dir === DIST ? [] : (fs.readdirSync as (...a: unknown[]) => unknown)(dir, ...rest);
      return { ...fs, readdirSync: emptyDist };
    });
    try {
      const perf = await import('./support/perf');
      const dist = await import('./support/dist');
      expect(() => perf.measureAllPages()).toThrow(/No HTML files found/);
      expect(() => dist.allHtmlFiles()).toThrow(/No HTML files found/);
    } finally {
      vi.doUnmock('node:fs');
      vi.resetModules();
    }
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
