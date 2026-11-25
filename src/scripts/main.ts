/**
 * What every page does once it is read: scroll reveals, the nav's scrolled state, the phone menu's
 * dismissal, the article contents' marker, the FAQ answers on paper, and the decorative motion
 * (offscreen pause, the hero glow's cursor parallax, the card spotlight). Reduced-motion aware.
 *
 * It ships in BaseLayout's page-load module with the Sentry bootstrap and the prefetch (t26489),
 * so production loads it as one content-hashed /_astro/ file with them: no request of its own, and
 * a release that leaves the scripts alone leaves a returning visitor's copy valid. Until then it was
 * public/assets/js/main.js, unminified and outside lint and the type checker, fetched separately
 * and named by the commit, so every release made returning visitors download it again.
 *
 * Content never waits for it (t25989): CSS shows every reveal, and this only hides what is still
 * below the fold so it can fade in on scroll.
 */
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The element Escape hands focus back to: a disclosure's own summary. */
function closeAndFocus(details: HTMLDetailsElement): void {
  details.open = false;
  details.querySelector('summary')?.focus();
}

function revealOnScroll(): void {
  const els = document.querySelectorAll<HTMLElement>('.reveal, .reveal-stagger');
  if (!els.length) return;
  if (reduce || !('IntersectionObserver' in window)) {
    for (const el of els) el.classList.add('is-visible');
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    },
    { threshold: 0.1, rootMargin: '0px 0px -8% 0px' },
  );
  const fold = innerHeight;
  for (const el of els) {
    const box = el.getBoundingClientRect();
    if (box.top < fold && box.bottom > 0) el.classList.add('is-visible');
    else io.observe(el);
  }
  document.documentElement.classList.add('reveal-armed');
}

function navScrollState(nav: HTMLElement): void {
  const onScroll = () => nav.classList.toggle('nav--scrolled', scrollY > 60);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/** The phone menu: a native disclosure, closed by a click or focus outside it, or Escape. */
function phoneMenu(menu: HTMLDetailsElement): void {
  const dismissOutside = (event: Event) => {
    if (menu.open && !menu.contains(event.target as Node)) menu.open = false;
  };
  document.addEventListener('click', dismissOutside);
  document.addEventListener('focusin', dismissOutside);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menu.open) closeAndFocus(menu);
  });
  matchMedia('(width <= 820px)').addEventListener('change', () => (menu.open = false));
  addEventListener('pageshow', (event) => {
    if (event.persisted) menu.open = false;
  });
}

const hashId = (a: HTMLAnchorElement) => decodeURIComponent(a.hash.slice(1));

/**
 * Article contents: mark the part (section or sub-section) above the top quarter of the screen.
 * The headings are the ones the contents link to. On phones the contents bar names the part being
 * read and its section's place, "4/7".
 */
function articleContents(nav: HTMLElement | null): void {
  const links = document.querySelectorAll<HTMLAnchorElement>('[data-toc] a');
  if (!links.length) return;
  const heads: HTMLElement[] = [];
  for (const a of links) {
    const h = document.getElementById(hashId(a));
    if (h && !heads.includes(h)) heads.push(h);
  }
  const bar = document.querySelector<HTMLDetailsElement>('details.toc--inline');
  const parts = bar ? [...bar.querySelectorAll(':scope > ol > li')] : [];
  let current: string | null | undefined;
  let queued = false;

  const mark = () => {
    queued = false;
    let id: string | null = null;
    for (const h of heads) if (h.getBoundingClientRect().top <= innerHeight / 4) id = h.id;
    if (id === current) return;
    current = id;
    for (const a of links) {
      if (hashId(a) === id) a.setAttribute('aria-current', 'location');
      else a.removeAttribute('aria-current');
    }
    if (!bar) return;
    const a = bar.querySelector('a[aria-current]');
    const at = a ? parts.findIndex((li) => li.contains(a)) : -1;
    bar.toggleAttribute('data-at', at >= 0);
    bar.querySelector('[data-toc-now]')!.textContent = at < 0 ? '' : a!.textContent;
    bar.querySelector('[data-toc-step]')!.textContent = at < 0 ? '' : `${at + 1}/${parts.length}`;
  };

  if (bar) {
    // Its list opens over the text: a jump, a tap or focus elsewhere, or Escape closes it.
    const shut = (event: Event) => {
      const t = event.target as Element;
      if (bar.open && (!bar.contains(t) || (event.type === 'click' && t.closest('a')))) bar.open = false;
    };
    document.addEventListener('click', shut);
    document.addEventListener('focusin', shut);
    addEventListener('pageshow', () => (bar.open = false));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && bar.open) closeAndFocus(bar);
    });
    // It sits right under the fixed nav, whatever height the nav has.
    if (nav && 'ResizeObserver' in window) {
      new ResizeObserver(() => {
        document.documentElement.style.setProperty('--nav-h', `${nav.offsetHeight}px`);
      }).observe(nav);
    }
  }
  addEventListener(
    'scroll',
    () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(mark);
    },
    { passive: true },
  );
  mark();
}

/** The FAQ answers go on paper with their questions, then close again (src/styles/print.css). */
function printFaqAnswers(): void {
  let opened: HTMLDetailsElement[] = [];
  addEventListener('beforeprint', () => {
    for (const d of document.querySelectorAll<HTMLDetailsElement>('.faq details:not([open])')) {
      d.open = true;
      opened.push(d);
    }
  });
  addEventListener('afterprint', () => {
    for (const d of opened) d.open = false;
    opened = [];
  });
}

/** Keep offscreen effects from repainting while the visitor reads. */
function pauseOffscreenMotion(): void {
  if (!('IntersectionObserver' in window)) return;
  const motion = new IntersectionObserver((entries) => {
    for (const entry of entries) entry.target.classList.toggle('motion-paused', !entry.isIntersecting);
  });
  const effects = '.hero, .page-hero, .proof-strip, .spectral-text, .rule--spectral, .offer__price, .cta, .notfound';
  for (const el of document.querySelectorAll(effects)) motion.observe(el);
}

/**
 * [data-px] elements drift gently toward the cursor. data-px is the depth factor (px of travel per
 * half-viewport of pointer movement). One update per frame.
 */
function cursorParallax(): void {
  const els = [...document.querySelectorAll<HTMLElement>('[data-px]')];
  if (!els.length || !matchMedia('(pointer: fine)').matches) return;
  let mx = 0;
  let my = 0;
  let frame = 0;
  const apply = () => {
    frame = 0;
    for (const el of els) {
      const depth = parseFloat(el.dataset.px ?? '') || 20;
      el.style.translate = `${mx * depth}px ${my * depth}px`;
    }
  };
  addEventListener(
    'mousemove',
    (e) => {
      mx = e.clientX / innerWidth - 0.5;
      my = e.clientY / innerHeight - 0.5;
      if (!frame) frame = requestAnimationFrame(apply);
    },
    { passive: true },
  );
}

/** [data-spot] gets --mx/--my under the pointer, feeding a soft radial gradient in CSS. */
function cardSpotlight(): void {
  for (const el of document.querySelectorAll<HTMLElement>('[data-spot]')) {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
      el.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
    });
  }
}

function init(): void {
  revealOnScroll();
  const nav = document.querySelector<HTMLElement>('.nav');
  if (nav) navScrollState(nav);
  const menu = document.querySelector<HTMLDetailsElement>('.nav__disclosure');
  if (menu) phoneMenu(menu);
  articleContents(nav);
  printFaqAnswers();
  if (reduce) return;
  pauseOffscreenMotion();
  cursorParallax();
  cardSpotlight();
}

/** A prerendered page (BaseLayout.astro's Speculation Rules) starts when it is opened. */
function start(): void {
  if ((document as Document & { prerendering?: boolean }).prerendering) {
    document.addEventListener('prerenderingchange', init, { once: true });
  } else {
    init();
  }
}

// A module runs once the page is parsed; waiting for DOMContentLoaded keeps that true if it
// is ever loaded some other way.
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
