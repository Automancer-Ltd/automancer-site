/**
 * The monitoring destination every test build uses, so the audited dist/ has
 * the same shape as the one deploy.yml ships: the Sentry bootstrap on every
 * page and the lazily loaded SDK chunk beside it. It cannot receive reports
 * (`.invalid` never resolves), and the journey's telemetry test intercepts
 * delivery anyway.
 */
export const TEST_SENTRY_DSN = 'https://public@example.invalid/1';
