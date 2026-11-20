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
    // main.js has paused what is offscreen (the footer's tagline always is).
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

test('visitor can compare starting prices immediately and jump to each offer', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/services/');
  const comparison = page.getByRole('navigation', { name: 'Services & pricing', exact: true });
  for (const [index, service] of services.entries()) {
    // A page about published prices must show them on arrival, not below a
    // promotional introduction. A phone has room for the first offer only.
    if (info.project.name === 'desktop' || index === 0) {
      await expect(comparison.getByText(formatGBP(service.priceFrom), { exact: false })).toBeInViewport();
    }
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

test('the price ladder counts its rungs 01 to 04 in order', async ({ page }) => {
  await page.goto('/');
  const steps = page.locator('.ladder .rung__step');
  await expect(steps).toHaveCount(services.length);
  const painted = await steps.evaluateAll((els) =>
    els.map((el) => ({ step: (el as HTMLElement).dataset.step, content: getComputedStyle(el, '::before').content })),
  );
  // Each rung is a size container, which scopes CSS counters to the rung: a
  // counter read "01" on every card (t21223). The number comes from the markup.
  expect(painted.map((p) => p.step)).toEqual(services.map((_, i) => String(i + 1).padStart(2, '0')));
  for (const p of painted) expect(p.content, 'rung number is a CSS counter again').not.toContain('counter(');
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

test('the enquiry form starts on the first screen, and still works with text at 200%', async ({ page }, info) => {
  await stubIntake(page, { status: 200, body: { ok: true } });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/contact/');
  // The page exists to take an enquiry: the first field is visible on arrival,
  // not two screens down behind the promise (1558px at 390×844 before t19493).
  await expect(page.locator('#name')).toBeInViewport({ ratio: 1 });
  // And it is the first stop in the content, ahead of the promise and phone route.
  const order = await page.evaluate(() => {
    const name = document.getElementById('name')!;
    const tel = document.querySelector('main a[href^="tel:"]')!;
    return name.compareDocumentPosition(tel) & Node.DOCUMENT_POSITION_FOLLOWING ? 'form first' : 'form after';
  });
  expect(order).toBe('form first');

  // A visitor who enlarges text to 200% (WCAG 1.4.4) can still open the menu
  // and use the form without scrolling sideways. The menu button used to sit
  // at x=517 on a 390px screen.
  await page.evaluate(() => document.documentElement.style.setProperty('font-size', '200%'));
  await expectNoSidewaysScroll(page);
  if (info.project.name === 'mobile') {
    const menu = page.getByRole('button', { name: 'Open menu' });
    await expect(menu).toBeInViewport({ ratio: 1 });
    await menu.click();
    await expect(page.locator('#mobile-menu')).toBeVisible();
  }
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

test('the security check loads when the visitor starts on the form, not with the page', async ({ page }) => {
  // Turnstile cost a phone ~250 KB and ~0.5 s of main thread on arrival (t21450).
  // The stub records what the form asks it to render, and calls the onload
  // callback named in the script URL, as the real api.js does.
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
  await page.waitForLoadState('load');
  await page.waitForTimeout(500);
  expect(asked, 'Turnstile loaded before the visitor touched the form').toEqual([]);

  await page.locator('#name').focus();
  await expect.poll(() => asked.length).toBe(1);
  expect(asked[0]).toContain('render=explicit');
  const rendered = await page.waitForFunction(() => (window as unknown as { __rendered?: object }).__rendered).then((h) => h.jsonValue());
  expect(rendered).toEqual({ slot: expect.stringContaining('turnstile-slot'), sitekey: expect.stringMatching(/^0x/), theme: 'dark', onError: 'function' });

  // More typing never loads it twice.
  await page.locator('#email').fill('x@example.com');
  await page.locator('#name').fill('Again');
  expect(asked).toHaveLength(1);
});

test('a visitor who reads without touching anything still gets the check before typing', async ({ page }) => {
  const asked: string[] = [];
  await page.route('**/challenges.cloudflare.com/**', (route) => {
    asked.push(route.request().url());
    return route.fulfill({ contentType: 'text/javascript', body: 'window.turnstile={getResponse:()=>"",reset(){},render(){}};' });
  });
  await page.goto('/contact/');
  await page.waitForLoadState('load');
  expect(asked).toEqual([]);
  // Two seconds after the page has loaded, with no scroll, tap or key.
  await expect.poll(() => asked.length, { timeout: 6000 }).toBe(1);
});

test('the security check is ready by the time a visitor scrolls to it without typing', async ({ page }) => {
  const asked: string[] = [];
  await page.route('**/challenges.cloudflare.com/**', (route) => {
    asked.push(route.request().url());
    return route.fulfill({ contentType: 'text/javascript', body: 'window.turnstile={getResponse:()=>"",reset(){},render(){}};' });
  });
  await page.goto('/contact/');
  await page.waitForLoadState('load');
  expect(asked).toEqual([]);
  await page.locator('.turnstile-slot').scrollIntoViewIfNeeded();
  await expect.poll(() => asked.length).toBe(1);
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
  // Copy reads the latest draft, including edits made after the send failed.
  await page.locator('#extra').fill('Updated after the outage.');
  await recovery.getByRole('button', { name: 'Copy enquiry' }).click();
  await expect(recovery.getByRole('status')).toContainText('Copied.');
  const draft = await page.evaluate(() => navigator.clipboard.readText());
  expect(draft).toContain(ENQUIRY.time_sink);
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
    const email = page.locator('main').getByRole('link', { name: business.email });
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
    await links.nth(n).click();
    const heading = page.locator(`[id="${ids[n]}"]`);
    // It scrolls (smoothly) to just below the fixed nav, not under it, and is marked as being read.
    await expect.poll(async () => (await heading.boundingBox())!.y).toBeLessThan(200);
    expect((await heading.boundingBox())!.y).toBeGreaterThan(40);
    await expect(contents.locator('a[aria-current="location"]')).toHaveText((await heading.textContent())!.trim());
  }
  await expect(contents).toBeVisible();
  await expectNoSidewaysScroll(page);
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
  await page.mouse.move(0, 0); // off the contents, so hover lights nothing
  const [lit, unlit] = await Promise.all([section, links.first()].map((l) => l.evaluate((a) => getComputedStyle(a).color)));
  expect(lit).not.toBe(unlit);
  await expect(contents).toBeVisible();
  await expectNoSidewaysScroll(page);
});

test('a page that does not exist is a real 404 with a way back', async ({ page }) => {
  const res = await page.goto('/no-such-page-journey/');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('link', { name: /home|automancer/i }).first()).toBeVisible();
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
