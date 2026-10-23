/**
 * The machine-readable JSON API surface — ONE registry, consumed by:
 *
 *   - /api/index.json        (discovery document)
 *   - /openapi.json          (OpenAPI 3.1 specification)
 *   - /developers            (human-readable documentation)
 *
 * Because all three render from this array, they cannot disagree about
 * which endpoints exist or what each one returns. Adding an endpoint means
 * adding exactly one entry here (plus its route file and response schema).
 */

export interface ApiEndpoint {
  /** Served path, e.g. "/api/business.json". */
  path: string;
  /** Unique operationId used in /openapi.json. */
  operationId: string;
  /** One-line summary (used in /developers and OpenAPI `summary`). */
  summary: string;
  /** Full description of what the endpoint returns. */
  description: string;
}

export const API_ENDPOINTS: ApiEndpoint[] = [
  {
    path: '/api/index.json',
    operationId: 'getApiIndex',
    summary: 'API discovery document',
    description:
      'This discovery document: lists every JSON endpoint with a one-line description, plus related machine-readable surfaces (llms.txt, feeds, agent manifest, sitemap).',
  },
  {
    path: '/api/business.json',
    operationId: 'getBusinessFacts',
    summary: 'Canonical business facts',
    description:
      'Canonical business facts: legal name, trading name, company registration, ICO registration, contact details, address and areas served.',
  },
  {
    path: '/api/services.json',
    operationId: 'getServices',
    summary: 'Services and published from-prices',
    description:
      'Service offerings with published from-prices (GBP), billing units, stable ids, and the same included list the /services page shows. Who an offer is for, and the FAQ, stay on the page.',
  },
  {
    path: '/api/case-studies.json',
    operationId: 'getCaseStudies',
    summary: 'All case studies with full text',
    description:
      'Every published case study: title, summary, sector, tags, publication date, headline stats and the full body text as raw Markdown.',
  },
  {
    path: '/api/claims.json',
    operationId: 'getClaims',
    summary: 'Published numeric claims and their evidence records',
    description: 'Every numeric headline case-study statistic with its stable truth-layer claim id, registry location, evidence record and source quote.',
  },
  {
    path: '/api/field-notes.json',
    operationId: 'getFieldNotes',
    summary: 'All field notes with full text',
    description:
      'Every published field note article: title, description, author, date, category, tags and the full body text as raw Markdown.',
  },
  {
    path: '/api/pages.json',
    operationId: 'getPageInventory',
    summary: 'Inventory of every page on the site',
    description:
      'Every page emitted by this site: canonical URL, title, description, type, last-modified date and its Markdown twin URL where one exists.',
  },
  {
    path: '/api/stability.json',
    operationId: 'getStabilityPolicy',
    summary: 'What machines may rely on, and how a breaking change is published',
    description:
      'The stability and deprecation policy as data: the endpoint paths and service ids promised stable, the changes that may land without notice, the versioning scheme, the minimum notice a removal gets, and the deprecation list itself (empty today).',
  },
  {
    path: '/api/releases.json',
    operationId: 'getReleases',
    summary: 'Every release of this site, newest first',
    description:
      'Every release of this site, newest first, read from the same changelog /releases renders: version, ISO date, opening summary, the full notes as raw Markdown and each release’s URL on /releases.',
  },
];
