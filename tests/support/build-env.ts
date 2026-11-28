/**
 * The monitoring destination every test build uses, so the audited dist/ has
 * the same shape as the one deploy.yml ships: the Sentry bootstrap on every
 * page and the lazily loaded SDK chunk beside it. It cannot receive reports
 * (`.invalid` never resolves), and the journey's telemetry test intercepts
 * delivery anyway.
 */
export const TEST_SENTRY_DSN = 'https://public@example.invalid/1';

/**
 * What the audited build adds to the environment (Vitest's global setup and
 * ops/verify.mjs). Vitest sets NODE_ENV=test, and Astro derives
 * `import.meta.env.PROD` from it: left inherited, the audited dist/ would be a
 * non-production build, with `draft: true` entries in it and PROD-gated code
 * unlike the artifact the deploy ships. Without a DSN the Sentry bootstrap and
 * its SDK chunk are left out, so the storage and weight audits would never
 * read them.
 */
export function auditBuildEnv(env: Record<string, string | undefined>): Record<string, string> {
  return { NODE_ENV: 'production', PUBLIC_AUT_SENTRY_WEB_DSN: env.PUBLIC_AUT_SENTRY_WEB_DSN || TEST_SENTRY_DSN };
}
