/**
 * The document title every page carries in <title>, og:title and twitter:title.
 *
 * A page's title is its whole headline, never a cut-off one. Until t27598 the
 * field notes and case studies were clipped at a word to stay under 60
 * characters, so search results, browser tabs, bookmarks and link previews
 * read "AI hype vs AI that ships: how to tell before | Automancer" and lost the
 * very words a searcher typed ("in 2026?", "price breakdown"). Google sets no
 * limit on a <title> and shortens the title link itself, with an ellipsis, to
 * fit the screen (developers.google.com/search/docs/appearance/title-link), so
 * the site gives it the whole headline and lets the reader's screen decide.
 *
 * The brand goes at the end only while headline and brand together fit in
 * 60 characters, about what a result line shows: a longer headline keeps that
 * room for its own words, and the result already names the site above it.
 */

export const BRAND = 'Automancer';
const TITLE_SUFFIX = ` | ${BRAND}`;
/** Headline plus brand up to this length keeps the brand; beyond it, the headline alone. */
export const BRANDED_TITLE_MAX = 60;

export function documentTitle(headline: string): string {
  const branded = headline + TITLE_SUFFIX;
  return branded.length <= BRANDED_TITLE_MAX ? branded : headline;
}
