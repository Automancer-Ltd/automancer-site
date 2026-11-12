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
