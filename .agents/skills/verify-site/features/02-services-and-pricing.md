# Feature 02: Services Ladder and Published From-Prices

## Scope
Covers `/services/`, the 4-row overview table (`.overview-row`), the 4 anchored offer sections (`#offer-1`, `#offer-2`, `#offer-3`, `#offer-4`), GBP from-prices, and CTA links to `/contact/`.

## Preconditions
- Preview server running on `http://127.0.0.1:$PORT`.

## Steps (`1280x800` and `390x844`)
1. Open `/services/`.
2. Assert canonical link `https://automancer.uk/services/` in `<head>` and HTTP 200 on `/services.md`.
3. Assert 4 `.overview-row` elements, 4 anchored offer sections (`section#offer-1`, `section#offer-2`, `section#offer-3`, `section#offer-4`), and 4 `.offer` detail blocks exist.
4. Verify each offer's `.offer__name` and `.offer__amt` match `src/data/business.ts`:
   - `Automation Opportunity Audit` — `£450`
   - `Workflow Sprint` — `£1,950`
   - `System / Agent Build` — `£4,500`
   - `AI Ops Partner` — `£495` (`/month`)
5. Assert at `390x844` that `/services/` has no horizontal scroll overflow (`scrollWidth <= innerWidth`).

## Evidence
- `desktop-services.png`, `mobile-services.png`.
