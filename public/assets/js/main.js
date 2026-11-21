/* ═══════════════════════════════════════════
   AUTOMANCER — main.js
   Scroll reveals · nav scroll state · mobile menu
   · print · orb cursor-parallax · card spotlight
   Minimal, dependency-free, reduced-motion aware.
   ═══════════════════════════════════════════ */
(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* A prerendered page (BaseLayout.astro) starts when it is opened. */
  document.addEventListener('DOMContentLoaded', function () {
    if (document.prerendering) document.addEventListener('prerenderingchange', init, { once: true });
    else init();
  });

  function init() {
    /* ── Scroll reveal ── */
    var revealEls = document.querySelectorAll('.reveal, .reveal-stagger');
    if (revealEls.length) {
      if (reduce || !('IntersectionObserver' in window)) {
        revealEls.forEach(function (el) { el.classList.add('is-visible'); });
      } else {
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add('is-visible');
              io.unobserve(entry.target);
            }
          });
        }, { threshold: 0.1, rootMargin: '0px 0px -8% 0px' });
        revealEls.forEach(function (el) { io.observe(el); });
      }
    }

    /* ── Nav scroll state ── */
    var nav = document.querySelector('.nav');
    if (nav) {
      var onScroll = function () {
        nav.classList.toggle('nav--scrolled', window.scrollY > 60);
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }

    /* ── Mobile menu: native toggle with keyboard and outside dismissal ── */
    var disclosure = document.querySelector('.nav__disclosure');
    if (disclosure) {
      function dismissOutside(event) {
        if (disclosure.open && !disclosure.contains(event.target)) disclosure.open = false;
      }
      document.addEventListener('click', dismissOutside);
      document.addEventListener('focusin', dismissOutside);
      document.addEventListener('keydown', function (event) {
        if (event.key !== 'Escape' || !disclosure.open) return;
        disclosure.open = false;
        disclosure.querySelector('summary').focus();
      });
      window.matchMedia('(width <= 820px)').addEventListener('change', function () {
        disclosure.open = false;
      });
      window.addEventListener('pageshow', function (event) {
        if (event.persisted) disclosure.open = false;
      });
    }

    /* ── Article contents: mark the part (section or sub-section) above the top
       quarter of the screen. The headings are the ones the contents link to. ── */
    var toc = document.querySelectorAll('[data-toc] a'), heads = [];
    toc.forEach(function (a) {
      var h = document.getElementById(decodeURIComponent(a.hash.slice(1)));
      if (h && heads.indexOf(h) < 0) heads.push(h);
    });
    if (toc.length) {
      var tocId, tocQueued;
      var markToc = function () {
        tocQueued = false;
        var id = null;
        heads.forEach(function (h) { if (h.getBoundingClientRect().top <= innerHeight / 4) id = h.id; });
        if (id === tocId) return;
        tocId = id;
        toc.forEach(function (a) {
          if (decodeURIComponent(a.hash.slice(1)) === id) a.setAttribute('aria-current', 'location');
          else a.removeAttribute('aria-current');
        });
      };
      addEventListener('scroll', function () { if (!tocQueued) { tocQueued = true; requestAnimationFrame(markToc); } }, { passive: true });
      markToc();
    }

    /* ── Print: the FAQ answers go on paper with their questions, then close
       again (src/styles/print.css draws the rest of the printed page). ── */
    var printOpened = [];
    addEventListener('beforeprint', function () {
      document.querySelectorAll('.faq details:not([open])').forEach(function (d) { d.open = true; printOpened.push(d); });
    });
    addEventListener('afterprint', function () {
      printOpened.forEach(function (d) { d.open = false; });
      printOpened = [];
    });

    if (reduce) return;

    /* Keep offscreen effects from repainting while the visitor reads. */
    if ('IntersectionObserver' in window) {
      var motion = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          entry.target.classList.toggle('motion-paused', !entry.isIntersecting);
        });
      });
      document.querySelectorAll('.hero, .page-hero, .proof-strip, .spectral-text, .rule--spectral, .offer__price, .cta, .notfound')
        .forEach(function (el) { motion.observe(el); });
    }

    /* ── Orb cursor-parallax ──
       [data-px] elements drift gently toward the cursor. data-px is the depth
       factor (px of travel per half-viewport of pointer movement). rAF-throttled. */
    var pxEls = Array.prototype.slice.call(document.querySelectorAll('[data-px]'));
    if (pxEls.length && window.matchMedia('(pointer: fine)').matches) {
      var mx = 0, my = 0, raf = null;
      var applyPx = function () {
        raf = null;
        pxEls.forEach(function (el) {
          var d = parseFloat(el.getAttribute('data-px')) || 20;
          el.style.translate = (mx * d) + 'px ' + (my * d) + 'px';
        });
      };
      window.addEventListener('mousemove', function (e) {
        mx = (e.clientX / window.innerWidth) - 0.5;
        my = (e.clientY / window.innerHeight) - 0.5;
        if (!raf) raf = requestAnimationFrame(applyPx);
      }, { passive: true });
    }

    /* ── Card spotlight ──
       [data-spot] gets --mx/--my custom props under the pointer, feeding a
       soft radial-gradient in CSS. */
    document.querySelectorAll('[data-spot]').forEach(function (el) {
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        el.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%');
        el.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100) + '%');
      });
    });
  }
})();
