/**
 * A visitor's path to getting in touch, driven in a real browser at phone and
 * desktop width. It guards the harms a visitor meets that dist/ text audits
 * cannot see: a menu that will not open, a price that is not on the page, a
 * form that loses the enquiry, or a screen that renders blank or sideways.
 *
 * The enquiry endpoint and Turnstile are stubbed in every run (including the
 * run against production), so nothing here ever sends a real enquiry.
 */
import { expect, test, type Page } from '@playwright/test';
import { business, formatGBP, services } from '../../src/data/business';
import { ENDPOINT_URL } from '../../src/config/site';

const ENQUIRY = {
  name: 'Journey Visitor',
  email: 'journey-visitor@example.com',
  time_sink: 'Chasing invoices by hand every Friday.',
};

/** Stub the third-party check and the intake endpoint; returns the bodies the form posted. */
async function stubIntake(page: Page, reply: { status: number; body: object }) {
  const posted: Record<string, unknown>[] = [];
  await page.route('**/challenges.cloudflare.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: 'window.turnstile={getResponse:()=>"journey-token",reset(){},render(){}};',
    }),
  );
  await page.route(ENDPOINT_URL, (route) => {
    const req = route.request();
    if (req.method() === 'POST') posted.push(req.postDataJSON());
    return route.fulfill({
      status: req.method() === 'POST' ? reply.status : 204,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' },
      body: req.method() === 'POST' ? JSON.stringify(reply.body) : '',
    });
  });
  return posted;
}

/** Scroll to the bottom in steps so scroll-triggered reveals fire, as they do for a reader. */
async function scrollThrough(page: Page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += innerHeight) {
      scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 40));
    }
    scrollTo(0, 0);
  });
  await page.waitForTimeout(900); // the reveal transition is 820ms
}

/** A blank or unstyled render screenshots to a tiny PNG; real pages are far larger. */
// ponytail: a size floor, not a pixel diff. Baseline images flake across fonts and OSes.
async function expectPainted(page: Page, name: string) {
  await scrollThrough(page);
  const png = await page.screenshot({ fullPage: true, path: `test-results/${name}.png` });
  expect(png.length, `${name} rendered (blank page?)`).toBeGreaterThan(30_000);
}

async function expectNoSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'page scrolls sideways').toBeLessThanOrEqual(0);
}

test('visitor finds the prices and reaches us through the contact form', async ({ page }, info) => {
  const phone = info.project.name === 'mobile';
  const posted = await stubIntake(page, { status: 200, body: { ok: true } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // Home -> Services through the real navigation (the drawer on a phone).
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectPainted(page, `${info.project.name}-home`);
  if (phone) {
    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect(page.locator('#mobile-menu')).toBeVisible();
    await page.locator('#mobile-menu').getByRole('link', { name: 'Services' }).click();
  } else {
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Services' }).click();
  }
  await expect(page).toHaveURL(/\/services\/$/);

  // Every published from-price is on the page the visitor sees.
  for (const s of services) {
    const offer = page.locator('.offer', { hasText: s.name }).first();
    await offer.scrollIntoViewIfNeeded();
    // Offers fade in on scroll: a script failure would leave a price in the DOM but invisible.
    await expect(offer, s.name).toHaveCSS('opacity', '1');
    await expect(offer.locator('.offer__amt').first(), `${s.name} price`).toHaveText(formatGBP(s.priceFrom));
  }
  await expectNoSidewaysScroll(page);
  await expectPainted(page, `${info.project.name}-services`);

  // Services -> Contact, then the enquiry itself.
  await page.getByRole('link', { name: /contact|get in touch|talk/i }).first().click();
  await expect(page).toHaveURL(/\/contact\/$/);
  const form = page.locator('#contact-form');
  const send = form.getByRole('button', { name: 'Send it to Waseem' });
  await expect(send).toBeEnabled();
  await expect(page.locator(`a[href="mailto:${business.email}"]`).first()).toBeVisible();
  await expectNoSidewaysScroll(page);
  await expectPainted(page, `${info.project.name}-contact`);

  // An empty submit says what is missing, on the field, and puts focus there.
  await send.click();
  await expect(page.locator('#form-error')).toHaveText('Please add your name.');
  await expect(page.locator('#name')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#name')).toBeFocused();
  expect(posted, 'invalid form must not be sent').toHaveLength(0);

  // A valid enquiry reaches the endpoint intact and the visitor is told it landed.
  await page.locator('#name').fill(ENQUIRY.name);
  await page.locator('#email').fill(ENQUIRY.email);
  await page.locator('#time-sink').fill(ENQUIRY.time_sink);
  await send.click();
  await expect(page.locator('#form-confirm')).toBeVisible();
  await expect(page.locator('#form-confirm h2')).toBeFocused();
  await expect(form).toBeHidden();
  expect(posted).toHaveLength(1);
  expect(posted[0]).toMatchObject({
    name: ENQUIRY.name,
    email: ENQUIRY.email,
    message: ENQUIRY.time_sink,
    turnstileToken: 'journey-token',
    website: '',
  });
  await expectPainted(page, `${info.project.name}-contact-sent`);

  expect(errors, 'uncaught page errors').toEqual([]);
});

test('a refused or failed send keeps the enquiry and never shows an error code', async ({ page }, info) => {
  const posted = await stubIntake(page, { status: 403, body: { error: 'turnstile_failed' } });
  await page.goto('/contact/');
  await page.locator('#name').fill(ENQUIRY.name);
  await page.locator('#email').fill(ENQUIRY.email);
  await page.locator('#time-sink').fill(ENQUIRY.time_sink);
  await page.getByRole('button', { name: 'Send it to Waseem' }).click();

  const error = page.locator('#form-error');
  await expect(error).toBeVisible();
  await expect(error).not.toContainText('turnstile_failed');
  await expect(page.locator('#form-confirm')).toBeHidden();
  // Nothing the visitor typed is lost, and they can try again.
  await expect(page.locator('#time-sink')).toHaveValue(ENQUIRY.time_sink);
  await expect(page.getByRole('button', { name: 'Send it to Waseem' })).toBeEnabled();
  expect(posted).toHaveLength(1);
  await page.screenshot({ path: `test-results/${info.project.name}-contact-refused.png` });

  // Endpoint unreachable: still a human way out, still no lost text.
  await page.route(ENDPOINT_URL, (route) => route.abort());
  await page.getByRole('button', { name: 'Send it to Waseem' }).click();
  await expect(error).toContainText(business.email);
  await expect(page.locator('#time-sink')).toHaveValue(ENQUIRY.time_sink);
});

test('a page that does not exist is a real 404 with a way back', async ({ page }) => {
  const res = await page.goto('/no-such-page-journey/');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('link', { name: /home|automancer/i }).first()).toBeVisible();
});
