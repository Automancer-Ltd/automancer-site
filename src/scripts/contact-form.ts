/**
 * The enquiry form on /contact/: the site's one way for a visitor to send us something.
 *
 * The page ships the form hidden with Send disabled and shows a "please email" line instead, so a
 * visitor without this script never posts an enquiry to GitHub Pages and loses it. This module
 * takes over: it validates against the intake endpoint's own limits, posts JSON to ENDPOINT_URL
 * (no credentials), and shows only our own copy for an error (LEAD_ERROR_COPY: the API's machine
 * codes never reach the screen, tests/contact-errors.test.ts). Whenever the enquiry cannot be
 * delivered it opens the recovery block: the email route, carrying the chosen service, and a Copy
 * button for the draft.
 *
 * Cloudflare Turnstile loads only when someone uses the form, and mounts in a typing pause
 * (t24160). The page's Trusted Types policy lets this module create one script URL, Turnstile's.
 *
 * The page-specific facts (the address, the draft's field labels, the service names) come from
 * the form's data-enquiry attribute, written by contact.astro from src/data/enquiry.ts; the
 * endpoint, limits and error copy are imported from src/config/site.ts, which imports nothing.
 * Astro bundles this module into the page itself (it imports nothing at run time), and its CSP
 * hash is added to the page's policy, as before.
 */
import { ENDPOINT_URL, FIELD_LIMITS, LEAD_ERROR_COPY, LEAD_ERROR_FALLBACK } from '../config/site';

/** What contact.astro writes into the form's data-enquiry attribute. */
export interface EnquiryPageData {
  /** The address the email route writes to. */
  email: string;
  /** The `?service=` parameter that picks a service on arrival. */
  serviceParam: string;
  /** The draft's fields in the form's order: each control's name and its label. */
  fields: readonly { id: string; label: string }[];
  /** The services the form offers: each radio's value and the name a person reads. */
  services: readonly { value: string; label: string }[];
}

interface TurnstileApi {
  getResponse(): string | undefined;
  reset(): void;
  render(slot: Element, options: Record<string, unknown>): void;
}

/** Trusted Types, as far as this module uses them (Chromium; absent elsewhere). */
interface ScriptUrlPolicy {
  createScriptURL(url: string): unknown;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
    onTurnstileLoad?: () => void;
    onTurnstileError?: () => boolean;
    trustedTypes?: { createPolicy(name: string, rules: { createScriptURL(url: string): string }): ScriptUrlPolicy };
  }
  interface Document {
    /** True while Chromium prerenders the page (Speculation Rules, BaseLayout.astro). */
    readonly prerendering?: boolean;
  }
}

/** The lead API's error body: `error` is a machine code, never shown as it is. */
interface ApiAnswer {
  ok?: unknown;
  error?: unknown;
  retryAfterMs?: unknown;
}

const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad';
const SECURITY_CHECK_COPY = 'The security check could not load.';
const SEND_LABEL = 'Send it to Waseem';

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} is missing from /contact/`);
  return el as T;
}

/** Only our own error copy, even when the API sends an unknown code or none. */
function copyFor(answer: ApiAnswer | null, ourDefault?: string): string {
  const code = typeof answer?.error === 'string' ? answer.error : null;
  if (code !== null && Object.hasOwn(LEAD_ERROR_COPY, code)) return LEAD_ERROR_COPY[code]!;
  return ourDefault || LEAD_ERROR_FALLBACK;
}

async function answerOf(res: Response): Promise<ApiAnswer> {
  const body: unknown = await res.json().catch(() => ({}));
  return body !== null && typeof body === 'object' ? (body as ApiAnswer) : {};
}

function start(form: HTMLFormElement): void {
  const page = JSON.parse(form.dataset.enquiry ?? '') as EnquiryPageData;
  const control = (name: string) => form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement;
  const errEl = byId('form-error');
  const confirmEl = byId('form-confirm');
  const recovery = byId('form-recovery');
  const submitBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const submitLabel = submitBtn.querySelector('span')!;
  const carried = byId('service-carried');
  const optionalDetails = byId<HTMLDetailsElement>('optional-details');
  const optionalService = byId('optional-service');
  const servicePick = byId('service-pick');
  const serviceRadios = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="service"]'));
  const slot = form.querySelector<HTMLElement>('.turnstile-slot');
  const fieldControls = ['name', 'email', 'company', 'time_sink', 'team_size', 'extra'].map(control);

  function showError(msg: string): void {
    errEl.textContent = msg;
    errEl.style.display = 'block';
  }
  function showDeliveryError(msg: string): void {
    showError(msg);
    // The email route carries the chosen service in its subject.
    const chosen = chosenService();
    byId<HTMLAnchorElement>('email-enquiry').href =
      `mailto:${page.email}${chosen ? `?subject=${encodeURIComponent(`Enquiry: ${chosen.label}`)}` : ''}`;
    recovery.hidden = false;
  }
  function clearError(): void {
    errEl.style.display = 'none';
    errEl.textContent = '';
    for (const el of fieldControls) {
      el.removeAttribute('aria-invalid');
      el.removeAttribute('aria-describedby');
    }
  }
  // Validation failure: name the field, move focus onto it, and scroll it into
  // view. At 375 the error sits above Send while #name is off-screen.
  function failField(field: HTMLElement | null, msg: string): void {
    showError(msg);
    if (!field) return;
    if (optionalDetails.contains(field)) optionalDetails.open = true;
    field.setAttribute('aria-invalid', 'true');
    field.setAttribute('aria-describedby', 'form-error');
    field.focus();
    field.scrollIntoView({ block: 'center' });
  }

  // Offer fragments let every offer share the same HTTP cache entry. After
  // arrival use the published query address, so reloads and shares keep the
  // choice even if the visitor has followed another anchor in the form.
  function chosenService(): EnquiryPageData['services'][number] | null {
    const checked = serviceRadios.find((r) => r.checked);
    return checked ? (page.services.find((o) => o.value === checked.value) ?? null) : null;
  }
  function showCarried(): void {
    const chosen = chosenService();
    if (!chosen) {
      carried.hidden = true;
      return;
    }
    carried.querySelector('[data-service-name]')!.textContent = chosen.label;
    carried.hidden = false;
  }
  function selectArrivingService(): void {
    const url = new URL(location.href);
    const param = page.serviceParam;
    const offer = url.hash.startsWith(`#${param}=`) ? new URLSearchParams(url.hash.slice(1)).get(param) : null;
    const wanted = url.searchParams.get(param) ?? offer;
    const arrived = serviceRadios.find((r) => r.value === wanted);
    if (!arrived) return;
    arrived.checked = true;
    showCarried();
    if (offer !== null) {
      url.hash = '';
      url.searchParams.set(param, arrived.value);
      history.replaceState(history.state, '', url.pathname + url.search);
    }
  }
  // Chrome may activate a prerender with a different fragment than it
  // started with. Read the address the visitor actually opened.
  if (document.prerendering) document.addEventListener('prerenderingchange', selectArrivingService, { once: true });
  else selectArrivingService();
  servicePick.addEventListener('change', () => {
    const chosen = chosenService();
    if (!carried.hidden) showCarried();
    else optionalService.textContent = chosen?.label ?? '';
    const url = new URL(location.href);
    if (chosen) url.searchParams.set(page.serviceParam, chosen.value);
    else url.searchParams.delete(page.serviceParam);
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  });
  carried.querySelector('a')!.addEventListener('click', (event) => {
    event.preventDefault();
    optionalDetails.open = true;
    const target = serviceRadios.find((r) => r.checked) ?? serviceRadios[0];
    servicePick.scrollIntoView({
      block: 'center',
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
    target?.focus({ preventScroll: true });
  });

  byId('copy-enquiry').addEventListener('click', async () => {
    const status = byId('copy-enquiry-status');
    const draftField = byId('enquiry-draft-field');
    const values = new FormData(form);
    const text = page.fields
      .flatMap((field) => {
        const entry = values.get(field.id);
        const value = field.id === 'service' ? chosenService()?.label : typeof entry === 'string' ? entry.trim() : '';
        return value ? [`${field.label}\n${value}`] : [];
      })
      .join('\n\n');
    if (!text) {
      status.textContent = 'There is nothing to copy yet.';
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      draftField.hidden = true;
      status.textContent = 'Copied. Paste your enquiry into your email.';
    } catch {
      const draft = byId<HTMLTextAreaElement>('enquiry-draft');
      status.textContent = 'Select and copy your enquiry below.';
      draft.value = text;
      draftField.hidden = false;
      draft.focus();
      draft.select();
    }
  });

  // A reader may be here for the phone number. Start the check only when
  // someone uses the form, early enough to run while they fill it in.
  let turnstileState: 'idle' | 'loading' | 'loaded' | 'ready' | 'failed' = 'idle';
  let turnstileLoadTimer: ReturnType<typeof setTimeout> | undefined;
  let turnstileRenderTimer: ReturnType<typeof setTimeout> | undefined;
  let lastInputAt = 0;

  function turnstileToken(): string {
    // Prefer the official API; fall back to the injected hidden input.
    try {
      if (window.turnstile) return window.turnstile.getResponse() || '';
    } catch {}
    return form.querySelector<HTMLInputElement>('[name="cf-turnstile-response"]')?.value ?? '';
  }
  function securityCheckUnavailable(): void {
    clearTimeout(turnstileLoadTimer);
    turnstileState = 'failed';
    showDeliveryError(SECURITY_CHECK_COPY);
  }
  window.onTurnstileError = () => {
    securityCheckUnavailable();
    // Keep a handled widget error out of Sentry (AUTOMANCER-SITE-4).
    return true;
  };
  function resetTurnstile(): void {
    try {
      window.turnstile?.reset();
    } catch {}
  }
  function renderTurnstile(): void {
    clearTimeout(turnstileRenderTimer);
    turnstileState = 'ready';
    // A late load can still render. Leave the email and copy controls
    // available in case the visitor has already started using them.
    if (errEl.textContent === SECURITY_CHECK_COPY) clearError();
    try {
      window.turnstile!.render(slot!, {
        sitekey: slot!.getAttribute('data-sitekey'),
        theme: slot!.getAttribute('data-theme'),
        'error-callback': window.onTurnstileError,
      });
    } catch {
      securityCheckUnavailable();
    }
  }
  function scheduleTurnstileRender(): void {
    // Mounting the widget can block typing on a slower phone. Start in a
    // pause, or immediately if the visitor submits the form first.
    clearTimeout(turnstileRenderTimer);
    turnstileRenderTimer = setTimeout(renderTurnstile, Math.max(0, 600 - (Date.now() - lastInputAt)));
  }
  window.onTurnstileLoad = () => {
    clearTimeout(turnstileLoadTimer);
    turnstileState = 'loaded';
    scheduleTurnstileRender();
  };
  // The page refuses plain strings as script URLs (Trusted Types, astro.config.mjs).
  // This page's one policy can produce exactly Turnstile's URL and nothing else.
  let turnstilePolicy: ScriptUrlPolicy | null = null;
  try {
    turnstilePolicy =
      window.trustedTypes?.createPolicy('turnstile', {
        createScriptURL(url: string) {
          if (url !== TURNSTILE_SRC) throw new TypeError('Only the Turnstile script may load here');
          return url;
        },
      }) ?? null;
  } catch {}
  function loadTurnstile(): void {
    if (turnstileState !== 'idle' || !slot || document.prerendering) return;
    turnstileState = 'loading';
    const s = document.createElement('script');
    try {
      // A TrustedScriptURL where the page enforces Trusted Types, else the plain URL.
      (s as { src: unknown }).src = turnstilePolicy ? turnstilePolicy.createScriptURL(TURNSTILE_SRC) : TURNSTILE_SRC;
    } catch {
      securityCheckUnavailable();
      return;
    }
    s.async = true;
    s.onerror = securityCheckUnavailable;
    // A stalled download does not fire onerror. Offer the draft without
    // making the visitor wait for the browser's network timeout.
    turnstileLoadTimer = setTimeout(securityCheckUnavailable, 10_000);
    document.head.appendChild(s);
  }
  form.addEventListener('focusin', loadTurnstile);
  form.addEventListener('pointerdown', loadTurnstile);
  form.addEventListener('input', () => {
    lastInputAt = Date.now();
    loadTurnstile();
    if (turnstileState === 'loaded') scheduleTurnstileRender();
  });

  // Warm the connection to the intake API with an empty OPTIONS while the visitor types (t20932).
  let warmedAt = 0;
  function warmSend(): void {
    const now = Date.now();
    if (now - warmedAt < 60_000) return;
    warmedAt = now;
    fetch(ENDPOINT_URL, { method: 'OPTIONS', credentials: 'omit' }).catch(() => {});
  }
  form.addEventListener('focusin', warmSend);
  form.addEventListener('input', warmSend);

  let turnstileFailures = 0;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();

    const [nameEl, emailEl, companyEl, timeSinkEl, teamEl, extraEl] = fieldControls as [
      HTMLInputElement, HTMLInputElement, HTMLInputElement, HTMLTextAreaElement, HTMLInputElement, HTMLTextAreaElement,
    ];
    const name = nameEl.value.trim();
    const email = emailEl.value.trim();
    const company = companyEl.value.trim();
    const timeSink = timeSinkEl.value.trim();
    const team = teamEl.value.trim();
    const extra = extraEl.value.trim();
    const chosen = chosenService();

    // Compose the single message field the intake contract expects.
    let message = (chosen ? `Interested in: ${chosen.label}\n\n` : '') + timeSink;
    if (team) message += `\n\nTeam size: ${team}`;
    if (extra) message += `\n\nAlso: ${extra}`;

    // Client-side validation mirroring the endpoint's limits.
    const limits = FIELD_LIMITS;
    if (!name) return failField(nameEl, 'Please add your name.');
    if (name.length > limits.name) return failField(nameEl, `Name is a bit long — keep it under ${limits.name} characters.`);
    if (!email || emailEl.validity.typeMismatch) return failField(emailEl, 'Please add a valid email so Waseem can reply.');
    if (email.length > limits.email) return failField(emailEl, 'That email looks too long to be right.');
    if (!timeSink) return failField(timeSinkEl, 'Tell us what’s eating your week — even a sentence helps.');
    if (company.length > limits.company) return failField(companyEl, `Business name is a bit long — under ${limits.company} characters, please.`);
    if (message.length > limits.message) {
      return failField(null, `Your message is over the ${limits.message}-character limit across the message, team size and extra boxes. Please shorten any of them.`);
    }

    if (turnstileState === 'loaded') renderTurnstile();
    const token = turnstileToken();
    if (!token) {
      if (turnstileState === 'failed' || !slot) return securityCheckUnavailable();
      loadTurnstile();
      return showError('Please complete the security check above.');
    }

    const payload = {
      name,
      email,
      company: company || undefined,
      message,
      turnstileToken: token,
      website: control('website').value, // the honeypot: a person leaves it empty
    };

    submitBtn.disabled = true;
    submitLabel.textContent = 'Sending…';
    let sent = false;

    try {
      const res = await fetch(ENDPOINT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'omit',
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      });

      if (res.status === 200 && (await answerOf(res)).ok) {
        sent = true;
        form.style.display = 'none';
        confirmEl.style.display = 'block';
        confirmEl.scrollIntoView({ block: 'center' });
        // The focused Send button was just hidden with the form; land
        // keyboard and screen-reader users on the confirmation instead.
        confirmEl.querySelector('h2')?.focus({ preventScroll: true });
        return;
      }

      if (res.status === 400) {
        showError(copyFor(await answerOf(res), 'Something in the form needs a second look.'));
      } else if (res.status === 403) {
        const answer = await answerOf(res);
        // A bad token and a bad server secret can both be 403. Offer email after a repeat.
        turnstileFailures += 1;
        if (answer.error === 'turnstile_unavailable' || answer.error === 'server_misconfigured') {
          showDeliveryError(copyFor(answer));
        } else if (turnstileFailures >= 2) {
          showDeliveryError('The security check keeps failing.');
        } else {
          showError(copyFor(answer, 'The security check needs another go — please complete it again and resend.'));
        }
      } else if (res.status === 429) {
        const answer = await answerOf(res);
        const secs = typeof answer.retryAfterMs === 'number' && answer.retryAfterMs > 0 ? Math.ceil(answer.retryAfterMs / 1000) : null;
        showError(copyFor(answer, `Whoa, easy — that’s a lot of sending. ${secs ? `Give it about ${secs} seconds` : 'Give it a moment'} and try once more.`));
      } else {
        showDeliveryError(copyFor(null));
      }
    } catch {
      // Network / CORS failure (expected off the production origin).
      showDeliveryError('Couldn’t reach us just now.');
    } finally {
      // A Turnstile token is single-use, and any request that reached the
      // API may have spent it: a resend with the old one gets a 403.
      if (!sent) resetTurnstile();
      submitBtn.disabled = false;
      submitLabel.textContent = SEND_LABEL;
    }
  });

  submitBtn.disabled = false;
  form.hidden = false;
  byId('form-unavailable').hidden = true;
}

const form = document.getElementById('contact-form');
if (form instanceof HTMLFormElement) start(form);
