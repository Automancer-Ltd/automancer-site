/**
 * The contact form's security check runs in a frame on its own host, check.automancer.uk, which
 * the edge Worker answers (securityCheck() in ops/edge/worker.js, t27305). Against production the
 * real frame answers. A local run serves the site from 127.0.0.1, so this answers the check host
 * from the same Worker, told that the local copy is the page allowed to frame it and to receive
 * its token, as production's is automancer.uk.
 *
 * Cloudflare's script itself is stubbed in every run (TURNSTILE_STUB): it loads in the frame, as
 * api.js does, and issues a token whenever the widget is drawn or reset.
 */
import type { Page } from '@playwright/test';
import worker from '../../ops/edge/worker.js';
import { SECURITY_CHECK_URL } from '../../src/config/site';

export const CHECK_FRAME = new RegExp(`^${SECURITY_CHECK_URL.replaceAll('.', '\\.')}`);

/** A stand-in for api.js: draws nothing, and issues a token on render and on every reset. */
export const TURNSTILE_STUB = `window.turnstile = (() => {
  let options = null;
  return {
    render(el, o) { options = o; o.callback('journey-token'); return 'journey-widget'; },
    reset() { options?.callback('journey-token'); },
  };
})(); window.onTurnstileLoad();`;

export async function serveCheckFrame(page: Page, baseURL: string | undefined): Promise<void> {
  if (process.env.JOURNEY_URL || !baseURL) return;
  const parent = new URL(baseURL).origin;
  await page.route(`${SECURITY_CHECK_URL}**`, async (route) => {
    const request = route.request();
    const response = (await worker.fetch(new Request(request.url(), { method: request.method() }), { CHECK_PARENT: parent })) as Response;
    await route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: Buffer.from(await response.arrayBuffer()),
    });
  });
}

/** Stub Cloudflare's script in the check frame with `body` (TURNSTILE_STUB unless given). */
export async function stubTurnstile(page: Page, body = TURNSTILE_STUB): Promise<void> {
  await page.route('**/challenges.cloudflare.com/**', (route) => route.fulfill({ contentType: 'text/javascript', body }));
}
