# 01 Home, navigation and the 404 page

**The journey.** A visitor lands on `/`, reads the headline and the price ladder, and moves to
another page through the header (the menu dialog on a phone). A visitor who follows a dead link
gets a real 404 with a way back.

**Reach it.** `/`, the header on every page, the menu button (`button[aria-controls="mobile-menu"]`)
below the laptop width, any unknown path (served `/404.html`).

**Proved by** (`pnpm exec playwright test -g "<name>"`, phone and laptop):

- `visitor finds the prices and reaches us through the contact form`: home paints, and the header
  or the menu reaches `/services/`.
- `the phone menu keeps keyboard focus inside it and hands it back on Close or Escape`.
- `home actions are visible from the first frame and the headline holds its height while Syne loads`.
- `the price ladder counts its rungs 01 to 04 in order`.
- `a page that does not exist is a real 404 with a way back`.
- `every page keeps its words on screen at 320px and with text at 200%` (every sitemap page).
- Vitest on `dist/`: `tests/pages.test.ts` (one `h1`, title, description, canonical, JSON-LD) and
  `tests/a11y.test.ts` (landmarks, skip link, named navs) on every page and the 404.

**End state.** Home shows its headline and actions on the first frame, the menu traps focus while
open and returns it to the button, and no page scrolls sideways.

**Gotchas.** While the menu is open the page behind it is inert, so the menu button has no
accessible role then: find it by `aria-controls`. The proof strip shows the build's time and
commit, which differ in every build.
