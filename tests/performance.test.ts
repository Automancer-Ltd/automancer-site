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
import { allHtmlFiles, pageCheckPages } from './support/dist';
import { DIST, measureAllPages } from './support/perf';

/**
 * Measured 2026-11-21 (t23577): heaviest fixed-budget page (/, 156,733 B; main was already 155,082 B
 * after the day's footer and prefetch changes). Every page carries the fallback font faces in
 * src/styles/fonts.css as inline CSS: nine sized to Arial (t23013, 3,518 B, about 450 B gzipped),
 * then eight sized to Roboto for Android (t23067, 3,065 B, about 270 B gzipped). t23577 added 1,651 B
 * to / (each case card's Sources link and the card styles that let it sit beside the card's link).
 * Re-measured 2026-11-21 (t23850): 161,243 B. Every page now carries the print styles
 * (src/styles/print.css, 3,841 B inline, 1,424 B gzipped), the page's address for the printed
 * footer, and 523 B more main.js (opening the FAQ answers for a print).
 * Re-measured 2026-11-22 (t24026): 161,980 B. The page-load module grew 737 B: phones in Firefox
 * and Safari fetch the links they keep on screen (src/scripts/prefetch.ts).
 */
const LAYOUT_MEASURED = 161980;

/**
 * Layout pages that genuinely need more than the default, each with its own
 * measured value and the reason.
 */
const LAYOUT_EXCEPTIONS: Record<string, { measured: number; reason: string }> = {
  // Measured 2026-11-21 (t22871): 148,994 B + 4,887 B of HTML, CSS and script; + 3,518 B and
  // 3,115 B of fallback font faces every page carries (t23013, t23067). Re-measured 2026-11-21
  // (t23850): 166,982 B with the print styles and main.js every page now carries. Re-measured
  // 2026-11-22 (t24026): 167,719 B with the phone prefetch every page carries.
  '/contact/': {
    measured: 167719,
    reason: 'the "What are you interested in?" choice: five option cards, their styles, and the script that picks one from ?service=',
  },
};

/**
 * Pages whose own HTML grows with the record they publish, so any fixed total
 * budget would fail every few releases. They keep the JS and font checks; the
 * shared payload they carry is the one every other page's total already pins.
 */
const GROWS_WITH_CONTENT: Record<string, string> = {
  '/releases/': 'the whole of CHANGELOG.md, about 1 KB of HTML per release',
};

/** JS measured 2026-11-22. Identical on every layout page. */
const MEASURED_JS = 12149; // main.js (6,326 B; opens the FAQ for a print, t23850) + the one page-load module (5,823 B): the Sentry bootstrap (src/scripts/sentry.ts) and the Firefox/Safari prefetch (src/scripts/prefetch.ts: hover ~1,160 B, t23288; touch screens +737 B, t24026)
/**
 * The Sentry SDK chunk, fetched only when a visitor's page first throws. It
 * is the error path's whole cost, so it is pinned too: importing the SDK as a
 * namespace once shipped all of it (423,059 B, replay and feedback included)
 * and nothing failed (t21303). Re-measured 2026-11-20 on @sentry/browser 11.14.0 (t21367).
 */
const MEASURED_ON_ERROR_JS = 90372;
const MEASURED_FONTS = 68440; // 4 variable woff2 subsets (ops/fonts/subset.py) reachable from the page CSS

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
    const budget = MEASURED_JS + headroom(MEASURED_JS); // 13173 B from 12149 B @ 2026-11-22
    for (const p of layoutPages) {
      expect(
        p.jsBytes,
        `${p.route}: js ${p.jsBytes} B > budget ${budget} B (measured ${MEASURED_JS} B on 2026-11-22). ` +
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
    const budget = MEASURED_FONTS + headroom(MEASURED_FONTS); // 69809 B from 68440 B @ 2026-11-20
    for (const p of layoutPages) {
      expect(
        p.fontBytes,
        `${p.route}: fonts ${p.fontBytes} B > budget ${budget} B (measured ${MEASURED_FONTS} B on 2026-11-20). ` +
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
  it('ships each page with its styles and starts font requests early under CSP', () => {
    for (const page of pageCheckPages()) {
      const head = page.doc.querySelector('head')!;
      const styles = head.querySelectorAll('style');
      const fonts = head.querySelectorAll('link[rel="preload"][as="font"]');
      const policy = head.querySelector('meta[http-equiv="content-security-policy"]')!;
      const metadata = head.querySelector('title')!;
      expect(head.querySelectorAll('link[rel="stylesheet"], link[as="style"]'), page.route).toHaveLength(0);
      expect(styles.length, page.route).toBeGreaterThan(0);
      expect(fonts.length, page.route).toBeGreaterThan(0);
      for (const hint of [...fonts, ...styles]) {
        expect(hint.range[0], page.route).toBeGreaterThanOrEqual(policy.range[1]);
      }
      for (const preload of fonts) {
        expect(preload.range[1], page.route).toBeLessThanOrEqual(metadata.range[0]);
      }
    }
  });

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
