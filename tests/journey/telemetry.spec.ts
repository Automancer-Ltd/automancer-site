import { expect, test } from '@playwright/test';
import worker, { SENTRY_INGEST, SENTRY_PROJECT } from '../../ops/edge/worker.js';
import { TEST_SENTRY_DSN } from '../support/build-env';
import { serveCheckFrame, stubTurnstile } from './check-frame';

interface Report {
  exception?: { values?: { type?: string; stacktrace?: { frames?: { filename?: string; lineno?: number; colno?: number }[] } }[] };
  request?: { url?: string };
  breadcrumbs?: unknown[];
  release?: string;
}

// Inspect the actual SDK envelope, with delivery intercepted even in production.
// A config assertion cannot catch a new SDK attaching personal data elsewhere.
// The SDK posts to this site's ERROR_TUNNEL (the edge Worker passes it on, t24432);
// a post to Sentry's own address would be refused by the page's CSP and fail below.
test.beforeEach(({ page, baseURL }) => serveCheckFrame(page, baseURL));

test('error reports keep source locations without raw browser data', async ({ page }) => {
  const reports: Report[] = [];
  const envelopes: string[] = [];
  const kinds: string[] = [];
  await page.route('**/_errors', async (route) => {
    const pageOrigin = new URL(page.url()).origin;
    expect(new URL(route.request().url()).origin, 'reports go to the page’s own origin').toBe(pageOrigin);
    const body = route.request().postData() ?? '';
    envelopes.push(body);
    // Pass the real SDK envelope through the checked-in Worker. Local builds use an
    // inert DSN and localhost script URLs, so map both to the production format.
    // A valid report reaches the missing-key check without leaving for Sentry.
    const response = await worker.fetch(new Request('https://automancer.uk/_errors', {
      method: 'POST',
      headers: { Origin: 'https://automancer.uk' },
      body: body
        .replace(TEST_SENTRY_DSN, `${SENTRY_INGEST.replace('https://', 'https://test@')}/${SENTRY_PROJECT}`)
        .replaceAll(`"${pageOrigin}/`, '"https://automancer.uk/'),
    }));
    expect(response.status, 'the real SDK report reaches the Worker signing step').toBe(503);
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
  await stubTurnstile(page);
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
  // An error with a frame from one of the page's own scripts is reported, and only
  // that frame is kept: the other frame's path is not one the page loaded.
  // The page-load module (Sentry bootstrap, prefetch, src/scripts/main.ts) is one of them.
  const ownScript = new URL(
    (await page.locator('script[src*="/_astro/BaseLayout.astro_astro_type_script_"]').getAttribute('src'))!,
    page.url(),
  ).href;
  await page.evaluate(async (ownScript) => {
    window.dispatchEvent(new Event('visibilitychange'));
    history.pushState({}, '', '/FACTORY_TEST_PATH?campaign=FACTORY_TEST_HISTORY#FACTORY_TEST_HASH');
    console.warn('FACTORY_TEST_CONSOLE', { business: 'FACTORY_TEST_BUSINESS' });
    await fetch('/telemetry-probe?detail=FACTORY_TEST_FETCH');
    const cause = new Error('FACTORY_TEST_CAUSE');
    cause.name = 'FACTORY_TEST_NAME';
    const error = new TypeError('FACTORY_TEST_MESSAGE', { cause });
    error.stack = [
      'TypeError: FACTORY_TEST_MESSAGE',
      `    at FACTORY_TEST_FUNCTION (${ownScript}?v=FACTORY_TEST_STACK#FACTORY_TEST_FRAME:12:34)`,
      `    at submit (${location.origin}/FACTORY_TEST_FRAME_PATH:56:78)`,
    ].join('\n');
    window.dispatchEvent(new ErrorEvent('error', { error }));
  }, ownScript);
  await expect.poll(() => reports.length).toBe(1);
  // An error with no frame from the page's own scripts names nothing the site can
  // fix. The bootstrap drops it instead of filing another empty
  // `Error: Browser script error` (AUTOMANCER-SITE-9).
  await page.evaluate(() => {
    const thrown = new Error('FACTORY_TEST_BOOTSTRAP');
    thrown.stack = 'Error: FACTORY_TEST_BOOTSTRAP';
    const outside = new Error('FACTORY_TEST_OUTSIDE');
    outside.stack = [
      'Error: FACTORY_TEST_OUTSIDE',
      '    at FACTORY_TEST_EXTENSION (chrome-extension://FACTORY_TEST_EXTENSION/FACTORY_TEST_SCRIPT.js:1:2)',
    ].join('\n');
    window.dispatchEvent(new ErrorEvent('error', { error: thrown }));
    window.dispatchEvent(new ErrorEvent('error', { error: outside }));
  });
  await page.waitForTimeout(750);
  expect(reports, 'reports with no frame from the site are dropped').toHaveLength(1);
  // A rejection whose reason is not an Error has no stack at all, so it is dropped too.
  await page.evaluate(() => {
    window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', {
      promise: Promise.resolve(),
      reason: { description: 'FACTORY_TEST_OBJECT' },
    }));
  });
  await page.waitForTimeout(750);
  expect(reports, 'rejections with no frame from the site are dropped').toHaveLength(1);

  const markers = [...new Set(envelopes.join('\n').match(/FACTORY_TEST_[A-Z_]+/g))].sort();
  expect(markers, 'synthetic personal details in intercepted reports').toEqual([]);
  expect(kinds, 'monitoring sends only error events').toEqual(['event']);
  const report = reports[0];
  const exception = report.exception?.values?.find((value) => value.type === 'TypeError');
  const frames = exception?.stacktrace?.frames ?? [];
  expect(frames).toContainEqual(expect.objectContaining({
    filename: ownScript,
    lineno: 12,
    colno: 34,
  }));
  expect(frames.map((frame) => frame.filename), 'frames the page did not load').not.toContain(
    new URL('/FACTORY_TEST_FRAME_PATH', page.url()).href,
  );
  expect(report.request?.url).toBe(new URL('/contact/', page.url()).href);
  expect(report.breadcrumbs ?? []).toHaveLength(0);
  // The commit the page itself names, read when the report is made (t26545).
  const builtFrom = await page.locator('meta[name="build-revision"]').getAttribute('content');
  expect(builtFrom).toMatch(/^[a-f0-9]{40}$/);
  expect(report.release).toBe(builtFrom);
  expect(await page.evaluate(() => (window as unknown as { __refused: string[] }).__refused), 'policy refusals while reporting').toEqual([]);
});
