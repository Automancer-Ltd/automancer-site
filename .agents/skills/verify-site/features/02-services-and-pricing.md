# 02 Services and published prices

**The journey.** A visitor compares the four offers' starting prices at the top of `/services/`,
jumps to one, reads what is included and goes on to `/contact/`.

**Reach it.** The four prices below the homepage hero link straight to `/services/#offer-1`
through `/services/#offer-4`. Compare all services and the header link open the full overview.

**Proved by:**

- `visitor can compare starting prices immediately and jump to each offer`.
- `homepage prices are one scroll away and link to the matching offer`.
- `visitor finds the prices and reaches us through the contact form`: every published from-price
  from `src/data/business.ts` is visible on the page.
- `enlarged text keeps the headline, service names and prices inside their panels`.
- `a printed price list carries every offer, its price, what is included and the answers (t23850)`:
  print and Save as PDF (`src/styles/print.css`) show every offer in black ink with the FAQ open.
- Vitest: `tests/agent-readiness.test.ts` holds the page, its JSON-LD, `/api/services.json`, the
  twins and `llms.txt` to the same names, prices and included lists.

**End state.** Each offer shows the price `business.ts` publishes, and the HTML and machine
surfaces agree.

**Gotchas.** Prices change only in `src/data/business.ts`; a test fails on any other from-price
in the output.
