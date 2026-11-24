/**
 * The shared compression dictionary (t26098), in a real browser. Every page names the release's
 * dictionary in a <link rel="compression-dictionary">; Chromium fetches it while idle, keeps it,
 * and asks for the next page with its hash in Available-Dictionary, and the edge Worker answers
 * with the page compressed against it (`dcz`), about a third of the Brotli size.
 *
 * Locally the Worker has no edge cache, so the dictionary copy is always what comes back. Against
 * production (JOURNEY_URL) a page the data centre keeps only as Brotli is sent as Brotli at once
 * while the dictionary copy is kept for the next view, so there the browser must offer the
 * dictionary and the page must arrive whole either way; ops/verify-production.sh checks the live
 * dictionary copies themselves.
 */
import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';

const live = Boolean(process.env.JOURNEY_URL);

test('a second page arrives compressed against the dictionary the first one named', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const fetched = page.waitForResponse((res) => res.url().includes('/_dictionary/'));
  await page.goto('/');
  const href = await page.locator('link[rel="compression-dictionary"]').getAttribute('href');
  expect(href).toMatch(/^\/_dictionary\/[0-9a-f]{16}\.txt$/);
  const dictionary = await fetched;
  expect(new URL(dictionary.url()).pathname).toBe(href);
  expect(dictionary.status()).toBe(200);
  expect(dictionary.headers()['use-as-dictionary']).toBe('match="/*", match-dest=("document")');
  const hash = createHash('sha256').update(await dictionary.body()).digest('base64');
  await dictionary.finished();

  // The browser stores the dictionary a moment after it arrives: allow it a few pages to start.
  let offered: Record<string, string> = {};
  let coding: string | undefined;
  for (const path of ['/about/', '/services/', '/work/', '/field-notes/']) {
    await page.waitForTimeout(250);
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page.locator('main h1').first(), path).toBeVisible();
    offered = await res!.request().allHeaders();
    coding = (await res!.allHeaders())['content-encoding'];
    if (offered['available-dictionary']) break;
  }
  expect(offered['available-dictionary']).toBe(`:${hash}:`);
  expect(offered['accept-encoding']).toContain('dcz');
  if (live) expect(['dcz', 'br']).toContain(coding);
  else expect(coding).toBe('dcz');
  expect(errors).toEqual([]);
});
