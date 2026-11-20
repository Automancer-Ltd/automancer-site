/**
 * What each share card says, and where it is served: one place, so the card
 * (src/pages/og/), the page that names it (og:image, twitter:image) and its
 * alt text cannot disagree. Every word is one the page itself shows: a field
 * note's or case study's frontmatter, a page's own eyebrow and headline, and
 * facts read from the modules the page renders (prices from business.ts, the
 * response promise from enquiry.ts, dates from CHANGELOG.md and staticPages).
 * src/lib/og-card.ts draws it; tests/og-cards.test.ts holds each card's
 * headline to the page's h1 and its prices to the published ones.
 */
import type { CollectionEntry } from 'astro:content';
import type { CardInput, CardPrice } from '../lib/og-card';
import { formatGBP, services } from './business';
import { RESPONSE_PROMISE } from './enquiry';
import { getReleases } from './releases';
import { getNotes, getStudies, staticPages } from './site-content';
import { pagePath } from './urls';

export type CardCollection = 'field-notes' | 'work';

/** Root-relative URL of an entry's card. */
export const cardPath = (collection: CardCollection, id: string) => `/og/${collection}/${id}.png`;

// The date as the field note's own header prints it.
const longDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function fieldNoteCard(entry: CollectionEntry<'field-notes'>): CardInput {
  const d = entry.data;
  return { eyebrow: `Field note · ${d.category ?? d.sector}`, title: d.title, meta: `${longDate(d.date)} · ${d.author}` };
}

export function caseStudyCard(entry: CollectionEntry<'case-studies'>): CardInput {
  const d = entry.data;
  // The notes the case study's label carries, in its order.
  const notes = [d.anonymised && 'anonymised', d.status].filter((n): n is string => Boolean(n));
  return { eyebrow: `Case study · ${d.sector}`, title: d.headline ?? d.title, meta: capitalise(notes.join(' · ')) };
}

/** The four published from-prices, as /services/ prints them ("£495" and "/mo"). */
export const publishedPrices = (): CardPrice[] =>
  services.map((s) => ({ name: s.name, from: formatGBP(s.priceFrom), ...(s.priceUnit === 'month' ? { per: '/mo' } : {}) }));

/**
 * Alt text for a card: what it shows, in reading order. The headline comes
 * first after the label, so a reader of the alt hears the page's own words;
 * any prices follow, each with its service.
 */
export function cardAlt(c: CardInput): string {
  const alt = `${c.eyebrow}: ${c.title}`;
  if (!c.prices?.length) return alt;
  const list = c.prices.map((p) => `${p.name} from ${p.from}${p.per ?? ''}`).join(', ');
  return `${alt}${/[.!?]$/.test(c.title) ? '' : '.'} ${list}.`;
}

/** A hand-authored page's card: where it is served and what it says. */
export interface PageCard {
  /** The page it belongs to, e.g. "/services/". */
  path: string;
  /** Root-relative URL of the card, /og/pages/<name>.png. */
  image: string;
  name: string;
  card: CardInput;
}

const lastUpdated = (path: string) => {
  const date = staticPages.find((p) => p.path === path)?.lastUpdated;
  if (!date) throw new Error(`Share card: ${path} has no lastUpdated in staticPages.`);
  return `Last updated ${date}`;
};
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Every hand-authored page's card. Each eyebrow and title is the page's own
 * (the h1 is checked against the built page); "→" is left out of home's
 * eyebrow because the card fonts, like the page's, have no arrow glyph.
 */
export async function pageCards(): Promise<PageCard[]> {
  const [notes, studies, releases] = await Promise.all([getNotes(), getStudies(), getReleases()]);
  const latest = releases[0];
  const cards: Array<Omit<PageCard, 'image'>> = [
    {
      path: '/',
      name: 'home',
      card: {
        eyebrow: 'AI & automation consultancy',
        title: 'Your admin, automated into oblivion.',
        accent: 'oblivion',
        meta: 'We make small businesses run like magic.',
        prices: publishedPrices(),
      },
    },
    {
      path: '/services/',
      name: 'services',
      card: {
        eyebrow: 'Services & pricing',
        title: 'Four ways in. All of them start with a price you can actually see.',
        meta: '',
        prices: publishedPrices(),
      },
    },
    {
      path: '/work/',
      name: 'work',
      card: { eyebrow: 'Selected work', title: 'Real businesses. Real systems. Live in production.', meta: plural(studies.length, 'case study', 'case studies') },
    },
    {
      path: '/field-notes/',
      name: 'field-notes',
      card: {
        eyebrow: 'Field notes',
        title: 'Notes from the field, not the content calendar.',
        meta: `${plural(notes.length, 'note', 'notes')} · latest ${longDate(notes[0]!.data.date)}`,
      },
    },
    {
      path: '/about/',
      name: 'about',
      card: { eyebrow: 'About Automancer', title: 'An AI-run business, with a human at the helm.', meta: 'Waseem makes every decision and takes every call.' },
    },
    {
      path: '/contact/',
      name: 'contact',
      card: { eyebrow: 'Get in touch', title: "Tell us what's eating your week.", meta: RESPONSE_PROMISE },
    },
    {
      path: '/releases/',
      name: 'releases',
      card: {
        eyebrow: 'Release notes',
        title: 'What changed on this site, and when.',
        meta: latest ? `Latest: ${latest.version} · ${latest.displayDate}` : '',
      },
    },
    {
      path: '/developers/',
      name: 'developers',
      card: { eyebrow: 'For developers, agents & LLMs', title: 'Everything here is also data.', accent: 'data', meta: 'Public · read-only · no API key' },
    },
    { path: '/privacy/', name: 'privacy', card: { eyebrow: 'Legal', title: 'Privacy Policy', meta: lastUpdated('/privacy/') } },
    { path: '/terms/', name: 'terms', card: { eyebrow: 'Legal', title: 'Website Terms', meta: lastUpdated('/terms/') } },
  ];
  return cards.map((c) => ({ ...c, image: `/og/pages/${c.name}.png` }));
}

/** The card for a page path, or the home page's for any page without its own (the 404 page). */
export async function pageCardFor(path: string): Promise<PageCard> {
  const cards = await pageCards();
  return cards.find((c) => pagePath(c.path) === pagePath(path)) ?? cards[0]!;
}
