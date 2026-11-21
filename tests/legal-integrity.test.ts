/**
 * The published "last updated" date on /privacy and /terms is a CLAIM ABOUT
 * CONTENT THAT CAN CHANGE UNDERNEATH IT.
 *
 * The date lives in src/data/site-content.ts; the prose lives in the page. They
 * can be edited independently, so someone can revise the privacy notice and
 * leave the date untouched — and the site then publishes a false statement
 * about when its privacy notice last changed. To a visitor, and potentially to
 * a regulator.
 *
 * This does NOT try to derive the date automatically. It should record when the
 * SUBSTANCE changed, which is a human judgement — a typo fix is not a revision.
 * Instead it pins the current wording so a change to it cannot pass silently:
 * edit the prose and this test fails, telling you to decide whether the date
 * should move.
 *
 * It hashes the rendered TEXT, not the markup or the source file, so a design
 * change or a refactor (both happened on 2026-08-22) does not trip it. Only the
 * words a reader actually sees.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { allHtmlFiles } from './support/dist';

/** Text of the legal pages as published, hashed 2026-08-23. */
const PINNED: Record<string, { sha256: string; lastUpdated: string | null }> = {
  // Moved 2026-08-23 for a SUBSTANTIVE change (AUT-6414, adversarial review
  // AUT-6705 finding 2): the Sentry processor bullet claimed we "configured it
  // not to collect personal data" — an absolute claim sendDefaultPii:false does
  // not support, since error messages/URLs can still carry incidental personal
  // data. Reworded to match the narrower, accurate framing already used in the
  // "when you just browse" section above it.
  //
  // Re-pinned later the SAME DAY (AUT-6472, item 4) for a second substantive
  // change: the Turnstile paragraph said it "may set a strictly-necessary
  // cookie". Measured, it sets no cookie — it writes cf.turnstile.u to
  // localStorage on challenges.cloudflare.com. The notice now names that exact
  // behaviour, scopes its no-storage claim around the contact-page exception,
  // and ties the PECR reliance to the requested contact-form service instead
  // of describing security as a blanket exception.
  // The date does NOT move: it already reads 23 August 2026, which is still
  // the day the substance changed.
  //
  // Moved 2026-11-21 for a SUBSTANTIVE change, approved by Waseem on decision
  // card t22413 ("Approve as written", 21 Nov 2026 13:45 UK): Cloudflare is named
  // as the site's delivery proxy in front of GitHub Pages and as a processor of
  // visitors' IP addresses and requests; the form section no longer says there
  // is "no third-party in the middle", since Cloudflare carries form submissions
  // to api.automancer.uk. The date moves to the day the words changed.
  '/privacy/': {
    sha256: 'fda168d99d5f0ab9609566babbad24e3fe645978c8e3817e19e8e13aeff64450',
    lastUpdated: '21 November 2026',
  },
  // Date derived 2026-08-30 for q-auto-acf7. `git log -1 --format=%cs --
  // src/pages/terms.astro` returns 2026-08-21, but that commit (d412e77) only
  // lengthened the meta description. The terms body has been unchanged since
  // 2026-07-03 (1f74245, the Astro rebuild that introduced this copy). The
  // published date is the substance date, matching how /privacy/ treats
  // lastUpdated — a meta-description tweak is not a revision of the terms.
  // Rendered as a visible "Last updated" line plus <time datetime="2026-07-03">.
  '/terms/': {
    sha256: 'b1c33750001a2ab65a94f61b5766c1e12909aebd7bcb730a32ff77d90a855118',
    lastUpdated: '3 July 2026',
  },
};

function legalText(html: string): string {
  const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? html;
  return main
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('legal page integrity', () => {
  for (const [route, pin] of Object.entries(PINNED)) {
    it(`${route} wording has not changed without its date changing`, () => {
      const page = allHtmlFiles().find((p) => p.route === route);
      expect(page, `${route} was not emitted — the legal page is missing`).toBeTruthy();

      const text = legalText(page!.html);
      expect(
        text.length,
        `${route} rendered no text — the hash below would be meaningless`
      ).toBeGreaterThan(500);

      const actual = createHash('sha256').update(text).digest('hex');
      expect(
        actual,
        `${route} WORDING HAS CHANGED but its published "Last updated" still reads ` +
          `"${pin.lastUpdated}".\n\n` +
          `Decide which is true, then do ONE of:\n` +
          `  - substantive change: update lastUpdated in src/data/site-content.ts, ` +
          `then set sha256 below to ${actual}\n` +
          `  - typo or formatting only: leave the date, set sha256 below to ${actual}\n\n` +
          `This is deliberately a human decision. A wrong date on a privacy notice ` +
          `is a false statement to a visitor and to a regulator.`
      ).toBe(pin.sha256);

      if (pin.lastUpdated === null) {
        // Characterising the gap: this page publishes no date today. If someone
        // adds one, this fails and they must record the decision above.
        expect(
          /Last updated:/i.test(page!.html),
          `${route} now publishes a "Last updated" date. Good — but record the ` +
            'decision in the comment above and give this entry its date, so the ' +
            'open question is closed rather than silently answered.'
        ).toBe(false);
      } else {
        expect(
          page!.html,
          `${route} no longer displays its "Last updated" date at all`
        ).toContain(pin.lastUpdated);
      }
    });
  }
});
