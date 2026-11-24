import { expect, test } from '@playwright/test';

test.use({ javaScriptEnabled: false, reducedMotion: 'reduce' });

test('a shared link to an older release opens at its notes', async ({ page }, info) => {
  if (info.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 640 });
  const version = 'v2026.10.22.8';
  await page.goto(`/releases/#${version}`);
  await page.evaluate(async () => { await document.fonts.ready; });

  // Earlier notes can change size as they come into view. The linked release
  // must stay below the sticky header, near the top of the reading area.
  const release = page.getByRole('article', { name: `Release ${version}` });
  const label = release.getByRole('link', { name: version, exact: true });
  await expect(label).toBeInViewport();
  await expect(release.locator('.rel__notes > p').first()).toBeInViewport();
  const top = (await label.boundingBox())!.y;
  expect(top).toBeGreaterThanOrEqual((await page.locator('.nav').boundingBox())!.height);
  expect(top).toBeLessThan(160);
});
