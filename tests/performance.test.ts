/**
 * Page-weight budgets — the gate that makes regressions impossible to miss.
 *
 * Every layout page ships the shared layout assets plus its own HTML and
 * styles. One default total budget covers the whole build, including new
 * pages without a budget entry.
 *
 * Budgets are MEASURED, never guessed: `node tests/support/perf-cli.ts --csv`
 * against the build `pnpm run test` makes (monitoring on, as production ships
 * it: tests/support/build-env.ts; method and tables in docs/PERFORMANCE.md).
 * deploy.yml runs these same budgets on the exact dist/ it publishes.
 * Budget = measured + headroom, where headroom = max(1024, ceil(measured × 0.02)):
 * slack for copy edits and hashing noise, small enough that adding an asset,
 * font weight or dependency-sized script trips it.
 *
 * If this fails on a deliberate change: a page that genuinely needs more gets an
 * entry in LAYOUT_EXCEPTIONS with its reason; a change to the shared payload
 * re-measures LAYOUT_MEASURED and explains the jump in docs/PERFORMANCE.md.
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allHtmlFiles } from './support/dist';
import { DIST, measureAllPages } from './support/perf';

/** Measured 2026-11-20: heaviest fixed-budget page (/contact/, 163,598 B), after splitting page styles out of the shared stylesheet (t22218). */
const LAYOUT_MEASURED = 163598;

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

/** JS measured 2026-11-20; fonts 2026-11-12. Identical on every layout page. */
const MEASURED_JS = 11156; // main.js (7,236 B, with t21709's offscreen pause) + the Sentry bootstrap module (3,920 B, src/scripts/sentry.ts)
/**
 * The Sentry SDK chunk, fetched only when a visitor's page first throws. It
 * is the error path's whole cost, so it is pinned too: importing the SDK as a
 * namespace once shipped all of it (423,059 B, replay and feedback included)
 * and nothing failed (t21303). Re-measured 2026-11-20 on @sentry/browser 11.14.0 (t21367).
 */
const MEASURED_ON_ERROR_JS = 90372;
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
    const budget = MEASURED_JS + headroom(MEASURED_JS); // 12180 B from 11156 B @ 2026-11-20
    for (const p of layoutPages) {
      expect(
        p.jsBytes,
        `${p.route}: js ${p.jsBytes} B > budget ${budget} B (measured ${MEASURED_JS} B on 2026-11-20). ` +
          'A script grew or a new one was added.',
      ).toBeLessThanOrEqual(budget);
    }
  });

  it('keeps the code a visitor downloads on their first error within budget', () => {
    // Every emitted chunk no page names in a <script src>: loaded by import() only.
    const named = allHtmlFiles().map((page) => page.html).join('\n');
    const lazy = readdirSync(join(DIST, '_astro'))
      .filter((name) => name.endsWith('.js') && !named.includes(`/_astro/${name}`))
      .map((name) => ({ name, bytes: statSync(join(DIST, '_astro', name)).size }));
    expect(
      lazy.length,
      'no lazily loaded chunk in dist/_astro: this build has monitoring off, unlike production. ' +
        'Run `pnpm run test` (it builds with tests/support/build-env.ts) or build with PUBLIC_AUT_SENTRY_WEB_DSN set.',
    ).toBeGreaterThan(0);
    const total = lazy.reduce((sum, chunk) => sum + chunk.bytes, 0);
    const budget = MEASURED_ON_ERROR_JS + headroom(MEASURED_ON_ERROR_JS); // 92518 B from 90703 B @ 2026-11-20
    expect(
      total,
      `lazily loaded JS ${total} B > budget ${budget} B (measured ${MEASURED_ON_ERROR_JS} B on 2026-11-20): ` +
        `${lazy.map((chunk) => `${chunk.name} ${chunk.bytes} B`).join(', ')}. ` +
        'Name each Sentry export src/scripts/sentry.ts uses in its import() destructuring; a namespace import ships the whole SDK.',
    ).toBeLessThanOrEqual(budget);
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
