/**
 * Page-to-page clicks and taps in Firefox and Safari (t23288, t24026; docs/PERFORMANCE.md).
 *
 * Chromium browsers fetch a page when the pointer reaches a link to it, and render it after a
 * short hover, because BaseLayout.astro publishes Speculation Rules (on a phone, Chrome reads the
 * links on screen). Firefox and Safari ignore those rules, so every click or tap there waited a
 * whole round trip for the next page's HTML. In a browser without them, this fetches a page's
 * HTML into the browser's own HTTP cache ahead of the click, which then finds it there (pages may
 * be kept ten minutes):
 *
 *   - with a mouse, when the pointer rests on a link for 65 ms (a pointer sweeping across the nav
 *     fetches nothing). A visitor hovers a link for a few hundred milliseconds before clicking,
 *     which is longer than the fetch takes.
 *   - on a touch screen, which has no hover, when a link has stayed on screen for half a second:
 *     the visitor has stopped scrolling to read it. The site footer's links are left out, and a
 *     page view fetches at most TOUCH_BUDGET pages this way, so a phone pays for a few pages of
 *     HTML it may not open, never for every link it scrolls past.
 *
 * Nothing is fetched on a press or a tap itself. A tap lasts about 90 ms, shorter than the page
 * takes to arrive, and neither Firefox nor WebKit hands a fetch still under way to the click's own
 * request: measured, the click asked again and the page came down twice (ops/perf/click-wait.mjs).
 *
 * It fetches exactly what the Speculation Rules prefetch: this site's own pages, never a file
 * (anything with a dot in its path), never a link marked download, target=_blank or nofollow,
 * and never the page already open; each page once per page view, and nothing at all when the
 * visitor has asked their browser to save data. tests/speculation-rules.test.ts holds the two to
 * the same links.
 *
 * The request carries the Accept header of the request the click will make: the edge Worker sends
 * `Vary: Accept` (a Markdown twin answers the same URL), so a copy fetched with any other Accept
 * is never reused. That is a navigation's own Accept, except in a WebKit that acts on Speculation
 * Rules (on in WebKit's own builds, off in Safari 27): over HTTPS it answers a press on a link with
 * its own prefetch, sent with `Accept: *\/*`, and the click uses that prefetch, which reuses only a
 * copy fetched with the same Accept (measured live, t24026). HTMLScriptElement.supports() says
 * true for 'speculationrules' only where WebKit acts on them; Chromium stops below before asking.
 */
const NAVIGATION_ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
const HOVER_MS = 65;
const DWELL_MS = 500;
const TOUCH_BUDGET = 5;

export interface LinkFlags {
  download: boolean;
  blank: boolean;
  nofollow: boolean;
}

/** The URL to fetch ahead of a click on a link to `url` from the page at `here`, or null. */
export function prefetchUrl(url: URL, here: URL, flags: LinkFlags): string | null {
  if (url.origin !== here.origin || flags.download || flags.blank || flags.nofollow) return null;
  if (url.pathname.includes('.')) return null;
  if (url.pathname === here.pathname && url.search === here.search) return null;
  return url.origin + url.pathname + url.search;
}

function wire() {
  // Chromium acts on the Speculation Rules (it alone prerenders, hence document.prerendering).
  if ('prerendering' in document) return;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return;
  const accept = HTMLScriptElement.supports?.('speculationrules') ? '*/*' : NAVIGATION_ACCEPT;
  const fetched = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: string | null = null;

  const urlOf = (a: Element | null | undefined) => {
    if (!(a instanceof HTMLAnchorElement)) return null;
    return prefetchUrl(new URL(a.href), new URL(location.href), {
      download: a.hasAttribute('download'),
      blank: a.target === '_blank',
      nofollow: a.relList.contains('nofollow'),
    });
  };
  const target = (event: Event) => urlOf((event.target as Element | null)?.closest?.('a[href]'));
  /** Fetch `url` into the HTTP cache; true when this started a request. */
  const get = (url: string | null) => {
    if (!url || fetched.has(url)) return false;
    fetched.add(url);
    fetch(url, { headers: { Accept: accept }, credentials: 'same-origin' })
      .then((res) => res.arrayBuffer())
      .catch(() => fetched.delete(url));
    return true;
  };

  // Pointer events, not mouse events: a tap fires mouseover too, just before its click.
  document.addEventListener('pointerover', (event) => {
    if (event.pointerType !== 'mouse') return;
    const url = target(event);
    if (!url || url === pending || fetched.has(url)) return;
    clearTimeout(timer);
    pending = url;
    timer = setTimeout(() => get(url), HOVER_MS);
  }, { passive: true });
  // A press before the 65 ms are up is the click itself: fetching now would fetch the page twice.
  document.addEventListener('pointerdown', () => {
    clearTimeout(timer);
    pending = null;
  }, { passive: true });
  document.addEventListener('pointerout', (event) => {
    const to = event.relatedTarget as Element | null;
    if (to && (event.target as Element).closest?.('a[href]')?.contains(to)) return;
    clearTimeout(timer);
    pending = null;
  }, { passive: true });

  if (matchMedia('(hover: none)').matches && typeof IntersectionObserver === 'function') watchScreen();

  // Touch screens: a link that stays on screen for DWELL_MS while the page is in front.
  function watchScreen() {
    let spent = 0;
    const dwell = new Map<Element, ReturnType<typeof setTimeout>>();
    const seen = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const a = e.target;
        const box = e.rootBounds;
        // A link that is not drawn (the desktop nav on a phone, a closed menu) has no size, and
        // Firefox reports such a box as wholly on screen.
        const drawn = e.boundingClientRect.width > 0 && e.boundingClientRect.height > 0;
        const onScreen = drawn && (e.intersectionRatio >= 0.5 || (box !== null && e.intersectionRect.height >= box.height / 2));
        if (!onScreen) {
          clearTimeout(dwell.get(a));
          dwell.delete(a);
          continue;
        }
        if (dwell.has(a)) continue;
        dwell.set(a, setTimeout(() => {
          dwell.delete(a);
          if (document.visibilityState !== 'visible') return;
          seen.unobserve(a);
          if (get(urlOf(a)) && ++spent >= TOUCH_BUDGET) {
            seen.disconnect();
            for (const t of dwell.values()) clearTimeout(t);
            dwell.clear();
          }
        }, DWELL_MS));
      }
    }, { threshold: [0, 0.5, 1] });
    for (const a of document.querySelectorAll('a[href]')) {
      if (a.closest('.footer') || !urlOf(a)) continue;
      seen.observe(a);
    }
  }
}

if (typeof document !== 'undefined') wire();
