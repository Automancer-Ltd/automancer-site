/* ═══════════════════════════════════════════
   AUTOMANCER — main.js
   Scroll reveals · nav scroll state · mobile menu
   · orb cursor-parallax · card spotlight · hero typed line
   Minimal, dependency-free, reduced-motion aware.
   ═══════════════════════════════════════════ */
(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.addEventListener('DOMContentLoaded', function () {
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

    /* ── Mobile menu ── */
    var hamburger = document.querySelector('.hamburger');
    var menu = document.querySelector('.mobile-menu');
    var closeBtn = document.querySelector('.mobile-menu__close');
    if (hamburger && menu) {
      var setOpen = function (open) {
        var wasOpen = menu.classList.contains('is-open');
        menu.classList.toggle('is-open', open);
        if (open) menu.showModal();
        else menu.close();
        hamburger.setAttribute('aria-expanded', String(open));
        hamburger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
        document.body.style.overflow = open ? 'hidden' : '';
        // Keyboard users land where they left: in the menu, then back on its button.
        // The open state's visibility does not transition (global.css), so the
        // close button is focusable as soon as the class lands.
        if (open && closeBtn) closeBtn.focus();
        else if (wasOpen && !open && hamburger.offsetParent) hamburger.focus();
      };
      // The menu only exists below 821px; rotating a tablet past it with the
      // menu open left the page unscrollable and the menu unclosable.
      var wide = window.matchMedia('(min-width: 821px)');
      var onWide = function () { if (wide.matches) setOpen(false); };
      if (wide.addEventListener) wide.addEventListener('change', onWide);
      hamburger.addEventListener('click', function () {
        setOpen(!menu.classList.contains('is-open'));
      });
      if (closeBtn) closeBtn.addEventListener('click', function () { setOpen(false); });
      menu.querySelectorAll('a').forEach(function (a) {
        a.addEventListener('click', function () { setOpen(false); });
      });
      menu.addEventListener('cancel', function (e) {
        e.preventDefault();
        setOpen(false);
      });
    }

    /* ── Hero typed line ──
       The span renders the full line by default (works with no JS / reduced
       motion). When motion is allowed we clear it and type it back in. */
    var typedEl = document.querySelector('[data-typed]');
    if (typedEl && !reduce) {
      var full = typedEl.textContent || '';
      typedEl.textContent = '';
      var i = 0;
      setTimeout(function () {
        var timer = setInterval(function () {
          i += 1;
          typedEl.textContent = full.slice(0, i);
          if (i >= full.length) clearInterval(timer);
        }, 38);
      }, 1400);
    }

    if (reduce) return;

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
  });
})();
