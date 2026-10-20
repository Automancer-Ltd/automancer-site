/**
 * OpenAPI 3.1 specification of the public JSON API — ONE builder, served at
 * /openapi.json (src/pages/openapi.json.ts).
 *
 * Sources are the same modules the endpoints themselves are generated from:
 *   - src/data/api.ts       — which endpoints exist (also renders
 *                             /api/index.json and /developers)
 *   - src/data/business.ts  — contact/legal facts (also renders the HTML
 *                             pages and every payload's business fields)
 *   - src/data/urls.ts      — canonical absolute URLs
 *
 * The document describes what ACTUALLY exists: six GET endpoints, no
 * parameters, no authentication, no side effects. Response schemas mirror
 * each endpoint's emitted payload shape (verified against the built output
 * by tests/developer-surface.test.ts) so an LLM can use them directly for
 * function calling.
 */
import { business } from './business';
import { build } from './build';
import { API_ENDPOINTS } from './api';

type JsonSchema = Record<string, unknown>;

/** Shorthand for a required, typed object property list. */
const obj = (
  properties: Record<string, JsonSchema>,
  opts: { required?: string[]; description?: string; additionalProperties?: boolean } = {}
): JsonSchema => ({
  type: 'object',
  ...(opts.description ? { description: opts.description } : {}),
  additionalProperties: opts.additionalProperties ?? false,
  properties,
  ...(opts.required ? { required: opts.required } : {}),
});

const str = (description?: string, extra: JsonSchema = {}): JsonSchema => ({
  type: 'string',
  ...(description ? { description } : {}),
  ...extra,
});

const dateTime = (description?: string): JsonSchema =>
  str(description, { format: 'date-time' });

const uri = (description?: string): JsonSchema => str(description, { format: 'uri' });

const emailSchema = (): JsonSchema => str(undefined, { format: 'email' });

/** String restricted to a fixed set of values. */
const oneOf = (...values: string[]): JsonSchema => str(undefined, { enum: values });

const strArray = (description?: string): JsonSchema => ({
  type: 'array',
  items: { type: 'string' },
  ...(description ? { description } : {}),
});

/** Every payload opens with these two provenance fields. */
const PROVENANCE_REQUIRED = ['schemaVersion', 'generatedAt'];

const schemas: Record<string, JsonSchema> = {
  ApiIndex: obj(
    {
      schemaVersion: str('Semver-ish version of this payload shape.'),
      name: str(),
      description: str(),
      url: uri(),
      generatedAt: dateTime('Build time — payloads change only at deploy.'),
      endpoints: {
        type: 'array',
        description: 'Every JSON endpoint on this site.',
        items: obj({ path: str(), description: str() }, { required: ['path', 'description'] }),
      },
      related: {
        type: 'array',
        description:
          'Related machine-readable surfaces that are not under /api/ (docs page, OpenAPI spec, plain-text guides, feeds, manifests).',
        items: obj({ path: str(), description: str() }, { required: ['path', 'description'] }),
      },
    },
    {
      required: [...PROVENANCE_REQUIRED, 'name', 'url', 'endpoints', 'related'],
      description: 'The /api/index.json discovery document.',
    }
  ),

  BusinessFacts: obj(
    {
      schemaVersion: str(),
      generatedAt: dateTime(),
      legalName: str('Registered company name.'),
      tradingName: str('Name the business trades under.'),
      companyNumber: str('Companies House registration number.'),
      placeOfRegistration: str('Jurisdiction of registration.'),
      icoRegistration: str("Information Commissioner's Office data-protection registration."),
      url: uri(),
      email: emailSchema(),
      phone: str('Human-formatted voicemail line; messages reach a person.'),
      phoneTel: str('E.164 form for tel: links.'),
      address: obj(
        {
          streetAddress: str(),
          addressLocality: str(),
          postalCode: str(),
          addressCountry: str('ISO 3166-1 alpha-2 country code.', { maxLength: 2 }),
        },
        { required: ['streetAddress', 'addressLocality', 'postalCode', 'addressCountry'] }
      ),
      areasServed: strArray(),
      description: str('One-paragraph description of the business.'),
    },
    {
      required: [
        ...PROVENANCE_REQUIRED,
        'legalName',
        'tradingName',
        'companyNumber',
        'placeOfRegistration',
        'icoRegistration',
        'url',
        'email',
        'phone',
        'phoneTel',
        'address',
        'areasServed',
        'description',
      ],
      description: 'The /api/business.json payload.',
    }
  ),

  ServicesResponse: obj(
    {
      schemaVersion: str(),
      generatedAt: dateTime(),
      currency: str('ISO 4217 currency code all prices use.', { enum: ['GBP'] }),
      note: str('Pricing caveat as published.'),
      services: {
        type: 'array',
        items: obj(
          {
            id: str('Stable kebab-case id derived from the service name.'),
            name: str(),
            description: str(),
            priceFrom: { type: 'number', description: 'Published "from" price.' },
            priceCurrency: oneOf('GBP'),
            priceUnit: str('What the from-price buys one unit of.', {
              enum: ['project', 'month'],
            }),
            url: uri(),
          },
          {
            required: ['id', 'name', 'description', 'priceFrom', 'priceCurrency', 'priceUnit', 'url'],
          }
        ),
      },
    },
    {
      required: [...PROVENANCE_REQUIRED, 'currency', 'services'],
      description: 'The /api/services.json payload.',
    }
  ),

  CaseStudiesResponse: obj(
    {
      schemaVersion: str(),
      generatedAt: dateTime(),
      count: { type: 'integer' },
      note: str(),
      caseStudies: {
        type: 'array',
        items: obj(
          {
            slug: str('URL slug — the same id used by /work/<slug>.'),
            title: str(),
            description: str(),
            url: uri(),
            markdownUrl: uri(),
            datePublished: dateTime(),
            sector: str(),
            tags: strArray(),
            status: str('Delivery status as published (e.g. "Live in production").'),
            stats: {
              type: 'array',
              description: 'Headline numbers quoted in the case study.',
              items: obj({ value: str(), label: str() }, { required: ['value', 'label'] }),
            },
            body: str('Full body text as raw Markdown.'),
          },
          {
            required: [
              'slug',
              'title',
              'description',
              'url',
              'markdownUrl',
              'datePublished',
              'sector',
              'tags',
              'stats',
              'body',
            ],
          }
        ),
      },
    },
    {
      required: [...PROVENANCE_REQUIRED, 'count', 'caseStudies'],
      description: 'The /api/case-studies.json payload.',
    }
  ),

  FieldNotesResponse: obj(
    {
      schemaVersion: str(),
      generatedAt: dateTime(),
      count: { type: 'integer' },
      fieldNotes: {
        type: 'array',
        items: obj(
          {
            slug: str('URL slug — the same id used by /field-notes/<slug>.'),
            title: str(),
            description: str(),
            url: uri(),
            markdownUrl: uri(),
            datePublished: dateTime(),
            author: str(),
            category: str('Editorial category; falls back to sector when uncategorised.'),
            tags: strArray(),
            body: str('Full body text as raw Markdown.'),
          },
          {
            required: [
              'slug',
              'title',
              'description',
              'url',
              'markdownUrl',
              'datePublished',
              'author',
              'tags',
              'body',
            ],
          }
        ),
      },
    },
    {
      required: [...PROVENANCE_REQUIRED, 'count', 'fieldNotes'],
      description: 'The /api/field-notes.json payload.',
    }
  ),

  PageInventoryResponse: obj(
    {
      schemaVersion: str(),
      generatedAt: dateTime(),
      count: { type: 'integer' },
      pages: {
        type: 'array',
        items: obj(
          {
            url: uri(),
            title: str(),
            description: str(),
            // Legal pages deliberately have no Markdown twin — null, not a URL.
            markdownUrl: {
              type: ['string', 'null'],
              format: 'uri',
              description: 'Markdown twin URL, or null where none is published.',
            },
            type: str('schema.org-flavoured page type (WebPage, CollectionPage, CaseStudy, …).'),
            lastModified: dateTime(),
          },
          {
            required: ['url', 'title', 'description', 'markdownUrl', 'type', 'lastModified'],
          }
        ),
      },
    },
    {
      required: [...PROVENANCE_REQUIRED, 'count', 'pages'],
      description: 'The /api/pages.json payload.',
    }
  ),

  // The stability and deprecation policy, as data. Declared here so the
  // promise an agent reads in /openapi.json is the same promise the payload
  // publishes — and so a field cannot be added to the policy without being
  // described to the machines that rely on it.
  StabilityPolicy: obj(
    {
      schemaVersion: str('Semver-ish version of this payload shape.'),
      generatedAt: dateTime('Build time — payloads change only at deploy.'),
      effectiveFrom: str('ISO date this policy took effect. A change here is a change of promise.'),
      url: uri('Where this document is served.'),
      summary: str(),
      versioning: obj(
        {
          scheme: oneOf('path-versioned'),
          currentVersion: { type: 'integer' },
          detail: str(),
        },
        { required: ['scheme', 'currentVersion', 'detail'] }
      ),
      stable: {
        type: 'array',
        description: 'What a machine may rely on between deploys. Changing one of these is breaking.',
        items: obj({ what: str(), detail: str() }, { required: ['what', 'detail'] }),
      },
      endpointPaths: strArray('Every endpoint path the promise covers.'),
      stableServiceIds: strArray('Published service ids that never change.'),
      additiveChanges: strArray('What may land at any deploy without notice.'),
      deprecation: obj(
        {
          minimumNoticeDays: { type: 'integer' },
          announcedIn: str(),
          procedure: strArray(),
          httpHeaders: str(),
        },
        { required: ['minimumNoticeDays', 'announcedIn', 'procedure', 'httpHeaders'] }
      ),
      deprecations: {
        type: 'array',
        description: 'Nothing published here is deprecated today; this is the list an agent polls.',
        items: obj(
          {
            path: str('The path going away.'),
            field: str('The narrower field, when the deprecation is smaller than a path.'),
            replacement: str('What to use instead.'),
            deprecatedOn: str('ISO date this entry was first published.'),
            sunset: str('ISO date the old path or field stops being served.'),
          },
          { required: ['path', 'replacement', 'deprecatedOn', 'sunset'] }
        ),
      },
      notPromised: strArray('What this site does not promise, stated rather than implied.'),
      contact: obj(
        { email: emailSchema(), url: uri(), note: str() },
        { required: ['email', 'url', 'note'] }
      ),
    },
    {
      required: [
        'schemaVersion',
        'generatedAt',
        'effectiveFrom',
        'url',
        'summary',
        'versioning',
        'stable',
        'endpointPaths',
        'stableServiceIds',
        'additiveChanges',
        'deprecation',
        'deprecations',
        'notPromised',
        'contact',
      ],
      description: 'The /api/stability.json payload.',
    }
  ),
};

/** operationId -> component schema name for its 200 response. */
const RESPONSE_SCHEMA_BY_OPERATION: Record<string, string> = {
  getApiIndex: 'ApiIndex',
  getBusinessFacts: 'BusinessFacts',
  getServices: 'ServicesResponse',
  getCaseStudies: 'CaseStudiesResponse',
  getFieldNotes: 'FieldNotesResponse',
  getPageInventory: 'PageInventoryResponse',
  getStabilityPolicy: 'StabilityPolicy',
};

/**
 * The full OpenAPI 3.1 document. Built fresh on every call so callers can
 * never share a mutated copy.
 */
export function openApiSpec() {
  const paths: Record<string, unknown> = {};

  for (const endpoint of API_ENDPOINTS) {
    paths[endpoint.path] = {
      get: {
        operationId: endpoint.operationId,
        summary: endpoint.summary,
        description: endpoint.description,
        tags: ['public-data'],
        // These endpoints take no parameters of any kind. Stated explicitly
        // so a function-calling client never invents arguments.
        parameters: [],
        security: [],
        responses: {
          '200': {
            description:
              'The current payload as static JSON, generated at build time. This site is read-only: no other method or status exists.',
            content: {
              'application/json': {
                schema: {
                  $ref: `#/components/schemas/${RESPONSE_SCHEMA_BY_OPERATION[endpoint.operationId]}`,
                },
              },
            },
          },
        },
      },
    };
  }

  return {
    openapi: '3.1.0',
    jsonSchemaDialect: 'https://json-schema.org/draft/2020-12/schema',
    info: {
      title: `${business.tradingName} public data API`,
      version: '1.0.0',
      summary: 'Read-only, key-free JSON facts about Automancer Ltd and its published work.',
      description:
        'Static JSON endpoints describing Automancer Ltd, a UK AI & workflow automation consultancy: business facts, services with published from-prices, case studies, field notes and a full page inventory.\n\n' +
        'Everything here is PUBLIC DATA requiring no authentication, no API key and no payment. The API is strictly READ-ONLY: only GET exists; there are no write operations, user accounts or tracking. All responses are generated at build time and change only at deploy, so they cache well.\n\n' +
        'Human-readable documentation: ' +
        business.url +
        '/developers — start there, or at ' +
        business.url +
        '/api/index.json for machine discovery.',
      contact: {
        name: business.tradingName,
        email: business.email,
        url: `${business.url}/contact`,
      },
      termsOfService: abs_('/terms'),
    },
    servers: [{ url: business.url, description: 'Production static site (GitHub Pages).' }],
    // Empty security requirement = the whole API is key-free and unauthenticated.
    security: [],
    tags: [
      {
        name: 'public-data',
        description: 'Public, static, unauthenticated facts about the business and its published content.',
      },
    ],
    paths,
    components: { schemas },
    'x-generated-at': build.time.toISOString(),
    'x-markdown-twins': {
      description:
        'Every HTML content page is also available as clean Markdown at its own path plus ".md" (e.g. /about.md), served as text/markdown with YAML front matter.',
      index: abs_('/index.md'),
    },
    externalDocs: {
      description: 'Developer & agent documentation — every surface this site offers, with examples.',
      url: abs_('/developers'),
    },
    // The versioning and deprecation policy, one fetch away from the spec
    // itself. This host cannot send Deprecation/Sunset response headers, so a
    // published document is the announcement channel (and it says so).
    'x-stability-policy': {
      description:
        'What machines may rely on: the paths and service ids promised stable, what may change without notice, the versioning scheme and the deprecation list.',
      url: abs_('/api/stability.json'),
    },
  };
}

// Local alias keeps the builder above readable without shadowing imports.
function abs_(path: string): string {
  return new URL(path, business.url).toString();
}

/** Render the spec as the HTTP response /openapi.json serves. */
export function renderOpenApiSpec(): Response {
  return new Response(JSON.stringify(openApiSpec(), null, 2) + '\n', {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
