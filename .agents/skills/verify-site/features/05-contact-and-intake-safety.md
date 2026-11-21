# 05 Contact and the enquiry form

**The journey.** A visitor fills in the form on `/contact/`, gets told plainly what is missing,
sends it, and sees the confirmation. If the security check or the intake service fails, they keep
what they wrote and get a working email route.

**Reach it.** `/contact/` (header, footer and every call to action). An offer's button, and
every "Book an Audit" button, opens `/contact/?service=<id>`: the form arrives with that service
picked and named above the first field.

**Proved by** (the intake endpoint and Turnstile are stubbed in every run, production included):

- `visitor finds the prices and reaches us through the contact form`: validation, focus on the
  first missing field, the exact posted body and the confirmation.
- `an offer's button carries that service into the enquiry, and the visitor can change it`:
  Services → Contact with the Sprint picked, Change, the address following the pick, the
  "Interested in: …" line leading the posted message, and an unknown `?service=` picking nothing.
- `with reduced motion, the form jumps straight to its error and its confirmation`.
- `the enquiry form starts on the first screen, and still works with text at 200%`.
- `the security check loads when the visitor starts on the form, not with the page`, and the two
  tests after it.
- `a refused or failed send keeps the enquiry and never shows an error code` and
  `a blocked security check offers a draft even when the clipboard is denied`.
- `with JavaScript off` › `offers email where the contact form would have been`.
- Vitest: `tests/contact-errors.test.ts` (no raw API code reaches the page) and
  `tests/enquiry-contract.test.ts` (the form matches `/api/enquiry.json`).

**End state.** One well-formed enquiry is posted, or none with the visitor's words kept.

**Gotchas.** Never submit to the real `ENDPOINT_URL` (`src/config/site.ts`): stub it as
`stubIntake()` in `tests/journey/visitor.spec.ts` does.
