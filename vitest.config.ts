import { defineConfig } from 'vitest/config';

/**
 * Worker cap: this repo does not own the machine.
 *
 * Vitest sizes its pool from `availableParallelism()` by default, which on a
 * 20-core shared box means up to 19 workers from a single `pnpm test`. That is
 * antisocial anywhere more than one thing runs at a time — a shared build box,
 * a CI runner hosting several jobs, or a laptop doing anything else — and the
 * cost scales with the number of test files, so it gets worse silently as the
 * suite grows.
 *
 * Two is plenty here: the suite is I/O-light and the one-off production build
 * in globalSetup dominates the runtime anyway. Raise it deliberately with
 * VITEST_MAX_WORKERS=8 rather than by editing this file, so a machine that
 * genuinely has the headroom can say so without the default changing for
 * everyone else.
 */
const maxWorkers = Number(process.env.VITEST_MAX_WORKERS ?? 2);

export default defineConfig({
  test: {
    // The vitest environment itself is pure Node — no browser, no jsdom.
    // Pages are parsed with node-html-parser (see tests/support/dist.ts for
    // the choice rationale). tests/support/storage-sentinel.ts is the one
    // exception: it spins up its own happy-dom Window per page to actually
    // execute scripts, rather than relying on this environment setting.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Runs `pnpm run build` exactly once before any test file loads.
    globalSetup: ['./tests/global-setup.ts'],
    // The one-off production build can be slow on a cold CI runner.
    hookTimeout: 300_000,
    testTimeout: 30_000,
    // Vitest 4 removed `poolOptions` and `minWorkers`; `maxWorkers` is the
    // supported knob and caps the pool on its own.
    maxWorkers,
    // Share workers and module state across the read-only dist/ audit files so
    // tests/support/dist.ts parses dist/ once per worker instead of 14 times.
    isolate: false,
    fsModuleCache: true,
  },
});
