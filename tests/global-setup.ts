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

const ROOT = fileURLToPath(new URL('..', import.meta.url));

export default function globalSetup(): void {
  if (process.env.SKIP_BUILD === '1') {
    return;
  }
  const result = spawnSync('pnpm', ['run', 'build'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    throw new Error(
      '`pnpm run build` failed — the test suite audits dist/ and cannot run without a fresh production build.'
    );
  }
}
