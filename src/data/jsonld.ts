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
import { business, services } from './business';
import { pagePath } from './urls';

const ORG_ID = `${business.url}/#organization`;
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
    // VAT number, social profiles etc. are not published anywhere verified,
    // so no sameAs / taxID here. Add only when a real profile exists.
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

/** Service + OfferCatalog with a real Offer per published service. */
export function serviceCatalogNode() {
  return {
    '@type': 'Service',
    '@id': `${business.url}/services/#service`,
    name: `${business.tradingName} — AI & workflow automation services`,
    description:
      'Automation audits, workflow implementation, custom AI systems and ongoing operations support for UK small businesses.',
    provider: { '@id': ORG_ID },
    areaServed: business.areasServed,
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      '@id': `${business.url}/services/#offer-catalog`,
      name: 'Services and published from-prices (GBP)',
      itemListElement: services.map((s) => ({
        '@type': 'Offer',
        '@id': `${business.url}/services/#offer-${s.id}`,
        name: s.name,
        description: s.description,
        itemOffered: {
          '@type': 'Service',
          name: s.name,
          description: s.description,
          provider: { '@id': ORG_ID },
        },
        // "From" prices as published on /services; monthly offering priced
        // per month, project work priced per engagement.
        priceSpecification:
          s.priceUnit === 'month'
            ? {
                '@type': 'UnitPriceSpecification',
                price: s.priceFrom,
                priceCurrency: 'GBP',
                billingIncrement: 1,
                unitCode: 'MON',
              }
            : {
                '@type': 'PriceSpecification',
                price: s.priceFrom,
                priceCurrency: 'GBP',
              },
      })),
    },
  };
}

/** ContactPoint node carried by /contact. */
export function contactPointNode() {
  return {
    '@type': 'ContactPoint',
    '@id': `${business.url}/contact/#contact-point`,
    name: 'Contact Automancer',
    contactType: 'customer support',
    email: business.email,
    telephone: business.phoneTel,
    url: `${business.url}/contact/`,
    availableLanguage: ['en-GB'],
    areaServed: business.areasServed,
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
  /** BlogPosting for dated editorial notes; Article for case studies. */
  kind?: 'BlogPosting' | 'Article';
}

/** Article/BlogPosting node for field notes and case studies. */
export function articleNode(opts: ArticleNodeOpts) {
  const url = new URL(pagePath(opts.path), business.url).toString();
  const authorName = opts.author || founderNode().name;
  return {
    '@type': opts.kind ?? 'BlogPosting',
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

export interface Crumb {
  name: string;
  path: string;
}

export function breadcrumbNode(crumbs: Crumb[]) {
  return {
    '@type': 'BreadcrumbList',
    '@id': `${new URL(pagePath(crumbs[crumbs.length - 1].path), business.url).toString()}#breadcrumb`,
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: new URL(pagePath(c.path), business.url).toString(),
    })),
  };
}

export interface Faq {
  q: string;
  a: string;
}

export function faqNode(pagePathArg: string, faqs: Faq[]) {
  return {
    '@type': 'FAQPage',
    '@id': `${new URL(pagePath(pagePathArg), business.url).toString()}#faq`,
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}
