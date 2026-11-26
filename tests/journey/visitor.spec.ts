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
const TURNSTILE_STUB = 'window.turnstile={getResponse:()=>"journey-token",reset(){},render(){}}; window.onTurnstileLoad();';

/** Stub the third-party check and the intake endpoint; returns the bodies the form posted. */
async function stubIntake(page: Page, reply: { status: number; body: object }) {
  const posted: Record<string, unknown>[] = [];
  await page.route('**/challenges.cloudflare.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: TURNSTILE_STUB,
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
}

/** A blank or unstyled render screenshots to a tiny PNG; real pages are far larger. */
// ponytail: a size floor, not a pixel diff. Baseline images flake across fonts and OSes.
async function expectPainted(page: Page, name: string) {
  await scrollThrough(page);
  // `animations: 'disabled'` draws the reveals the scroll started as they end, without waiting
  // 820 ms or more for them to play (t26952).
  const png = await page.screenshot({ fullPage: true, animations: 'disabled', path: `test-results/${name}.png` });
  expect(png.length, `${name} rendered (blank page?)`).toBeGreaterThan(30_000);
}

async function expectNoSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'page scrolls sideways').toBeLessThanOrEqual(0);
}

test('touch prefetch saves data while reading and still warms a link in the opened menu', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'the viewport prefetch runs on touch screens');
  // Exercise the site's fallback in the Chromium-only journey.
  await page.addInitScript(() => Reflect.deleteProperty(Document.prototype, 'prerendering'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const fetched = new Set<string>();
  page.on('request', (request) => {
    if (request.resourceType() === 'fetch') fetched.add(new URL(request.url()).pathname);
  });
  await page.goto('/');
  await expect.poll(() => [...fetched].sort()).toEqual(['/contact/', '/work/']);

  await page.locator('main a[href="/services/"]').first().scrollIntoViewIfNeeded();
  await expect.poll(() => fetched.has('/services/')).toBe(true);
  await page.locator('.case-card__link').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(750); // Let the viewport dwell finish before opening the menu.
  expect.soft([...fetched].sort(), 'reading more of the page stays within three downloads').toEqual(['/contact/', '/services/', '/work/']);

  await page.locator('.nav__toggle').tap();
  await expect.poll(() => fetched.has('/about/'), { message: 'the open menu can still prefetch' }).toBe(true);
});

test('decorative motion pauses while reading and resumes when scrolled back into view', async ({ page }) => {
  await page.goto('/field-notes/what-does-an-ai-agent-actually-cost/');
  const glow = page.locator('.page-hero__glow > span').first();
  await expect(glow).toHaveCSS('animation-play-state', 'running');
  await page.locator('.prose h2').nth(2).scrollIntoViewIfNeeded();
  await expect(page.locator('.page-hero')).not.toBeInViewport();
  await expect(glow).toHaveCSS('animation-play-state', 'paused');
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await expect(page.locator('.page-hero')).toBeInViewport();
  await expect(glow).toHaveCSS('animation-play-state', 'running');
});

// The spectrum effects that run while a visitor reads (the glow, the spectral
// rules, the nav's current-page underline, the live beads, the hero's spectral
// word, the price underline) move only by transform, scale and opacity, which
// the compositor runs without the main thread. An animated color, box-shadow
// or background-position restyles and repaints on every frame instead
// (ops/perf/idle-screen.mjs). Every page below showed one such effect on its
// first screen before t21746 or t21966.
test('decorative motion runs on the compositor', async ({ page }) => {
  // A page and, where its effect sits below the first screen, what to scroll to.
  for (const [path, reading] of [
    ['/'], ['/developers/'], ['/contact/'], ['/work/'], ['/privacy/'], ['/terms/'], ['/404.html'], ['/about/'],
    ['/services/', '.offer__price'],
    ['/field-notes/what-does-an-ai-agent-actually-cost/'], ['/work/fast-small-business-websites/'],
  ]) {
    await page.goto(path);
    if (reading) {
      await page.locator(reading).first().scrollIntoViewIfNeeded();
      await expect(page.locator(reading).first()).not.toHaveClass(/motion-paused/);
    }
    // main.ts has paused what is offscreen (the footer's tagline always is).
    await expect(page.locator('.footer .spectral-text')).toHaveClass(/motion-paused/);
    const repainting = await page.evaluate(() =>
      document.getAnimations()
        // Running keyframe animations; a hover or focus transition ends by itself.
        .filter((a) => a instanceof CSSAnimation && a.playState === 'running')
        .flatMap((a) => {
          const effect = a.effect as KeyframeEffect;
          const props = new Set(effect.getKeyframes().flatMap((k) => Object.keys(k)));
          ['offset', 'computedOffset', 'easing', 'composite', 'transform', 'scale', 'opacity'].forEach((k) => props.delete(k));
          const el = effect.target as Element;
          return props.size ? [`${el.className}${effect.pseudoElement ?? ''} animates ${[...props].join(', ')}`] : [];
        }),
    );
    expect(repainting, `${path}: an ambient animation repaints every frame`).toEqual([]);
  }
});

test('home and developer introductions load their hero layout', async ({ page }) => {
  for (const path of ['/', '/developers/']) {
    await page.goto(path);
    await expect(page.locator('main .hero')).toHaveCSS('display', 'flex');
    await expect(page.locator('main .hero__fold')).toHaveCSS('position', 'absolute');
  }
});

test('home actions are visible from the first frame and the headline holds its height while Syne loads', async ({ page }) => {
  const syne = Promise.withResolvers<void>();
  await page.route('**/syne.*.woff2', async (route) => {
    await syne.promise;
    await route.continue();
  });

  const headline = page.getByRole('heading', { level: 1 });
  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    // Freeze any entrance at its first frame so the check is independent of machine speed.
    const opacity = await page.locator('.hero__ctas').evaluate((actions) => {
      for (const animation of actions.getAnimations()) {
        animation.pause();
        animation.currentTime = 0;
      }
      return getComputedStyle(actions).opacity;
    });
    expect.soft(opacity, 'the primary links paint at full opacity').toBe('1');
    const fallbackHeight = await headline.evaluate((el) => el.getBoundingClientRect().height);
    syne.resolve();
    await page.evaluate(() => document.fonts.ready);
    expect(await headline.evaluate((el) => el.getBoundingClientRect().height)).toBeCloseTo(fallbackHeight);
  } finally {
    syne.resolve();
  }
});

test('visitor can compare starting prices immediately and jump to each offer', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/services/');
  await page.evaluate(() => document.fonts.ready);
  const comparison = page.getByRole('navigation', { name: 'Services & pricing', exact: true });
  for (const service of services) {
    await expect(comparison.getByText(formatGBP(service.priceFrom), { exact: false })).toBeInViewport({ ratio: 1 });
  }
  for (const service of services) {
    const link = comparison.getByRole('link', { name: service.name, exact: true });
    await link.focus();
    await link.press('Enter');
    const detail = page.getByRole('region', { name: service.name, exact: true });
    await expect(detail).toBeFocused();
    const heading = detail.getByRole('heading', { name: service.name, exact: true });
    await expect(heading).toBeInViewport();
    const position = await heading.boundingBox();
    expect(position!.y, 'offer heading clears the fixed navigation').toBeGreaterThanOrEqual(72);
    await page.goto('/services/');
  }
  await expectNoSidewaysScroll(page);
});

test('enlarged text keeps the headline, service names and prices inside their panels', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of info.project.name === 'mobile' ? [320, 390] : [1280]) {
    await page.setViewportSize({ width, height: 844 });
    for (const path of ['/', '/services/']) {
      await page.goto(path);
      await page.evaluate(() => document.documentElement.style.setProperty('font-size', '200%'));
      await page.evaluate(() => document.fonts.ready);
      // A page can hide horizontal overflow while clipping the words and prices.
      // Check the painted text against its panel, not only the document width.
      const clipped = await page.evaluate(() => {
        const failures: string[] = [];
        for (const el of document.querySelectorAll('.hero__headline, .rung__name, .rung__price, .offer__name, .offer__price')) {
          const panel = el.closest('.hero__inner, .rung, .offer')!.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(el);
          for (const rect of range.getClientRects()) {
            if (rect.right > Math.min(panel.right, innerWidth) + 1 || rect.left < Math.max(panel.left, 0) - 1) {
              failures.push(el.textContent!.trim());
              break;
            }
          }
        }
        return failures;
      });
      expect(clipped, `${path} at ${width}px clips enlarged buying information`).toEqual([]);
      await expectNoSidewaysScroll(page);
    }
  }
});

test('a printed price list carries every offer, its price, what is included and the answers (t23850)', async ({ page }) => {
  // Printed before this, /services/ was five blank A4 pages out of eight: its
  // offers are scroll reveals that start at opacity 0, and its light-on-black
  // text vanished once the browser dropped the backgrounds for paper.
  await page.goto('/services/');
  await page.evaluate(() => dispatchEvent(new Event('beforeprint')));
  await page.emulateMedia({ media: 'print' });
  const ink = (selector: string) =>
    page.locator(selector).evaluateAll((els) =>
      els.map((el) => {
        let opacity = 1;
        for (let a: Element | null = el; a; a = a.parentElement) opacity *= Number(getComputedStyle(a).opacity);
        // Ink is black or the dark grey of secondary text: no channel above 64.
        const dark = Math.max(...getComputedStyle(el).color.match(/\d+/g)!.slice(0, 3).map(Number)) <= 64;
        return { text: el.textContent!.trim(), opacity, dark };
      }),
    );
  const prices = await ink('.service-detail .offer__price');
  expect(prices.map((p) => p.text)).toEqual(services.map((s) => expect.stringContaining(formatGBP(s.priceFrom))));
  for (const printed of [...prices, ...(await ink('.service-detail .ticks li')), ...(await ink('.faq__a'))]) {
    expect(printed, `"${printed.text.slice(0, 40)}" prints in dark ink`).toMatchObject({ opacity: 1, dark: true });
  }
  for (const answer of await page.locator('.faq__a').all()) await expect(answer).toBeVisible();
  await expect(page.locator('.nav__links, .nav__actions, .proof-strip').first()).toBeHidden();
  await page.evaluate(() => dispatchEvent(new Event('afterprint')));
  await expect(page.locator('.faq details[open]')).toHaveCount(0);
});

test('homepage prices are one scroll away and link to the matching offer', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const pricing = page.getByRole('region', { name: 'Clear starting prices, upfront.' });
  await page.evaluate(() => document.fonts.ready);
  const firstPrice = pricing.getByText(formatGBP(services[0].priceFrom), { exact: true });
  await expect(firstPrice).toBeVisible();
  const firstPriceBottom = await firstPrice.evaluate((el) => (el.getBoundingClientRect().bottom + scrollY) / innerHeight);
  expect(firstPriceBottom, 'the first price fits within two screens of landing').toBeLessThan(2);

  for (const service of services) {
    const link = pricing.getByRole('link', { name: service.name, exact: true });
    await expect(link.getByText(formatGBP(service.priceFrom), { exact: true })).toBeVisible();
    await link.focus();
    await link.press('Enter');
    await expect(page).toHaveURL(/\/services\/#offer-\d+$/);
    const detail = page.getByRole('region', { name: service.name, exact: true });
    await expect(detail.getByRole('heading', { name: service.name })).toBeInViewport();
    await expect(detail.getByRole('link', { name: /Book an Audit|Start a Sprint|Scope a Build|Become a Partner/ }))
      .toHaveAttribute('href', `/contact/#service=${service.id}`);
    await page.goto('/');
  }
});

test("a case study's sector and notes read as whole lines, not ragged columns", async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const xml = await (await page.request.get('/sitemap-0.xml')).text();
  const studies = [...xml.matchAll(/<loc>([^<]+\/work\/[^<]+\/)<\/loc>/g)].map((m) => new URL(m[1]!).pathname);
  expect(studies.length, 'no case studies in the sitemap').toBeGreaterThan(0);
  for (const width of info.project.name === 'mobile' ? [320, 390] : [1280]) {
    await page.setViewportSize({ width, height: 844 });
    for (const path of studies) {
      await page.goto(path);
      const label = await page.locator('.eyebrow--case').evaluate((el) => {
        const sector = el.querySelector('.case-meta__sector')!.getBoundingClientRect();
        const notes = el.querySelector('.case-meta__notes');
        const box = notes?.getBoundingClientRect();
        return {
          sectorBottom: sector.bottom,
          sectorTop: sector.top,
          notesTop: box?.top,
          leadShown: notes ? getComputedStyle(notes.querySelector('.case-meta__lead')!).display !== 'none' : false,
        };
      });
      if (label.notesTop === undefined) continue;
      if (width >= 1280) {
        // Wide enough for the longest label: one line, as it always was.
        expect(Math.abs(label.notesTop - label.sectorTop), `${path} label splits at ${width}px`).toBeLessThan(4);
      } else {
        // A phone: the notes take their own line under the sector, with no stray leading dot.
        expect(label.notesTop, `${path} notes squeeze beside the sector at ${width}px`).toBeGreaterThanOrEqual(label.sectorBottom - 1);
        expect(label.leadShown, `${path} notes line starts with a dot at ${width}px`).toBe(false);
      }
    }
  }
});

test("a case study's figures never break inside a word, even with text at 200%", async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const xml = await (await page.request.get('/sitemap-0.xml')).text();
  const studies = [...xml.matchAll(/<loc>([^<]+\/work\/[^<]+\/)<\/loc>/g)].map((m) => new URL(m[1]!).pathname);
  for (const width of info.project.name === 'mobile' ? [320, 390] : [1280]) {
    await page.setViewportSize({ width, height: 844 });
    for (const path of studies) {
      for (const text of ['100%', '200%']) {
        await page.goto(path);
        await page.evaluate((size) => document.documentElement.style.setProperty('font-size', size), text);
        await page.evaluate(() => document.fonts.ready);
        // A run may break after its dash ("Near-" / "zero"); anywhere else is mid-word ("Compu" / "ted").
        const broken = await page.evaluate(() => {
          const out: string[] = [];
          for (const v of document.querySelectorAll('.stat__v')) {
            const node = v.firstChild as Text;
            for (const m of node.textContent!.matchAll(/[^\s–-]+[–-]?/g)) {
              const range = document.createRange();
              range.setStart(node, m.index!);
              range.setEnd(node, m.index! + m[0].length);
              if (range.getClientRects().length > 1) out.push(m[0]);
            }
          }
          return out;
        });
        expect(broken, `${path} at ${width}px, ${text} text`).toEqual([]);
      }
    }
  }
});

test('the direct contact links and required form fields fit on the first screen', async ({ page }, info) => {
  await stubIntake(page, { status: 200, body: { ok: true } });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/contact/');
  const main = page.getByRole('main');
  const email = main.getByRole('link', { name: /^Email Waseem/ });
  const voicemail = main.getByRole('link', { name: /^Leave a voicemail/ });
  const name = main.getByRole('textbox', { name: 'Your name' });
  const emailField = main.getByRole('textbox', { name: 'Email', exact: true });
  const message = main.locator('#time-sink');
  await expect(email).toHaveAttribute('href', `mailto:${business.email}`);
  await expect(voicemail).toHaveAttribute('href', `tel:${business.phoneTel}`);
  for (const control of [email, voicemail, name, emailField, message]) {
    await expect(control).toBeInViewport({ ratio: 1 });
  }
  await email.focus();
  await page.keyboard.press('Tab');
  await expect(voicemail).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(name).toBeFocused();

  // A visitor who enlarges text to 200% (WCAG 1.4.4) can still open the menu
  // and use the form without scrolling sideways. The menu button used to sit
  // at x=517 on a 390px screen.
  await page.evaluate(() => document.documentElement.style.setProperty('font-size', '200%'));
  await expectNoSidewaysScroll(page);
  if (info.project.name === 'mobile') {
    const menu = page.getByRole('banner').getByText('Menu', { exact: true });
    await expect(menu).toBeInViewport({ ratio: 1 });
    await menu.click();
    await expect(page.locator('#mobile-menu')).toBeVisible();
  }
});

test('the security check takes space only after it mounts and fits a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.route(ENDPOINT_URL, (route) => route.abort());
  await page.route('**/challenges.cloudflare.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      // Model the dimensions of Cloudflare's standard widget inside its shadow host.
      body: `window.turnstile = { render(slot) {
        const host = document.createElement('div');
        const iframe = document.createElement('iframe');
        iframe.title = 'Security widget';
        iframe.style.width = '300px';
        iframe.style.height = '65px';
        iframe.style.border = '0';
        host.attachShadow({mode: 'open'}).append(iframe);
        slot.append(host);
      } }; window.onTurnstileLoad();`,
    }),
  );
  await page.goto('/contact/');
  const check = page.locator('.form-security');
  await expect(page.getByText('Security check', { exact: true })).toBeHidden();
  // Enlarge text before mounting. The widget's pixel width stays fixed as the gutters grow.
  await page.evaluate(() => document.documentElement.style.setProperty('font-size', '200%'));
  await page.locator('#name').focus();
  const widget = check.locator('iframe');
  await expect(widget).toBeVisible();
  const box = await widget.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  await expectNoSidewaysScroll(page);
});

test('visitor finds the prices and reaches us through the contact form', async ({ page }, info) => {
  const phone = info.project.name === 'mobile';
  const posted = await stubIntake(page, { status: 200, body: { ok: true } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && /Content Security Policy|violates.*directive/i.test(message.text())) {
      errors.push(message.text());
    }
  });

  // Home -> Services through the header navigation.
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectPainted(page, `${info.project.name}-home`);
  if (phone) {
    await page.getByRole('banner').getByText('Menu', { exact: true }).click();
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
  const footerContact = page.getByRole('contentinfo').getByRole('navigation', { name: 'Get in touch' });
  await expect(footerContact.getByRole('link', { name: business.email })).toHaveAttribute('href', `mailto:${business.email}`);
  await expectNoSidewaysScroll(page);
  await expectPainted(page, `${info.project.name}-contact`);

  // An empty submit says what is missing, on the field, and puts focus there.
  await send.click();
  await expect(page.locator('#form-error')).toHaveText('Please add your name.');
  await expect(page.locator('#name')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#name')).toBeFocused();
  expect(posted, 'invalid form must not be sent').toHaveLength(0);

  // A keyboard user reaches the message without tabbing through optional fields.
  await page.keyboard.press('Tab');
  await expect(page.locator('#email')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#time-sink')).toBeFocused();
  await page.keyboard.press('Tab');
  const optional = form.getByText('Add optional details', { exact: true });
  await expect(optional).toBeFocused();
  await expect(page.locator('#company')).toBeHidden();
  await page.keyboard.press('Space');
  await expect(page.locator('#company')).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.locator('#company')).toBeHidden();

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

test("an offer's button carries that service into the enquiry, and the visitor can change it", async ({ page }) => {
  const posted = await stubIntake(page, { status: 200, body: { ok: true } });
  const sprint = services.find((s) => s.id === 'workflow-implementation-sprint')!;
  const audit = services.find((s) => s.id === 'automation-opportunity-audit')!;
  await page.emulateMedia({ reducedMotion: 'reduce' });

  // Every offer's button used to open the same blank form.
  await page.goto('/services/');
  await page.locator('#offer-2').getByRole('link', { name: /Start a Sprint/ }).click();
  await expect(page).toHaveURL(new RegExp(`/contact/\\?service=${sprint.id}$`));

  // The form arrives with the Sprint picked and says so above the first field,
  // which still starts on the first screen.
  const carried = page.locator('#service-carried');
  await expect(carried).toBeVisible();
  await expect(carried).toContainText(sprint.name);
  await expect(page.locator(`input[name="service"][value="${sprint.id}"]`)).toBeChecked();
  await expect(page.locator('#name')).toBeInViewport({ ratio: 1 });
  await expect(page.locator('#company')).toBeHidden();

  // "Change" opens the details and takes focus to the current choice.
  await carried.getByRole('link', { name: 'Change' }).click();
  await expect(page.getByRole('radio', { name: new RegExp(sprint.name) })).toBeFocused();
  await expect(page.getByRole('radio', { name: new RegExp(sprint.name) })).toBeInViewport();
  await page.getByRole('radio', { name: new RegExp(audit.name) }).check();
  await expect(carried).toContainText(audit.name);
  await expect(page).toHaveURL(new RegExp(`\\?service=${audit.id}$`));
  await expectNoSidewaysScroll(page);

  // Closing the optional details leaves the choice and typed details in the enquiry.
  await page.locator('#company').fill('Example business');
  await page.getByText('Add optional details', { exact: true }).click();
  await expect(page.locator('#company')).toBeHidden();
  await page.locator('#name').fill(ENQUIRY.name);
  await page.locator('#email').fill(ENQUIRY.email);
  await page.locator('#time-sink').fill(ENQUIRY.time_sink);
  await page.locator('#contact-form').getByRole('button', { name: 'Send it to Waseem' }).click();
  await expect(page.locator('#form-confirm')).toBeVisible();
  expect(posted).toHaveLength(1);
  expect(posted[0]).toMatchObject({
    company: 'Example business',
    message: `Interested in: ${audit.name}\n\n${ENQUIRY.time_sink}`,
  });

  // The Contact footer opens a fresh form even after a successful submission.
  await page.getByRole('navigation', { name: 'Get in touch' }).getByRole('link', { name: /Book an Audit/ }).click();
  await expect(page.locator('#contact-form')).toBeVisible();
  await expect(carried).toContainText(audit.name);
  await expect(page.locator('#name')).toHaveValue('');

  // Bookmarks with the published query parameter still prefill the choice.
  await page.goto(`/contact/?service=${sprint.id}`);
  await expect(carried).toContainText(sprint.name);

  // An address naming no published service picks nothing and shows no note.
  await page.goto('/contact/#service=free-website');
  await expect(page.locator('#contact-form')).toBeVisible();
  await expect(carried).toBeHidden();
  await expect(page.locator('input[name="service"]:checked')).toHaveCount(0);
});

test('the phone menu follows keyboard focus and dismisses without covering the whole page', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'the menu button shows only on small screens');
  await page.goto('/work/fast-small-business-websites/');
  const trigger = page.getByRole('banner').getByText('Menu', { exact: true });
  const menu = page.getByRole('navigation', { name: 'Mobile menu' });
  const contact = page.getByRole('banner').getByRole('link', { name: 'Contact' });
  await expect(contact).toBeInViewport({ ratio: 1 });

  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Work' })).toHaveAttribute('aria-current', 'location');

  await page.keyboard.press('Tab');
  await expect(menu.getByRole('link', { name: 'Home' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();

  await page.keyboard.press('Enter');
  // Shift+Tab leaves the disclosure and reaches the preceding header link.
  await page.keyboard.press('Shift+Tab');
  await expect(contact).toBeFocused();
  await expect(menu).toBeHidden();

  await trigger.click();
  // A touch below the panel reaches the page and dismisses the expanded navigation.
  await page.touchscreen.tap(20, 600);
  await expect(menu).toBeHidden();

  await trigger.click();
  await page.setViewportSize({ width: 1280, height: 844 });
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(trigger).toBeVisible();
  await expect(menu).toBeHidden();

  await contact.click();
  await expect(page).toHaveURL(/\/contact\/$/);
  await expect(contact).toHaveAttribute('aria-current', 'page');
});

test.describe('navigation without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('Work lets visitors open any case study by sector from the first screen', async ({ page }, info) => {
    if (info.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/work/');
    await page.evaluate(() => document.fonts.ready);
    const directory = page.getByRole('navigation', { name: 'Case studies by sector' });
    await expect(directory).toBeInViewport({ ratio: 1 });

    const cards = page.locator('main .case-card__link');
    const links = directory.getByRole('link');
    await expect(links).toHaveCount(await cards.count());
    const targets = await cards.evaluateAll((anchors) => anchors.map((a) => a.getAttribute('href')));
    expect(await links.evaluateAll((anchors) => anchors.map((a) => a.getAttribute('href')))).toEqual(expect.arrayContaining(targets));

    await directory.getByRole('link', { name: /^Manufacturing/ }).click();
    await expect(page).toHaveURL(/\/work\/manufacturer-trade-portal\/$/);
  });

  test('the phone header still reaches Services and Contact at 320px with enlarged text', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile', 'the menu button shows only on small screens');
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/work/');
    await page.evaluate(() => document.documentElement.style.setProperty('font-size', '200%'));
    const trigger = page.getByRole('banner').getByText('Menu', { exact: true });
    const contact = page.getByRole('banner').getByRole('link', { name: 'Contact' });
    await expect(contact).toBeInViewport({ ratio: 1 });
    await expect(trigger).toBeInViewport({ ratio: 1 });
    await expectNoSidewaysScroll(page);
    await trigger.click();
    const menu = page.getByRole('navigation', { name: 'Mobile menu' });
    await expect(menu).toBeInViewport({ ratio: 1 });
    await expect(menu.getByRole('link', { name: 'Work' })).toHaveAttribute('aria-current', 'page');
    await menu.getByRole('link', { name: 'Services' }).click();
    await expect(page).toHaveURL(/\/services\/$/);
    await contact.click();
    await expect(page).toHaveURL(/\/contact\/$/);
  });
});

test('with reduced motion, the form jumps straight to its error and its confirmation', async ({ page }) => {
  const posted = await stubIntake(page, { status: 200, body: { ok: true } });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/contact/');
  /** How far the page scrolls over the next dozen frames: 0 unless the scroll is animated. */
  const scrollTravel = () =>
    page.evaluate(async () => {
      const ys = [scrollY];
      for (let i = 0; i < 12; i++) {
        await new Promise(requestAnimationFrame);
        ys.push(scrollY);
      }
      return Math.max(...ys) - Math.min(...ys);
    });
  const send = page.getByRole('button', { name: 'Send it to Waseem' });

  await send.click();
  expect(await scrollTravel(), 'scrolled to the error with an animation').toBeLessThanOrEqual(1);
  await expect(page.locator('#name')).toBeFocused();
  await expect(page.locator('#name')).toBeInViewport();

  await page.locator('#name').fill(ENQUIRY.name);
  await page.locator('#email').fill(ENQUIRY.email);
  await page.locator('#time-sink').fill(ENQUIRY.time_sink);
  await send.click();
  await expect(page.locator('#form-confirm h2')).toBeFocused();
  expect(await scrollTravel(), 'scrolled to the confirmation with an animation').toBeLessThanOrEqual(1);
  await expect(page.locator('#form-confirm h2')).toBeInViewport();
  expect(posted).toHaveLength(1);
});

test('reading the contact page never starts the security check, but using the form does', async ({ page }) => {
  // The stub records what the form asks it to render, and calls the onload
  // callback named in the script URL, as the real api.js does.
  await page.clock.install();
  const asked: string[] = [];
  await page.route('**/challenges.cloudflare.com/**', (route) => {
    asked.push(route.request().url());
    return route.fulfill({
      contentType: 'text/javascript',
      body: `window.turnstile={getResponse:()=>"journey-token",reset(){},render(el,o){window.__rendered={slot:el.className,sitekey:o.sitekey,theme:o.theme,onError:typeof o['error-callback']};}};
        window[new URL(document.currentScript.src).searchParams.get('onload')]();`,
    });
  });
  await page.goto('/contact/');
  await page.clock.fastForward(3000);
  await expect(page.locator('script[src*="/turnstile/"]')).toHaveCount(0);
  await page.getByRole('link', { name: /^Leave a voicemail/ }).focus();
  await page.clock.fastForward(12_000);
  await expect(page.locator('script[src*="/turnstile/"]')).toHaveCount(0);
  expect(asked).toEqual([]);

  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 5000));
  await page.locator('#name').focus();
  await page.locator('#name').fill('Typing');
  await expect.poll(() => asked.length).toBe(1);
  expect(asked[0]).toContain('render=explicit');
  await expect.poll(() => page.evaluate(() => typeof (window as unknown as { turnstile?: object }).turnstile)).toBe('object');
  const rendered = () => page.evaluate(() => (window as unknown as { __rendered?: object }).__rendered);
  expect(await rendered(), 'mounting the widget can block active typing').toBeUndefined();
  await page.clock.runFor(600);
  expect(await rendered()).toEqual({ slot: expect.stringContaining('turnstile-slot'), sitekey: expect.stringMatching(/^0x/), theme: 'dark', onError: 'function' });

  // More typing never loads it twice.
  await page.locator('#email').fill('x@example.com');
  await page.locator('#name').fill('Again');
  expect(asked).toHaveLength(1);
});

test('a slow security script offers email without losing the draft or preventing a later send', async ({ page }) => {
  const posted = await stubIntake(page, { status: 200, body: { ok: true } });
  const scriptRequested = Promise.withResolvers<void>();
  const releaseScript = Promise.withResolvers<void>();
  await page.clock.install();
  await page.route('**/challenges.cloudflare.com/**', async (route) => {
    scriptRequested.resolve();
    await releaseScript.promise;
    await route.fulfill({ contentType: 'text/javascript', body: TURNSTILE_STUB });
  });
  try {
    await page.goto('/contact/');
    await page.locator('#name').fill(ENQUIRY.name);
    await scriptRequested.promise;
    await page.locator('#email').fill(ENQUIRY.email);
    await page.locator('#time-sink').fill(ENQUIRY.time_sink);
    await expect(page.locator('#form-recovery')).toBeHidden();
    await page.clock.fastForward(10_000);
    const send = page.getByRole('button', { name: 'Send it to Waseem' });
    const error = page.locator('#form-error');
    await expect(page.locator('#form-recovery').getByRole('link', { name: business.email })).toBeVisible();
    await send.click();
    await expect(error).toHaveText('The security check could not load.');
    await expect(page.locator('#time-sink')).toHaveValue(ENQUIRY.time_sink);
    expect(posted).toHaveLength(0);

    releaseScript.resolve();
    await expect(error).toBeHidden();
    await send.click();
    await expect(page.locator('#form-confirm')).toBeVisible();
    expect(posted).toHaveLength(1);
    expect(posted[0]?.message).toBe(ENQUIRY.time_sink);
  } finally {
    releaseScript.resolve();
  }
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
  await expect(error).toContainText('Couldn’t reach us just now.');
  const recovery = page.locator('#form-recovery');
  const email = recovery.getByRole('link', { name: business.email });
  await expect(email).toBeVisible();
  await expect(email).toHaveAttribute('href', `mailto:${business.email}`);
  await expect(page.locator('#time-sink')).toHaveValue(ENQUIRY.time_sink);

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  // Copy reads the latest draft, including edits after the send failed and the details were closed.
  const optional = page.locator('#optional-details summary');
  await optional.click();
  await page.getByRole('radio', { name: /Workflow Sprint/ }).check();
  await page.locator('#extra').fill('Updated after the outage.');
  await optional.click();
  await expect(optional).toContainText('Workflow Sprint');
  await recovery.getByRole('button', { name: 'Copy enquiry' }).click();
  await expect(recovery.getByRole('status')).toContainText('Copied.');
  const draft = await page.evaluate(() => navigator.clipboard.readText());
  expect(draft).toContain(ENQUIRY.time_sink);
  expect(draft).toContain('Workflow Sprint');
  expect(draft).toContain('Updated after the outage.');
  expect(draft).not.toContain('journey-token');
});

test('a blocked security check offers a draft even when the clipboard is denied', async ({ page }) => {
  const posted = await stubIntake(page, { status: 200, body: { ok: true } });
  await page.route('**/challenges.cloudflare.com/**', (route) => route.abort('blockedbyclient'));
  await page.addInitScript(() => {
    navigator.clipboard.writeText = () => Promise.reject(new DOMException('Denied', 'NotAllowedError'));
  });
  await page.goto('/contact/');
  await page.locator('#name').fill(ENQUIRY.name);
  await page.locator('#email').fill(ENQUIRY.email);
  await page.locator('#time-sink').fill(ENQUIRY.time_sink);
  await page.getByRole('button', { name: 'Send it to Waseem' }).click();

  const recovery = page.locator('#form-recovery');
  await expect(recovery.getByRole('link', { name: business.email })).toBeVisible();
  await recovery.getByRole('button', { name: 'Copy enquiry' }).click();
  const draft = recovery.getByRole('textbox', { name: 'Enquiry draft' });
  await expect(draft).toBeFocused();
  await expect(draft).toHaveValue(new RegExp(ENQUIRY.time_sink));
  expect(await draft.evaluate((el: HTMLTextAreaElement) => el.selectionEnd - el.selectionStart)).toBeGreaterThan(0);
  expect(posted).toHaveLength(0);
});

test.describe('with JavaScript off', () => {
  test.use({ javaScriptEnabled: false });

  test('offers email where the contact form would have been', async ({ page }) => {
    await page.goto('/contact/');
    await expect(page.locator('#contact-form')).toBeHidden();
    const email = page.locator('#form-unavailable').getByRole('link', { name: business.email });
    await expect(email).toBeVisible();
    await expect(email).toHaveAttribute('href', `mailto:${business.email}`);
  });
});

test("a field note's contents jump to each section and mark the one being read", async ({ page }, info) => {
  await page.goto('/field-notes/what-does-an-ai-agent-actually-cost/');
  const ids = await page.locator('.prose h2[id]').evaluateAll((hs) => hs.map((h) => h.id));
  expect(ids.length).toBeGreaterThanOrEqual(3);
  const phone = info.project.name === 'mobile';
  const contents = page.locator(phone ? 'details.toc' : 'nav.toc');
  await expect(page.locator(phone ? 'nav.toc' : 'details.toc')).toBeHidden();

  if (phone) await contents.locator('summary').click();
  const links = contents.getByRole('link');
  expect(await links.evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).hash.slice(1)))).toEqual(ids);

  for (const n of [2, ids.length - 1]) {
    // On a phone the contents close after a jump, and stay within reach for the next one (t25430).
    if (phone && (await contents.getAttribute('open')) === null) await contents.locator('summary').click();
    await links.nth(n).click();
    const heading = page.locator(`[id="${ids[n]}"]`);
    const title = (await heading.textContent())!.trim();
    // It scrolls (smoothly) to just below the fixed nav, not under it, and is marked as being read.
    await expect.poll(async () => (await heading.boundingBox())!.y).toBeLessThan(200);
    expect((await heading.boundingBox())!.y).toBeGreaterThan(40);
    await expect(contents.locator('a[aria-current="location"]')).toHaveText(title);
    if (!phone) continue;
    // The contents are a bar under the nav that names the section being read and where it falls,
    // and the heading lands below the bar, not under it.
    await expect(contents).not.toHaveAttribute('open');
    const bar = (await contents.boundingBox())!;
    const nav = (await page.locator('.nav').boundingBox())!;
    expect(Math.abs(bar.y - (nav.y + nav.height))).toBeLessThan(2);
    await expect(contents.locator('summary')).toContainText(title);
    await expect(contents.locator('summary')).toContainText(`${n + 1}/${ids.length}`);
    expect((await heading.boundingBox())!.y).toBeGreaterThanOrEqual(bar.y + bar.height);
  }
  await expect(contents).toBeVisible();
  await expectNoSidewaysScroll(page);
});

test('a field note opens with its first line in view and ends with the next notes on its subject', async ({ page }) => {
  await page.goto('/field-notes/how-ai-agents-actually-make-decisions/');
  await page.evaluate(() => document.fonts.ready);
  // On a laptop the title used to fill the first screen, leaving the opening line below the fold.
  const viewport = page.viewportSize()!;
  const opening = page.locator('.prose > p').first();
  expect((await opening.boundingBox())!.y + 24, 'opening line is below the first screen').toBeLessThan(viewport.height);

  const next = page.getByRole('navigation', { name: 'Keep reading' });
  const notes = next.locator('.note-list a');
  await expect(notes).toHaveCount(3);
  const hrefs = await notes.evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  expect(hrefs).not.toContain('/field-notes/how-ai-agents-actually-make-decisions/');
  // The other note on AI agents comes first.
  expect(hrefs[0]).toBe('/field-notes/what-governed-ai-means-and-why-it-matters/');
  await expectNoSidewaysScroll(page);

  await notes.first().scrollIntoViewIfNeeded();
  await notes.first().click();
  await expect(page).toHaveURL(/\/field-notes\/what-governed-ai-means-and-why-it-matters\/$/);
  await expect(page.locator('h1')).toContainText('governed AI');
});

/** The field notes the index shows right now, by the subject on each row. */
const shownSubjects = (page: Page) =>
  page.locator('.note-list > a.note-row').evaluateAll((rows) =>
    rows.filter((r) => (r as HTMLElement).offsetParent !== null)
      .map((r) => r.querySelector('.note-row__meta')!.textContent!.split('·')[1]!.trim()));

test("a note's subject leads to every note on it, and the index narrows to one subject", async ({ page }) => {
  await page.goto('/field-notes/what-does-an-ai-agent-actually-cost/');
  const subject = page.locator('.article-meta').getByRole('link', { name: 'Pricing' });
  await subject.click();
  await expect(page).toHaveURL(/\/field-notes\/#topic-pricing$/);
  const pricing = page.getByRole('radio', { name: /^Pricing, \d+ notes?$/ });
  await expect(pricing).toBeChecked();
  const count = Number((await pricing.getAttribute('aria-label'))!.match(/\d+/)![0]);
  expect(await shownSubjects(page)).toEqual(Array(count).fill('Pricing'));
  // It lands on the subjects, below the fixed bar, with the first note in view.
  const group = page.getByRole('group', { name: 'Browse by subject' });
  const top = (await group.boundingBox())!.y;
  expect(top).toBeGreaterThan(40);
  expect(top).toBeLessThan(200);

  // Another subject, then all of them again; the address follows so it can be shared.
  await page.getByRole('radio', { name: /^Websites, / }).click();
  await expect(page).toHaveURL(/#topic-websites$/);
  await expect(page.getByRole('status')).toHaveText(/^Showing \d+ notes on Websites\.$/);
  expect(new Set(await shownSubjects(page))).toEqual(new Set(['Websites']));
  await page.getByRole('radio', { name: /^All, / }).click();
  await expect(page).toHaveURL(/\/field-notes\/$/);
  const all = await page.locator('.note-list > a.note-row').count();
  expect(await shownSubjects(page)).toHaveLength(all);
  await expectNoSidewaysScroll(page);
});

test.describe('with JavaScript off, the field notes', () => {
  test.use({ javaScriptEnabled: false });

  test('still narrow to one subject', async ({ page }) => {
    await page.goto('/field-notes/');
    await page.getByRole('radio', { name: /^Social care, / }).click();
    expect(await shownSubjects(page)).toEqual(['Social care', 'Social care']);
  });

  test('open on the newest note, with every subject still within reach', async ({ page }, info) => {
    await page.goto('/field-notes/');
    await page.evaluate(() => document.fonts.ready);
    // The first screen holds the subjects and the newest note's title and summary, not only the
    // hero (its title started 926px down on a 390 × 844 phone, t25360).
    const first = page.locator('.note-list > a.note-row').first();
    await expect(first.locator('.note-row__title')).toBeInViewport({ ratio: 1 });
    if (info.project.name === 'mobile') await expect(first.locator('.note-row__sum')).toBeInViewport({ ratio: 1 });
    const group = page.getByRole('group', { name: 'Browse by subject' });
    await expect(group.getByRole('radio', { name: /^All, / })).toBeInViewport({ ratio: 1 });

    // On a phone the subjects are one row that scrolls sideways; the page itself never does.
    // The last subject is still there to pick, and picking it narrows the list.
    const last = group.getByRole('radio').last();
    const subject = (await last.getAttribute('aria-label'))!.split(',')[0]!;
    await last.click();
    expect(new Set(await shownSubjects(page))).toEqual(new Set([subject]));
    await expectNoSidewaysScroll(page);
  });
});

test("a case study's contents list its sections and their parts, and follow the reader into a part", async ({ page }, info) => {
  await page.goto('/work/care-provider-transformation/');
  const ids = await page.locator('.prose :is(h2, h3)[id]').evaluateAll((hs) => hs.map((h) => h.id));
  expect(ids.length).toBeGreaterThan(await page.locator('.prose h2[id]').count());
  const phone = info.project.name === 'mobile';
  const contents = page.locator(phone ? 'details.toc' : 'nav.toc');
  await expect(page.locator(phone ? 'nav.toc' : 'details.toc')).toBeHidden();

  if (phone) await contents.locator('summary').click();
  const links = contents.getByRole('link');
  expect(await links.evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).hash.slice(1)))).toEqual(ids);

  // A part (an h3): the page lands on it, marks it, and keeps the section that holds it lit.
  const part = contents.locator('ol ol a').nth(2);
  const id = (await part.getAttribute('href'))!.slice(1);
  await part.click();
  const heading = page.locator(`[id="${id}"]`);
  await expect.poll(async () => (await heading.boundingBox())!.y).toBeLessThan(200);
  expect((await heading.boundingBox())!.y).toBeGreaterThan(40);
  await expect(contents.locator('a[aria-current="location"]')).toHaveText((await heading.textContent())!.trim());
  const section = contents.locator('li:has(> ol a[aria-current]) > a');
  await expect(section).toHaveCount(1);
  if (phone) {
    // The bar under the nav names the part, and the list, opened again, lights its section.
    await expect(contents).not.toHaveAttribute('open');
    await expect(contents.locator('summary')).toContainText((await heading.textContent())!.trim());
    await contents.locator('summary').click();
  }
  await page.mouse.move(0, 0); // off the contents, so hover lights nothing
  const [lit, unlit] = await Promise.all([section, links.first()].map((l) => l.evaluate((a) => getComputedStyle(a).color)));
  expect(lit).not.toBe(unlit);
  await expect(contents).toBeVisible();
  await expectNoSidewaysScroll(page);
});

test("a case study figure's Source link lands on the line of evidence behind it", async ({ page }) => {
  await page.goto('/work/care-provider-transformation/');
  const stat = page.locator('.statband .stat').filter({ hasText: '588' });
  await stat.getByRole('link', { name: 'Source for 588' }).click();
  const item = page.locator('.evidence__item:target');
  await expect(item).toContainText('588 supervision/spot-check schedules instantiated automatically');
  // It lands below the fixed header, not under it.
  await expect.poll(async () => (await item.boundingBox())!.y).toBeLessThan(260);
  expect((await item.boundingBox())!.y).toBeGreaterThan(40);
  await expect(page.getByRole('link', { name: '/api/claims.json' })).toBeVisible();
  await expectNoSidewaysScroll(page);
});

test("a field note's figure lands on the case study's line of evidence for it (t23577)", async ({ page }) => {
  await page.goto('/field-notes/automation-for-care-providers-where-to-start/');
  await page.getByRole('link', { name: '294 carers and 293 service users' }).click();
  await expect(page).toHaveURL(/\/work\/care-provider-transformation\/#source-carer-record-count$/);
  const item = page.locator('.evidence__item:target');
  await expect(item).toContainText('roster import created 294 carers + 293 service users');
  await expect.poll(async () => (await item.boundingBox())!.y).toBeLessThan(260);
  expect((await item.boundingBox())!.y).toBeGreaterThan(40);
});

test('a case card opens its study from anywhere on it, and its Sources link opens the evidence (t23577)', async ({ page }) => {
  await page.goto('/');
  const card = page.locator('.case-card--feature');
  // A mouse on the summary text, not the title: the title's link covers the whole card.
  await card.scrollIntoViewIfNeeded();
  const blurb = (await card.locator('.case-card__blurb').boundingBox())!;
  await page.mouse.click(blurb.x + blurb.width / 2, blurb.y + blurb.height / 2);
  await expect(page).toHaveURL(/\/work\/care-provider-transformation\/$/);
  await page.goBack();
  await page.locator('.case-card--feature').getByRole('link', { name: /^Sources for the figures in/ }).click();
  await expect(page).toHaveURL(/\/work\/care-provider-transformation\/#sources$/);
  await expect(page.getByRole('heading', { name: 'Where these numbers come from' })).toBeInViewport();
  await expectNoSidewaysScroll(page);
});

test('the developer reference shows each whole command, copies it, and lists what comes back', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/developers/');
  const row = page.locator('.ep').filter({ has: page.locator('a[href="/api/case-studies.json"]') });
  const command = row.locator('.ep__cmd pre');
  // The longest URL stays whole on a phone: it wraps, never scrolls out of sight.
  expect(await command.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);

  await row.getByRole('button', { name: 'Copy the command for /api/case-studies.json' }).click();
  await expect(row.locator('.ep__copy')).toHaveText(/^Copied/);
  await expect(page.locator('#copy-status')).toHaveText('Command copied.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`curl -s ${business.url}/api/case-studies.json`);

  const fields = row.locator('.ep__fields');
  await expect(fields.locator('dl')).toBeHidden();
  await fields.locator('summary').click();
  await expect(fields.locator('dt code', { hasText: /^caseStudies$/ })).toBeVisible();
});

test('a developer whose clipboard is denied gets the command selected instead', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.clipboard.writeText = () => Promise.reject(new DOMException('Denied', 'NotAllowedError'));
  });
  await page.goto('/developers/');
  await page.getByRole('button', { name: 'Copy the command for /api/index.json' }).click();
  await expect(page.locator('#copy-status')).toHaveText('Command selected. Copy it with your keyboard.');
  expect(await page.evaluate(() => getSelection()?.toString())).toBe(`curl -s ${business.url}/api/index.json`);
});

test('a missing page shows recovery links on arrival and leads back to the site', async ({ page }) => {
  const res = await page.goto('/no-such-page-journey/');
  expect(res?.status()).toBe(404);
  const main = page.getByRole('main');
  const services = main.getByRole('link', { name: 'Services & pricing' });
  await expect(services).toBeInViewport({ ratio: 1 });
  await expect(main.getByRole('heading', { level: 1, name: /page not found/i })).toBeInViewport();
  await expect(main.getByRole('link', { name: 'Back to home' })).toBeInViewport();
  const sections = main.getByRole('navigation', { name: 'Where were you heading?' });
  for (const link of await sections.getByRole('link').all()) {
    await expect(link).toBeInViewport({ ratio: 1 });
  }
  await services.focus();
  await services.press('Enter');
  await expect(page).toHaveURL(/\/services\/$/);
});

test('a shared page previews with its own card, not the generic image', async ({ page }) => {
  const cards: Array<[string, string]> = [
    ['/field-notes/what-does-an-ai-agent-actually-cost/', '/og/field-notes/what-does-an-ai-agent-actually-cost.png'],
    ['/work/care-provider-transformation/', '/og/work/care-provider-transformation.png'],
    ['/services/', '/og/pages/services.png'],
  ];
  for (const [path, card] of cards) {
    await page.goto(path);
    const og = (p: string) => page.locator(`meta[property="og:${p}"]`).getAttribute('content');
    const image = new URL((await og('image'))!);
    expect(image.pathname, `${path} shares the generic image`).toBe(card);
    // The tags are absolute production URLs; fetch the same path from the origin under test.
    const res = await page.request.get(image.pathname);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toMatch(/^image\/png/);
    const png = await res.body();
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([Number(await og('image:width')), Number(await og('image:height'))]);
    expect(await og('image:alt')).toContain((await page.locator('h1').textContent())!.trim());
  }
});
