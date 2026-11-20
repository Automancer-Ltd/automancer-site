import { expect, test } from '@playwright/test';

interface Report {
  exception?: { values?: { type?: string; stacktrace?: { frames?: { filename?: string; lineno?: number; colno?: number }[] } }[] };
  request?: { url?: string };
  breadcrumbs?: unknown[];
  release?: string;
}

// Inspect the actual SDK envelope, with delivery intercepted even in production.
// A config assertion cannot catch a new SDK attaching personal data elsewhere.
test('error reports keep source locations without raw browser data', async ({ page }) => {
  const reports: Report[] = [];
  const envelopes: string[] = [];
  const kinds: string[] = [];
  await page.route(/https:\/\/(?:[^/]*sentry\.io|example\.invalid)\//, async (route) => {
    const body = route.request().postData() ?? '';
    envelopes.push(body);
    const [, ...items] = body.split('\n');
    for (const [index, line] of items.entries()) {
      if (!line) continue;
      if (index % 2 === 0) {
        kinds.push((JSON.parse(line) as { type: string }).type);
        continue;
      }
      const item = JSON.parse(line) as Report;
      if (item.exception) reports.push(item);
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.route('**/challenges.cloudflare.com/**', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: 'window.turnstile={getResponse:()=>"journey-token",reset(){},render(){}};',
  }));
  await page.route('**/telemetry-probe*', (route) => route.fulfill({ status: 503, body: 'unavailable' }));
  // The lazily loaded SDK must work under the page's Trusted Types policy.
  await page.addInitScript(() => {
    const refused: string[] = [];
    document.addEventListener('securitypolicyviolation', (event) => refused.push(event.effectiveDirective));
    Object.defineProperty(window, '__refused', { value: refused });
  });
  await page.goto('/contact/?campaign=FACTORY_TEST_QUERY#FACTORY_TEST_FRAGMENT');
  await page.getByLabel('Email', { exact: true }).fill('FACTORY_TEST_FORM@example.com');
  expect(envelopes, 'monitoring stays quiet before an error').toHaveLength(0);
  await page.evaluate(() => {
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('FACTORY_TEST_BOOTSTRAP') }));
  });
  await expect.poll(() => reports.length).toBe(1);
  await page.evaluate(async () => {
    window.dispatchEvent(new Event('visibilitychange'));
    history.pushState({}, '', '/FACTORY_TEST_PATH?campaign=FACTORY_TEST_HISTORY#FACTORY_TEST_HASH');
    console.warn('FACTORY_TEST_CONSOLE', { business: 'FACTORY_TEST_BUSINESS' });
    await fetch('/telemetry-probe?detail=FACTORY_TEST_FETCH');
    const cause = new Error('FACTORY_TEST_CAUSE');
    cause.name = 'FACTORY_TEST_NAME';
    const error = new TypeError('FACTORY_TEST_MESSAGE', { cause });
    error.stack = [
      'TypeError: FACTORY_TEST_MESSAGE',
      `    at FACTORY_TEST_FUNCTION (${location.origin}/assets/js/main.js?v=FACTORY_TEST_STACK#FACTORY_TEST_FRAME:12:34)`,
      `    at submit (${location.origin}/FACTORY_TEST_FRAME_PATH:56:78)`,
    ].join('\n');
    window.dispatchEvent(new ErrorEvent('error', { error }));
  });
  await expect.poll(() => reports.length).toBe(2);
  await page.evaluate(() => {
    window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', {
      promise: Promise.resolve(),
      reason: { description: 'FACTORY_TEST_OBJECT' },
    }));
  });
  await expect.poll(() => reports.length).toBe(3);

  const markers = [...new Set(envelopes.join('\n').match(/FACTORY_TEST_[A-Z_]+/g))].sort();
  expect(markers, 'synthetic personal details in intercepted reports').toEqual([]);
  expect(kinds, 'monitoring sends only error events').toEqual(['event', 'event', 'event']);
  const report = reports[1];
  const exception = report.exception?.values?.find((value) => value.type === 'TypeError');
  expect(exception?.stacktrace?.frames).toContainEqual(expect.objectContaining({
    filename: new URL('/assets/js/main.js', page.url()).href,
    lineno: 12,
    colno: 34,
  }));
  expect(report.request?.url).toBe(new URL('/contact/', page.url()).href);
  expect(report.breadcrumbs ?? []).toHaveLength(0);
  if (process.env.JOURNEY_URL) expect(report.release).toMatch(/^[a-f0-9]{40}$/);
  expect(await page.evaluate(() => (window as unknown as { __refused: string[] }).__refused), 'policy refusals while reporting').toEqual([]);
});
