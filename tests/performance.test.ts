/**
 * Page-weight budgets — the gate that makes regressions impossible to miss.
 *
 * Every layout page ships the same shared payload (CSS, main.js, four variable
 * woff2 fonts, favicons: 145,928 B on 2026-11-12) plus its own HTML, so one
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
import { describe, expect, it } from 'vitest';
import { measureAllPages } from './support/perf';

/** Measured 2026-11-12: heaviest layout page (/contact/, 174,317 B), after the fonts were cut to the characters the site shows (t19380). */
const LAYOUT_MEASURED = 174317;

/**
 * Layout pages that genuinely need more than the default, each with its own
 * measured value and the reason. Empty today: every layout page fits.
 */
const LAYOUT_EXCEPTIONS: Record<string, { measured: number; reason: string }> = {};

/**
 * Pages whose own HTML grows with the record they publish, so any fixed total
 * budget would fail every few releases. They keep the JS and font checks; the
 * shared payload they carry is the one every other page's total already pins.
 */
const GROWS_WITH_CONTENT: Record<string, string> = {
  '/releases/': 'the whole of CHANGELOG.md, about 1 KB of HTML per release',
};

/** JS measured 2026-11-12 (main.js, waits for a prerendered page to open); fonts 2026-11-12. Identical on every layout page. */
const MEASURED_JS = 5841; // dist/assets/js/main.js — the only external script
const MEASURED_FONTS = 83044; // 4 variable woff2 subsets (ops/fonts/subset.py) reachable from the page CSS

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
    for (const p of layoutPages.filter((page) => !(page.route in GROWS_WITH_CONTENT))) {
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

  it('names only built pages as growing with their content', () => {
    const missing = Object.keys(GROWS_WITH_CONTENT).filter((route) => !layoutPages.some((p) => p.route === route));
    expect(missing, 'GROWS_WITH_CONTENT names pages the build no longer emits — delete them').toEqual([]);
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
    const budget = MEASURED_JS + headroom(MEASURED_JS); // 6865 B from 5841 B @ 2026-11-12
    for (const p of layoutPages) {
      expect(
        p.jsBytes,
        `${p.route}: js ${p.jsBytes} B > budget ${budget} B (measured ${MEASURED_JS} B on 2026-11-12). ` +
          'A script grew or a new one was added.',
      ).toBeLessThanOrEqual(budget);
    }
  });

  it('keeps font payload within budget on every layout page', () => {
    const budget = MEASURED_FONTS + headroom(MEASURED_FONTS); // 84705 B from 83044 B @ 2026-11-12
    for (const p of layoutPages) {
      expect(
        p.fontBytes,
        `${p.route}: fonts ${p.fontBytes} B > budget ${budget} B (measured ${MEASURED_FONTS} B on 2026-11-12). ` +
          'A new font file or @font-face rule crept in, or the subsets grew — four variable woff2 ' +
          'files serve every family and weight today (ops/fonts/subset.py).',
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
});
