/**
 * Every published page stays readable on a 320px screen and with text
 * enlarged to 200% (WCAG 1.4.10 reflow, 1.4.4 resize text). `body` hides
 * horizontal overflow, so the page never scrolls sideways: text that does not
 * fit is clipped instead, and a document-width check cannot see it. This walks
 * each painted line of text in <main> and fails when one runs past the screen
 * or past an ancestor that clips it, as "Computed" did in a case study's
 * figures at 1280px and "Live in production" did on a 320px phone (t21036).
 *
 * The page list is the served sitemap plus one missing URL for the 404.
 */
import { expect, test, type Page } from '@playwright/test';

const CASES = {
  mobile: [
    { width: 320, text: '100%' },
    { width: 390, text: '100%' },
    { width: 390, text: '200%' },
  ],
  desktop: [
    // A portrait tablet: between the phone and laptop layouts, where a grid
    // can keep a span its narrower column count no longer has (t23850).
    { width: 768, text: '100%' },
    { width: 1280, text: '100%' },
    { width: 1280, text: '200%' },
  ],
} as const;

async function sitemapPaths(page: Page): Promise<string[]> {
  const xml = await (await page.request.get('/sitemap-0.xml')).text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname);
}

/** Text runs in <main> painted outside the screen or outside an ancestor that clips them. */
function clippedText(): string[] {
  // Cells drawn edge to edge: the next one covers whatever crosses the border.
  const PANELS = '.stat, .rung, .offer, .case-card, .principle, .promise, .service-option';
  const viewport = document.documentElement.clientWidth;
  const failures: string[] = [];
  const walker = document.createTreeWalker(document.querySelector('main')!, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (!node.textContent!.trim()) continue;
    const el = node.parentElement!;
    if (getComputedStyle(el).visibility === 'hidden' || el.closest('[aria-hidden="true"], .sr-only')) continue;
    // The visible band is the screen narrowed by every clipping ancestor. A
    // scroll container that fits the screen (a code block) is a fair way to
    // show a long line, so text inside one is not counted.
    let left = 0;
    let right = viewport;
    let scrolls = false;
    for (let a: Element | null = el; a && a !== document.documentElement; a = a.parentElement) {
      if (a.matches(PANELS)) {
        // A panel's neighbour paints over text that leaves it, so its edge clips too.
        const box = a.getBoundingClientRect();
        left = Math.max(left, box.left);
        right = Math.min(right, box.right);
      }
      const overflow = getComputedStyle(a).overflowX;
      if (overflow === 'visible') continue;
      const box = a.getBoundingClientRect();
      if ((overflow === 'auto' || overflow === 'scroll') && box.left >= -1 && box.right <= viewport + 1) {
        scrolls = true;
        break;
      }
      left = Math.max(left, box.left);
      right = Math.min(right, box.right);
    }
    if (scrolls) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const rect of range.getClientRects()) {
      if (rect.width > 0 && (rect.right > right + 1 || rect.left < left - 1)) {
        failures.push(`${el.tagName.toLowerCase()}.${el.className}: "${node.textContent!.trim().slice(0, 50)}"`);
        break;
      }
    }
  }
  return failures;
}

/**
 * Text squeezed into a column too narrow for its words: it lays out on more
 * than twice as many lines as it has words, so words break between letters.
 * (Enlarged text may break one long word once: overflow-wrap in global.css.)
 * A grid cell that
 * collapsed to 48px on /about/ at tablet widths printed its rules one letter a
 * line while every letter stayed inside its panel, so clippedText passed it.
 */
function brokenWords(): string[] {
  const failures: string[] = [];
  const walker = document.createTreeWalker(document.querySelector('main')!, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const words = node.textContent!.trim().split(/\s+/).filter(Boolean).length;
    if (words < 2) continue;
    const el = node.parentElement!;
    if (getComputedStyle(el).visibility === 'hidden' || el.closest('[aria-hidden="true"], .sr-only')) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const lines = new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)));
    if (lines.size > words * 2) failures.push(`${el.tagName.toLowerCase()}.${el.className}: ${words} words on ${lines.size} lines`);
  }
  return failures;
}

test('every page keeps its words on screen at 320px and with text at 200%', async ({ page }, info) => {
  test.setTimeout(180_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const paths = await sitemapPaths(page);
  expect(paths.length, 'sitemap lists the pages').toBeGreaterThan(20);
  paths.push('/no-such-page-journey/');
  const clipped: string[] = [];
  for (const { width, text } of CASES[info.project.name as keyof typeof CASES]) {
    await page.setViewportSize({ width, height: 844 });
    for (const path of paths) {
      await page.goto(path);
      await page.evaluate((size) => document.documentElement.style.setProperty('font-size', size), text);
      // Include the service names and prices that are behind the form's disclosure.
      if (path === '/contact/') {
        await page.locator('#optional-details').evaluate((details) => details.setAttribute('open', ''));
      }
      await page.evaluate(() => document.fonts.ready);
      for (const failure of await page.evaluate(clippedText)) clipped.push(`${path} at ${width}px, text ${text}: ${failure}`);
      for (const failure of await page.evaluate(brokenWords)) clipped.push(`${path} at ${width}px, text ${text}: ${failure}`);
    }
  }
  expect(clipped, 'words cut off at the edge of the screen or their panel, or broken between letters').toEqual([]);
});
