/**
 * Content never waits for main.js (t25989). The scroll reveals used to start
 * every `.reveal` at opacity 0 and leave it to main.js to show it, so:
 *
 * - a page whose script never ran (a failed request, a blocked file) kept 6,567
 *   characters of text invisible across 9 pages, 71% of /services/ and three of
 *   its four prices among them;
 * - a reveal that peeked onto the first screen, a case study's headline figures
 *   on a 1280×800 laptop, stayed blank until the visitor scrolled, because the
 *   observer's threshold never saw enough of it.
 *
 * Now global.css fades every reveal in from first paint, and main.js hides again
 * only what is still below the fold. These hold both halves, and that the scroll
 * reveal itself still happens.
 */
import { expect, test, type Page } from '@playwright/test';

async function sitemapPaths(page: Page): Promise<string[]> {
  const xml = await (await page.request.get('/sitemap-0.xml')).text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname).concat('/no-such-page-reveal/');
}

/** Wait for every animation that ends (the reveals), not the ambient ones that loop. */
async function settle(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document.getAnimations()
        .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
}

/** Text in <main> a reader cannot see because it, or an ancestor, is (nearly) transparent. */
function invisibleText(onScreenOnly: boolean): string[] {
  const found: string[] = [];
  const walker = document.createTreeWalker(document.querySelector('main')!, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const text = walker.currentNode.textContent!.trim();
    const el = walker.currentNode.parentElement!;
    if (!text || el.getClientRects().length === 0 || el.closest('[aria-hidden="true"], .sr-only')) continue;
    if (onScreenOnly) {
      const box = el.getBoundingClientRect();
      if (box.top >= innerHeight || box.bottom <= 0) continue;
    }
    let opacity = 1;
    for (let a: Element | null = el; a; a = a.parentElement) opacity *= Number(getComputedStyle(a).opacity);
    if (opacity < 0.5) found.push(`${text.slice(0, 60)} (opacity ${opacity.toFixed(2)})`);
  }
  return found;
}

test('every page shows all of its text when main.js never runs', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'one width is enough: the reveal rules are the same at every width');
  test.setTimeout(120_000);
  await page.route('**/assets/js/main.js*', (route) => route.abort());
  const failures: string[] = [];
  for (const path of await sitemapPaths(page)) {
    await page.goto(path);
    await settle(page);
    failures.push(...(await page.evaluate(invisibleText, false)).map((t) => `${path}: ${t}`));
  }
  expect(failures, 'text left invisible without main.js').toEqual([]);
});

test('what is on the first screen shows without scrolling', async ({ page }) => {
  test.setTimeout(120_000);
  const failures: string[] = [];
  for (const path of await sitemapPaths(page)) {
    await page.goto(path);
    await page.waitForFunction(() => document.readyState === 'complete');
    await settle(page);
    failures.push(...(await page.evaluate(invisibleText, true)).map((t) => `${path}: ${t}`));
  }
  expect(failures, 'first-screen text still invisible after the page settled').toEqual([]);
});

test('an offer below the fold still fades in as it scrolls into view', async ({ page }) => {
  await page.goto('/services/');
  await page.waitForFunction(() => document.documentElement.classList.contains('reveal-armed'));
  const lede = page.locator('.offer__lede.reveal').last();
  await expect(lede).toHaveCSS('opacity', '0');
  await lede.scrollIntoViewIfNeeded();
  await expect(lede).toHaveClass(/is-visible/);
  await settle(page);
  await expect(lede).toHaveCSS('opacity', '1');
});
