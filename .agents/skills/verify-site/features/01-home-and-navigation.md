# 01 Home, navigation and the 404 page

**The journey.** A visitor lands on `/`, reads the headline and the price ladder, and moves to
another page through the header, with Contact one tap away on a phone. A visitor who follows a dead link
gets a real 404 with a way back.

**Reach it.** `/`, the header on every page, Menu below the laptop width, and any unknown path
(served `/404.html`).

**Proved by** (`pnpm exec playwright test -g "<name>"`, phone and laptop):

- `visitor finds the prices and reaches us through the contact form`: home paints, and the header
  or the menu reaches `/services/`.
- `the phone menu follows keyboard focus and dismisses without covering the whole page`.
- `the phone header still reaches Services and Contact at 320px with enlarged text` with JavaScript disabled.
- `home actions are visible from the first frame and the headline holds its height while Syne loads`.
- `homepage prices are one scroll away and link to the matching offer`.
- `a missing page shows recovery links on arrival and leads back to the site`.
- `every page keeps its words on screen at 320px and with text at 200%` (every sitemap page and the 404).
- Vitest on `dist/`: `tests/speculation-rules.test.ts` (Chromium's hover prerender, and the
  Firefox/Safari hover and touch-screen prefetch in `src/scripts/prefetch.ts`, fetch only this
  site's pages, the same links). Click speed in Firefox and WebKit: `node ops/perf/click-wait.mjs
  dist <label> --engine=firefox --persistent` (or a URL for production); a phone's taps with
  `--phone` (and `--rules-off` for WebKit as Safari 27 ships it); see `docs/PERFORMANCE.md`.
- Vitest on `dist/`: `tests/pages.test.ts` (one `h1`, title, description, canonical, JSON-LD) and
  `tests/a11y.test.ts` (landmarks, skip link, named navs) on every page and the 404.

**End state.** Home shows its headline and actions on the first frame, the phone menu highlights
the current section, Escape returns focus to Menu, and no page scrolls sideways.

**Gotchas.** The proof strip shows the build's time and commit, which differ in every build.
