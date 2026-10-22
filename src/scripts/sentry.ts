/**
 * Static-site Sentry bootstrap.
 *
 * Vite exposes only PUBLIC_* variables to browser bundles. This module stays
 * inert in development, preview and test builds so those environments cannot
 * consume the production error budget or send visitor data to Sentry.
 *
 * Sentry itself (~31 KB gzipped, three times the site's CSS) is fetched only
 * when the first uncaught error or unhandled rejection happens, so the visits
 * that never fail never download it. Errors raised while it loads are queued
 * and sent once it is up; from then on Sentry's own global handlers take over.
 * The DSN stays in this small page-load module, where
 * ops/verify-production.sh looks for it.
 */
const dsn = import.meta.env.PUBLIC_AUT_SENTRY_WEB_DSN;

// Preserve v10's IP-revealing query-key filters. Cookies and headers are off.
const IP_KEY_TERMS = ['forwarded', '-ip', 'remote-', 'via', '-user'];

if (import.meta.env.PROD && dsn) {
  const pending: unknown[] = [];
  const onError = (event: ErrorEvent) => report(event.error ?? event.message);
  const onRejection = (event: PromiseRejectionEvent) => report(event.reason);
  const report = (error: unknown) => {
    pending.push(error);
    if (pending.length > 1) return; // already loading
    import('@sentry/browser')
      .then((Sentry) => {
        Sentry.init({
          dsn,
          environment: 'production',
          // The commit deploy.yml built, so an issue names the deploy that shipped it.
          release: import.meta.env.PUBLIC_SENTRY_RELEASE,
          // Sentry 11 removed sendDefaultPii and its dataCollection defaults collect
          // everything, so disable identity, cookie, header and body collection.
          // Keep the other restrictive v10 settings. userInfo: false keeps
          // Sentry from inferring the visitor's IP address (infer_ip: 'never').
          dataCollection: {
            userInfo: false,
            cookies: false,
            httpHeaders: false,
            httpBodies: [],
            urlQueryParams: { deny: IP_KEY_TERMS },
            genAI: { inputs: false, outputs: false },
            databaseQueryData: false,
          },
          // This project is for error detection. Performance telemetry remains off.
          tracesSampleRate: 0,
          // Sentry 11 removed enableLogs; logs are always on and only ship when
          // something calls Sentry.logger.* or adds a log-forwarding integration.
          // Nothing here does, but the privacy page tells visitors exactly what
          // Sentry receives, so any log is dropped rather than relying on that.
          beforeSendLog: () => null,
        });
        window.removeEventListener('error', onError);
        window.removeEventListener('unhandledrejection', onRejection);
        for (const queued of pending) Sentry.captureException(queued);
      })
      // ponytail: an offline or blocked chunk drops the report; nothing to retry against.
      .catch(() => {});
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
}
