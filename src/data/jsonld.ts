/**
 * schema.org JSON-LD node builders — one @graph per page.
 *
 * Rules enforced here (docs/AGENT-READINESS.md, section D):
 *   - Every @id is an absolute URL derived from business.url / the page URL,
 *     so nodes cross-reference with @id instead of duplicating facts.
 *   - Nothing is asserted that src/data/business.ts and real content do not
 *     support: no aggregateRating, no review, no invented sameAs, no
 *     priceValidUntil. Omit rather than guess.
 */
import { business } from './business';
import { pagePath } from './urls';

const ORG_ID = `${business.url}/#organization`;
/** The company's public Companies House record (checked 21 October 2026). */
const COMPANIES_HOUSE_URL = 'https://find-and-update.company-information.service.gov.uk/company/17060907';
const SITE_ID = `${business.url}/#website`;

/** The founder Person node — referenced by @id from org, articles, notes. */
export function founderNode() {
  return {
    '@type': 'Person',
    '@id': `${business.url}/about/#waseem-ilyas`,
    name: 'Waseem Ilyas',
    jobTitle: 'Founder and sole director',
    description:
      'Engineer who founded Automancer Ltd to give small businesses the same automation leverage as big firms; makes every decision and takes every call.',
    url: `${business.url}/about/`,
  };
}

/** The canonical ProfessionalService node, shared by every page's @graph. */
export function organizationNode() {
  return {
    '@type': 'ProfessionalService',
    '@id': ORG_ID,
    name: business.tradingName,
    legalName: business.legalName,
    url: business.url,
    description: business.description,
    email: business.email,
    telephone: business.phoneTel,
    image: `${business.url}/assets/images/logo.svg`,
    logo: {
      '@type': 'ImageObject',
      url: `${business.url}/assets/images/logo.svg`,
    },
    address: {
      '@type': 'PostalAddress',
      streetAddress: business.address.streetAddress,
      addressLocality: business.address.addressLocality,
      postalCode: business.address.postalCode,
      addressCountry: business.address.addressCountry,
    },
    areaServed: business.areasServed,
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: business.email,
      telephone: business.phoneTel,
      availableLanguage: ['en-GB'],
    },
    // The Companies House record is the one verified profile. VAT number and
    // social profiles are not published anywhere verified, so no taxID and no
    // other sameAs. Add only when a real profile exists.
    sameAs: [COMPANIES_HOUSE_URL],
    founder: { '@id': founderNode()['@id'] },
  };
}

export function websiteNode() {
  return {
    '@type': 'WebSite',
    '@id': SITE_ID,
    url: business.url,
    name: business.tradingName,
    description: business.description,
    publisher: { '@id': ORG_ID },
    inLanguage: 'en-GB',
    // No potentialAction SearchAction: the site has no search feature.
  };
}

export function webPageNode(opts: { path: string; title: string; description: string; type?: string; datePublished?: string; dateModified?: string }) {
  const url = new URL(pagePath(opts.path), business.url).toString();
  return {
    '@type': opts.type ?? 'WebPage',
    '@id': `${url}#webpage`,
    url,
    name: opts.title,
    description: opts.description,
    isPartOf: { '@id': SITE_ID },
    about: { '@id': ORG_ID },
    inLanguage: 'en-GB',
    ...(opts.datePublished ? { datePublished: opts.datePublished } : {}),
    ...(opts.dateModified ? { dateModified: opts.dateModified } : {}),
  };
}

const wordCount = (body: string | undefined): number =>
  (body ?? '').split(/\s+/).filter(Boolean).length;

export interface ArticleNodeOpts {
  path: string;
  title: string;
  description: string;
  date: Date;
  author: string;
  body?: string;
  articleSection?: string;
}

/** BlogPosting node for field notes. */
export function articleNode(opts: ArticleNodeOpts) {
  const url = new URL(pagePath(opts.path), business.url).toString();
  const authorName = opts.author || founderNode().name;
  return {
    '@type': 'BlogPosting',
    '@id': `${url}#article`,
    headline: opts.title,
    description: opts.description,
    url,
    mainEntityOfPage: { '@id': `${url}#webpage` },
    inLanguage: 'en-GB',
    datePublished: opts.date.toISOString(),
    wordCount: wordCount(opts.body),
    image: `${business.url}/assets/images/og-image.png`,
    author:
      authorName === founderNode().name
        ? { '@id': founderNode()['@id'] }
        : { '@type': 'Person', name: authorName },
    publisher: { '@id': ORG_ID },
    ...(opts.articleSection ? { articleSection: [opts.articleSection] } : {}),
  };
}
