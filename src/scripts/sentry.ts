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
const release = import.meta.env.PUBLIC_SENTRY_RELEASE;

if (import.meta.env.PROD && dsn) {
  const pending: unknown[] = [];
  const onError = (event: ErrorEvent) => report(event.error ?? event.message);
  const onRejection = (event: PromiseRejectionEvent) => report(event.reason);
  const report = (error: unknown) => {
    pending.push(error);
    if (pending.length > 1) return; // already loading
    // Destructure in the parameter: Rollup tree-shakes a dynamic import only
    // when the members used are named here. Taking the whole namespace
    // (`.then((Sentry) => …)`) shipped every integration in the SDK, replay,
    // feedback and offline storage included: 140 KB gzipped instead of 31 KB.
    import('@sentry/browser')
      .then(({
        init, captureException, eventFiltersIntegration, browserApiErrorsIntegration,
        globalHandlersIntegration, linkedErrorsIntegration, dedupeIntegration,
      }) => {
        const errorTypes = new Set([
          'Error', 'AggregateError', 'EvalError', 'RangeError', 'ReferenceError',
          'SyntaxError', 'TypeError', 'URIError',
        ]);
        const locationOnly = (url: string) => url.split(/[?#]/, 1)[0];
        // The canonical path is baked into the HTML. Even the static 404
        // names its own page instead of carrying the visitor's requested path.
        const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
        const pageUrl = canonical && location.origin + new URL(canonical.href).pathname;
        const sources = new Set(
          Array.from(document.scripts, (script) => locationOnly(script.src))
            .filter((url) => url.startsWith(location.origin + '/')),
        );
        if (pageUrl) sources.add(pageUrl);

        init({
          dsn,
          environment: 'production',
          // The commit deploy.yml built, so an issue names the deploy that shipped it.
          release,
          // Only install error integrations. BrowserSession can send its own
          // envelopes outside beforeSend, which only runs for errors.
          defaultIntegrations: false,
          integrations: [
            eventFiltersIntegration(),
            browserApiErrorsIntegration(),
            globalHandlersIntegration(),
            linkedErrorsIntegration(),
            dedupeIntegration(),
          ],
          sendClientReports: false,
          // Sentry 11 removed sendDefaultPii and its dataCollection defaults collect
          // everything, so disable identity, cookie, header and body collection.
          dataCollection: {
            userInfo: false,
            cookies: false,
            httpHeaders: false,
            httpBodies: [],
            urlQueryParams: false,
            genAI: { inputs: false, outputs: false },
            databaseQueryData: false,
          },
          // This project is for error detection. Performance telemetry remains off.
          tracesSampleRate: 0,
          maxBreadcrumbs: 0,
          beforeSend(event) {
            const exceptions = event.exception?.values;
            if (!exceptions?.length) return null;
            // Messages, rejection objects and stack labels can contain visitor
            // data. Build a fresh event with only the fields used to locate bugs.
            return {
              type: undefined,
              event_id: event.event_id,
              timestamp: event.timestamp,
              platform: 'javascript',
              environment: 'production',
              release,
              request: pageUrl ? { url: pageUrl } : undefined,
              exception: {
                values: exceptions.map(({ type, stacktrace, mechanism }) => ({
                  type: type && errorTypes.has(type) ? type : 'Error',
                  value: 'Browser script error',
                  mechanism: mechanism && {
                    type: 'generic',
                    handled: mechanism.handled,
                    exception_id: mechanism.exception_id,
                    parent_id: mechanism.parent_id,
                    is_exception_group: mechanism.is_exception_group,
                  },
                  stacktrace: {
                    frames: (stacktrace?.frames ?? []).flatMap(({ filename, lineno, colno }) => {
                      const source = filename && locationOnly(filename);
                      return source && sources.has(source)
                        ? [{ filename: source, lineno, colno, in_app: true }]
                        : [];
                    }),
                  },
                })),
              },
            };
          },
          // Sentry 11 removed enableLogs; logs are always on and only ship when
          // something calls Sentry.logger.* or adds a log-forwarding integration.
          // Nothing here does, but the privacy page tells visitors exactly what
          // Sentry receives, so any log is dropped rather than relying on that.
          beforeSendLog: () => null,
        });
        window.removeEventListener('error', onError);
        window.removeEventListener('unhandledrejection', onRejection);
        for (const queued of pending) captureException(queued);
      })
      // ponytail: an offline or blocked chunk drops the report; nothing to retry against.
      .catch(() => {});
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
}
