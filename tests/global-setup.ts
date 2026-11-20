/**
 * Vitest global setup: produce the production build exactly once.
 *
 * Every test in this suite runs against `dist/` — the bytes GitHub Pages
 * will actually serve — never against source templates. Building here means
 * individual test files stay independent and the suite still pays for the
 * build only once.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { TEST_SENTRY_DSN } from './support/build-env';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

export default function globalSetup(): void {
  if (process.env.SKIP_BUILD === '1') {
    return;
  }
  // Vitest sets NODE_ENV=test, and Astro derives `import.meta.env.PROD` from
  // it. Left inherited, the audited dist/ would be a non-production build:
  // `draft: true` entries would leak into it and PROD-gated code would differ
  // from the artifact the deploy job ships. Build the bytes production serves,
  // monitoring included: without a DSN the Sentry bootstrap and its SDK chunk
  // are left out, so the storage and weight audits would never read them.
  const result = spawnSync('pnpm', ['run', 'build'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PUBLIC_AUT_SENTRY_WEB_DSN: process.env.PUBLIC_AUT_SENTRY_WEB_DSN || TEST_SENTRY_DSN,
    },
  });
  if (result.status !== 0) {
    throw new Error(
      '`pnpm run build` failed — the test suite audits dist/ and cannot run without a fresh production build.'
    );
  }
}
