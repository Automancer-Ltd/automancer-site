/**
 * Site-wide runtime configuration.
 *
 * This is the ONE obvious place later passes (form-backend integration,
 * security) should edit to point the site at real, live endpoints/keys.
 * Everything here is a placeholder as of the structure-only scaffold.
 */

/**
 * Contact form submission target — the finalised AUTD lead-intake endpoint.
 *
 * NO third-party form processors (Formspree, Netlify Forms, Basin, etc.).
 * The previous site posted to Formspree; that is deliberately replaced. This
 * endpoint owns contact-form ingestion end to end.
 *
 * Contract (see src/pages/contact.astro for the client implementation):
 *   POST application/json, no credentials.
 *   Body: { name, email, company?, message, turnstileToken, website }
 *         `website` is a honeypot — must submit empty.
 *   Responses: 200 {ok:true}; any other status carries a MACHINE CODE in
 *              `error`. The codes and the copy a visitor sees for each are
 *              defined once in LEAD_ERROR_COPY below — that map IS the
 *              documentation, so there is one place to be wrong instead of a
 *              prose list here that silently goes stale when the API changes.
 *
 * NOTE: the API CORS origin is locked to https://automancer.uk, so live
 * submissions only succeed from the production origin — local `astro dev`
 * / preview will hit a CORS wall (expected), and the form degrades to the
 * mailto fallback there.
 */
/**
 * Machine code -> copy a human wrote FOR A VISITOR.
 *
 * The lead API returns a bare code in `error` (turnstile_failed,
 * rate_limited, ...). Those are machine-readable BY DESIGN and it should keep
 * sending them — but a code is not user-facing copy, and rendering one
 * verbatim shows a visitor "turnstile_failed". This map is where the words a
 * person reads are decided, on the site, by us.
 *
 * ALLOWLIST, deliberately: a code we do not recognise falls through to
 * `LEAD_ERROR_FALLBACK`. We never surface a string that merely ARRIVED — that
 * is how an internal identifier or a provider error reaches a visitor.
 *
 * Adding a code here is the ONLY thing needed when the API grows a new one.
 * Until then an unknown code still gets honest copy and a working way to reach
 * us, rather than a dead end.
 */
export const LEAD_ERROR_COPY: Record<string, string> = {
  turnstile_failed:
    'The security check did not go through. Please complete it again and resend.',
  turnstile_unavailable:
    'Our security check could not be reached just now — that is our side, not yours.',
  server_misconfigured:
    'Something is misconfigured on our side, so your message did not reach us. This is not anything you did.',
  origin_not_allowed:
    'This form could not submit from where it is being viewed. That is a fault on our side.',
  rate_limited:
    'That is a lot of sending in a short time. Give it a moment and try once more.',
};

/**
 * Used for any code NOT in the allowlist, and whenever the API sends no code.
 * Always paired with the direct email route by the caller, so a visitor is
 * never left without a way through.
 */
export const LEAD_ERROR_FALLBACK =
  'Something went wrong on our end and your message did not reach us.';

export const ENDPOINT_URL = 'https://api.automancer.uk/api/lead';

/** Client-side field limits, mirrored from the intake endpoint's validation. */
export const FIELD_LIMITS = {
  name: 200,
  email: 254,
  company: 200,
  message: 5000,
} as const;

/**
 * Cloudflare Turnstile site key for the contact form widget
 * (widget "automancer.uk lead form", managed mode, domain automancer.uk).
 * Site keys are public by design; the paired secret is TURNSTILE_SECRET in
 * the AUTD Convex deployment.
 */
export const TURNSTILE_SITE_KEY = '0x4AAAAAADvPxrMk2dXVzYwH';
