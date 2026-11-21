/**
 * Page-to-page clicks in Firefox and Safari (t23288; docs/PERFORMANCE.md).
 *
 * Chromium browsers fetch a page when the pointer reaches a link to it, and render it after a
 * short hover, because BaseLayout.astro publishes Speculation Rules. Firefox and Safari ignore
 * those rules, so every click there waited a whole round trip for the next page's HTML. In a
 * browser without them, this fetches the page's HTML into the browser's own HTTP cache when the
 * pointer rests on a link for 65 ms (a pointer sweeping across the nav fetches nothing); the click
 * then finds it there (pages may be kept ten minutes). A visitor hovers a link for a few hundred
 * milliseconds before clicking, which is longer than the fetch takes.
 *
 * Nothing is fetched on a press or a tap. A tap lasts about 90 ms, shorter than the page takes to
 * arrive, and neither Firefox nor WebKit hands a fetch still under way to the click's own request:
 * measured, the click asked again and the page came down twice (ops/perf/click-wait.mjs).
 *
 * It fetches exactly what the Speculation Rules prefetch: this site's own pages, never a file
 * (anything with a dot in its path), never a link marked download, target=_blank or nofollow,
 * and never the page already open; each page once per page view, and nothing at all when the
 * visitor has asked their browser to save data. tests/speculation-rules.test.ts holds the two to
 * the same links. The request carries the navigation's own Accept header: the edge Worker sends
 * `Vary: Accept` (a Markdown twin answers the same URL), so a copy fetched with fetch()'s default
 * `*\/*` would never be reused by the click.
 */
const NAVIGATION_ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
const HOVER_MS = 65;

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
  // Not HTMLScriptElement.supports('speculationrules'): Safari's WebKit (27.2) answers true yet
  // fetched nothing on a hover or a press of these rules' links when measured.
  if ('prerendering' in document) return;
  if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return;
  const fetched = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: string | null = null;

  const target = (event: Event) => {
    const a = (event.target as Element | null)?.closest?.('a[href]');
    if (!(a instanceof HTMLAnchorElement)) return null;
    return prefetchUrl(new URL(a.href), new URL(location.href), {
      download: a.hasAttribute('download'),
      blank: a.target === '_blank',
      nofollow: a.relList.contains('nofollow'),
    });
  };
  const get = (url: string | null) => {
    if (!url || fetched.has(url)) return;
    fetched.add(url);
    fetch(url, { headers: { Accept: NAVIGATION_ACCEPT }, credentials: 'same-origin' })
      .then((res) => res.arrayBuffer())
      .catch(() => fetched.delete(url));
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
}

if (typeof document !== 'undefined') wire();
