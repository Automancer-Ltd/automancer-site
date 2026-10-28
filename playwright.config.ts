import { defineConfig } from '@playwright/test';

/**
 * The visitor journey (tests/journey/). Hermetic by default: it serves the
 * dist/ that `pnpm run build` produced. Set JOURNEY_URL to run the same
 * journey read-only against a live origin (the deploy workflow does, after
 * publishing). The enquiry endpoint and Turnstile are always stubbed, so no
 * run ever sends a real enquiry.
 */
const live = process.env.JOURNEY_URL;
const PORT = 4399;

export default defineConfig({
  testDir: 'tests/journey',
  outputDir: 'test-results',
  retries: live ? 2 : 0,
  reporter: [['list']],
  use: { baseURL: live ?? `http://127.0.0.1:${PORT}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: live
    ? undefined
    : {
        // --ignore-lock keeps it in the foreground: astro 7 daemonizes when an agent runs it, leaking the server.
        command: `node_modules/.bin/astro preview --host 127.0.0.1 --port ${PORT} --ignore-lock`,
        url: `http://127.0.0.1:${PORT}/`,
        reuseExistingServer: false,
      },
});
