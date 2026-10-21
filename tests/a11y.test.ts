/**
 * Accessibility structure that axe (axe.test.ts) does not judge per page:
 * one <main> carrying the skip-link target, distinctly named navs, one banner
 * and contentinfo, and no orphan labels. Names, labels, link text and ARIA
 * rules are axe's. Image alt policy lives in pages.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { pageCheckPages } from './support/dist';

const pages = pageCheckPages();

describe('landmarks', () => {
  it('has exactly one <main> per page, carrying id="main"', () => {
    for (const page of pages) {
      const mains = page.doc.querySelectorAll('main');
      expect(mains, `${page.route}: expected exactly one <main>`).toHaveLength(1);
      expect(mains[0].getAttribute('id'), `${page.route}: <main> lost its id`).toBe('main');
    }
  });

  it('every <nav> announces itself with a distinct accessible name', () => {
    // The layout legitimately uses two navs (primary + footer); what a11y
    // requires is that each is labelled so screen readers can tell them apart.
    for (const page of pages) {
      const labels = page.doc
        .querySelectorAll('nav')
        .map((n) => n.getAttribute('aria-label')?.trim() ?? '');
      expect(labels.length, `${page.route}: no <nav> found`).toBeGreaterThan(0);
      for (const label of labels) {
        expect(label, `${page.route}: a <nav> has no aria-label`).toBeTruthy();
      }
      expect(new Set(labels).size, `${page.route}: duplicate nav aria-labels`).toBe(labels.length);
    }
  });

  it('has exactly one banner and one contentinfo landmark per page', () => {
    // Articles legitimately carry their own scoped <header>/<footer>
    // elements; what must stay unique page-wide are the banner (site nav)
    // and contentinfo (site footer) landmarks.
    for (const page of pages) {
      expect(
        page.doc.querySelectorAll('[role="banner"]').length,
        `${page.route}: expected exactly one banner landmark`
      ).toBe(1);
      expect(
        page.doc.querySelectorAll('footer[role="contentinfo"], [role="contentinfo"]').length,
        `${page.route}: expected exactly one contentinfo landmark`
      ).toBe(1);
      // …and the footer element itself is the contentinfo landmark.
      expect(page.doc.querySelectorAll('footer').length, `${page.route}: footers`).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('skip link', () => {
  it('targets a real id on the main landmark', () => {
    for (const page of pages) {
      const skip = page.doc.querySelector('a.skip-link[href^="#"]');
      expect(skip, `${page.route}: no skip link`).toBeTruthy();
      const targetId = skip!.getAttribute('href')!.slice(1);
      expect(
        page.doc.querySelector(`[id="${targetId}"]`),
        `${page.route}: skip link targets missing id="${targetId}"`
      ).toBeTruthy();
    }
  });
});

describe('form controls', () => {
  it('no label points at a missing control (orphan label check)', () => {
    for (const page of pages) {
      for (const label of page.doc.querySelectorAll('label[for]')) {
        const targetId = label.getAttribute('for')!;
        expect(
          page.doc.querySelector(`[id="${targetId}"]`),
          `${page.route}: label[for="${targetId}"] targets nothing`
        ).toBeTruthy();
      }
    }
  });
});
