# Feature 01: Home Page, Navigation, Mobile Drawer, and 404

## Scope
Covers the homepage (`/`), proof strip, 4-rung service ladder preview, primary desktop navigation, mobile hamburger menu drawer (`390x844`), skip-to-main accessibility link, and custom `/404` page.

## Preconditions
- Production build emitted in `dist/` and served via `astro preview` on `http://127.0.0.1:$PORT`.

## Desktop Steps (`1280x800`)
1. Open `/` at `1280x800`.
2. Assert `<title>` ends with `| Automancer`, `<link rel="canonical" href="https://automancer.uk/">` exists, and exactly one `<h1>` is rendered.
3. Assert `.proof-strip` is present and displays the 7-character git revision SHA (`build.shortSha`).
4. Assert `.rung` count is `4`, matching all 4 services in `src/data/business.ts` (`£450`, `£1,200`, `£3,500`, `£450`).
5. Assert desktop `.nav__links` contains links to `/services`, `/work`, `/field-notes`, `/about`, and `/contact`.
6. Open `/404` and assert `<h1>` contains `404` and recovery links resolve.

## Mobile Steps (`390x844`)
1. Set viewport to `390x844` on `/`.
2. Assert `document.documentElement.scrollWidth <= window.innerWidth` (no horizontal scroll overflow).
3. Click `.hamburger`; assert `.mobile-menu` gains class `is-open` and `.hamburger` has `aria-expanded="true"`.
4. Click `.mobile-menu__close` (or press `Escape`); assert `.mobile-menu` loses `is-open` and `.hamburger` has `aria-expanded="false"`.

## Evidence
- `desktop-home.png`, `mobile-home.png`, `mobile-menu-open.png`, `desktop-404.png`.
