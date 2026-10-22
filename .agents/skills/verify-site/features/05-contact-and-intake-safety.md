# Feature 05: Contact Form Validation, Turnstile Fallback, and Intake Safety

## Scope
Covers `/contact/`, `#contact-form` fields, direct `mailto:waseem@automancer.uk` and `tel:+447451261333` fallback links, client-side validation focus/ARIA management, and human-copy error handling without sending spam to the production intake endpoint.

## Preconditions
- Preview server running on `http://127.0.0.1:$PORT`.

## Steps (`1280x800` and `390x844`)
1. Open `/contact/`.
2. Assert `#contact-form` contains `#name`, `#company`, `#email`, `#time-sink` (`name="time_sink"`), `#team-size` (`name="team_size"`), `#extra`, hidden honeypot `#website`, and submit button `Send it to Waseem`.
3. Assert direct fallback links `mailto:waseem@automancer.uk` and `tel:+447451261333` and the `"We promise a meeting within one week of first contact."` commitment are visible.
4. **Empty-name validation**: submit `#contact-form` with `#name` empty. Assert:
   - `#form-error` displays `"Please add your name."`
   - `#name` has `aria-invalid="true"` and `aria-describedby="form-error"`
   - `document.activeElement.id === "name"`
5. **Missing-email validation**: fill `#name` (`"Test Visitor"`), leave `#email` empty, and submit. Assert:
   - `#form-error` displays `"Please add a valid email so Waseem can reply."`
   - `#email` has `aria-invalid="true"` and `document.activeElement.id === "email"`
   - `#name` no longer has `aria-invalid`
6. **Turnstile widget error fallback**: invoke `window.onTurnstileError()` in the page context. Assert:
   - `#form-error` displays human copy offering `waseem@automancer.uk` and never leaks raw error code `600010` or snake_case tokens.
7. **Reduced motion**: enable `prefers-reduced-motion: reduce`. Submit an empty name, then correct the form and submit with the Intake Endpoint mocked to return success. Both the invalid field and confirmation heading must receive focus and become visible without animated scrolling. No real enquiry is sent.

## Evidence
- `desktop-contact.png`, `desktop-contact-validation.png`, `mobile-contact.png`.
