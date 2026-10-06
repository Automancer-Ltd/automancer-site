import * as Sentry from '@sentry/browser';

/**
 * Static-site Sentry bootstrap.
 *
 * Vite exposes only PUBLIC_* variables to browser bundles. This module stays
 * inert in development, preview and test builds so those environments cannot
 * consume the production error budget or send visitor data to Sentry.
 */
const dsn = import.meta.env.PUBLIC_AUT_SENTRY_WEB_DSN;

// The IP-revealing key terms @sentry/browser 10 denied (in headers, cookies
// and query params) on top of its built-in sensitive-key list when
// sendDefaultPii was false. Sentry 11's built-in list no longer includes
// them, so they are carried over here.
const IP_KEY_TERMS = ['forwarded', '-ip', 'remote-', 'via', '-user'];

if (import.meta.env.PROD && dsn) {
  Sentry.init({
    dsn,
    environment: 'production',
    // Sentry 11 removed sendDefaultPii and its dataCollection defaults collect
    // everything, so omitting this block would widen collection. These are the
    // values Sentry 10 derived from sendDefaultPii: false, so visitors get the
    // same treatment the privacy page describes. userInfo: false is what keeps
    // Sentry from inferring the visitor's IP address (infer_ip: 'never').
    dataCollection: {
      userInfo: false,
      cookies: { deny: IP_KEY_TERMS },
      httpHeaders: { deny: IP_KEY_TERMS },
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
}
