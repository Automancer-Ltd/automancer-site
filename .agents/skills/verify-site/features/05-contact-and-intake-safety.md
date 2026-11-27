# 05 Contact and the enquiry form

**The journey.** A visitor can email Waseem, leave a voicemail, or see all the required enquiry
fields on the first screen at 390×844 and 1280×800. In the form they get told what is missing, send it, and see
the confirmation. If the security check or the intake service fails, they keep what they wrote
and get a working email route.

**Reach it.** `/contact/` (header, footer and every call to action). An offer's button, and
every "Book an Audit" button, opens `/contact/?service=<id>`: the form arrives with that service
picked and named above the first field.

**Proved by** (the intake endpoint and Turnstile are stubbed in every run, production included):

- `visitor finds the prices and reaches us through the contact form`: validation, focus on the
  first missing field, keyboard order through the three required fields, the exact posted body
  and the confirmation.
- `an offer's button carries that service into the enquiry, and the visitor can change it`:
  Services → Contact with the Sprint picked, Change opening the optional details and focusing
  the choice, the address following the pick, and the closed details still reaching the endpoint.
  An unknown `?service=` picks nothing.
- `with reduced motion, the form jumps straight to its error and its confirmation`.
- `the direct contact links and required form fields fit on the first screen`: correct email and
  phone destinations, keyboard order into the form, and usable navigation at 200% text.
- `the security check takes space only after it mounts and fits a narrow screen`: the check
  leaves no empty row before it loads, and the standard widget fits at 320px and 200% text.
- `reading the contact page never starts the security check, but using the form does`: the
  check's frame on `check.automancer.uk` loads on first use, Cloudflare's script loads only in it,
  and it draws in a typing pause.
- `the contact page never runs Cloudflare's script, and its check frame cannot touch the form`
  (`security.spec.ts`, t27305): the frame cannot read a field or navigate the page, and a token
  posted by anything but the frame is ignored.
- `a slow security script offers email without losing the draft or preventing a later send`.
- `a refused or failed send keeps the enquiry and never shows an error code` and
  `a blocked security check offers a draft even when the clipboard is denied`.
- `with JavaScript off` › `offers email where the contact form would have been`.
- Vitest: `tests/contact-errors.test.ts` (no raw API code reaches the page) and
  `tests/enquiry-contract.test.ts` (the form matches `/api/enquiry.json`).

**End state.** One well-formed enquiry is posted, or none with the visitor's words kept.

**Gotchas.** Never submit to the real `ENDPOINT_URL` (`src/config/site.ts`): stub it as
`stubIntake()` in `tests/journey/visitor.spec.ts` does.
The security check frame is served by the edge Worker, not the build: a local run answers
`check.automancer.uk` from `ops/edge/worker.js` with the local copy as its parent
(`serveCheckFrame()` in `tests/journey/check-frame.ts`); give every new contact test its
`test.beforeEach`. Cloudflare's script is stubbed inside the frame (`TURNSTILE_STUB`).
