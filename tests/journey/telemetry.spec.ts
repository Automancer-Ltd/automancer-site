import { expect, test } from '@playwright/test';

interface Report {
  exception?: { values?: { value?: string; stacktrace?: { frames?: { filename?: string; lineno?: number }[] } }[] };
  request?: { url?: string };
  breadcrumbs?: unknown[];
  release?: string;
}

// Inspect the actual SDK envelope, with delivery intercepted even in production.
// A config assertion cannot catch a new SDK attaching personal data elsewhere.
test('error reports keep diagnostics without URL details or activity history', async ({ page }) => {
  const reports: Report[] = [];
  const envelopes: string[] = [];
  await page.route(/https:\/\/(?:[^/]*sentry\.io|example\.invalid)\//, async (route) => {
    const body = route.request().postData() ?? '';
    envelopes.push(body);
    for (const line of body.split('\n')) {
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
  await page.goto('/contact/?campaign=FACTORY_TEST_QUERY#FACTORY_TEST_FRAGMENT');
  await page.getByLabel('Email', { exact: true }).fill('FACTORY_TEST_FORM@example.com');
  expect(envelopes, 'monitoring stays quiet before an error').toHaveLength(0);
  await page.evaluate(() => {
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('Telemetry bootstrap probe') }));
  });
  await expect.poll(() => reports.length).toBe(1);
  await page.evaluate(async () => {
    history.pushState({}, '', '/contact/?campaign=FACTORY_TEST_HISTORY#FACTORY_TEST_HASH');
    console.warn('FACTORY_TEST_CONSOLE', { business: 'FACTORY_TEST_BUSINESS' });
    await fetch('/telemetry-probe?detail=FACTORY_TEST_FETCH');
    const error = new Error('Telemetry diagnostic probe');
    error.stack = `Error: Telemetry diagnostic probe\n    at submit (${location.origin}/assets/js/main.js?v=FACTORY_TEST_STACK#FACTORY_TEST_FRAME:12:34)`;
    window.dispatchEvent(new ErrorEvent('error', { error }));
  });
  await expect.poll(() => reports.length).toBe(2);
  const report = reports[1];
  expect(report.exception?.values?.[0].value).toBe('Telemetry diagnostic probe');
  expect(report.exception?.values?.[0].stacktrace?.frames).toContainEqual(expect.objectContaining({
    filename: new URL('/assets/js/main.js', page.url()).href,
    lineno: 12,
  }));
  expect(report.request?.url).toBe(new URL('/contact/', page.url()).href);
  expect(report.breadcrumbs ?? []).toHaveLength(0);
  if (process.env.JOURNEY_URL) expect(report.release).toMatch(/^[a-f0-9]{40}$/);
  expect(envelopes.join('\n'), 'synthetic personal details must never leave the browser').not.toContain('FACTORY_TEST_');
});
