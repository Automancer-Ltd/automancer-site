import { defineConfig } from '@playwright/test';
import { TEST_SENTRY_DSN } from './tests/support/build-env';

/**
 * The visitor journey (tests/journey/). Hermetic by default: it builds dist/
 * and serves it as production does, through the edge Worker
 * (ops/edge/local.mjs), on a free 127.0.0.1 port, so the Worker's headers,
 * redirects and twins are tested before a deploy and two runs never collide.
 * Set JOURNEY_URL to run the same journey read-only against a live origin (the
 * deploy workflow does, after publishing). The enquiry endpoint and Turnstile
 * are always stubbed, so no run ever sends a real enquiry.
 */
const live = process.env.JOURNEY_URL;
// Set by the web server's first line (webServer.wait below) before any worker
// starts; each worker reads this file again with it in its environment.
const port = process.env.JOURNEY_PORT;

export default defineConfig({
  testDir: 'tests/journey',
  outputDir: 'test-results',
  retries: live ? 2 : 0,
  reporter: [['list']],
  use: { baseURL: live ?? (port ? `http://127.0.0.1:${port}` : undefined), trace: 'retain-on-failure' },
  projects: [
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: live
    ? undefined
    : {
        // The same monitoring-enabled build the Vitest audit reads, so the
        // telemetry test exercises the real SDK and `check` still passes on the
        // dist/ this leaves behind. That test intercepts envelopes on local and
        // production runs alike.
        command: 'pnpm run build && node ops/edge/local.mjs dist',
        env: { PUBLIC_AUT_SENTRY_WEB_DSN: TEST_SENTRY_DSN },
        wait: { stdout: /at http:\/\/127\.0\.0\.1:(?<journey_port>\d+)\// },
        reuseExistingServer: false,
      },
});
