/**
 * The published stability & deprecation policy — the machine-readable form of
 * VISION.md's line "Published identifiers are promises. What machines depend on
 * stays stable; presentation is free to change."
 *
 * WHY THIS IS A DOCUMENT AND NOT A SENTENCE
 * /developers already said "additive changes only within a schemaVersion". A
 * sentence is not checkable: an agent has to interpret it per deploy, and
 * nothing failed when we broke it. This module publishes the promise in the
 * same shape as everything else on the site — a static JSON payload, generated
 * from the same sources as the endpoints themselves — so a machine can fetch
 * it, quote it, and tell whether a deploy kept it.
 *
 * HONESTY RULES (VISION.md: "Never fake a capability for a score")
 *  - Every promise here describes behaviour this repo actually has. The parts
 *    a test can enforce are enforced: the paths and service ids promised below
 *    are read from src/data/api.ts and src/data/business.ts (so this document
 *    cannot claim stability for something that is not served), and a
 *    deprecation cannot be listed without a sunset date and a replacement
 *    (tests/developer-surface.test.ts).
 *  - What the host cannot do is published under `notPromised`, not quietly left
 *    out: GitHub Pages serves static files, so there is no way to send
 *    `Deprecation` or `Sunset` response headers, and pretending otherwise
 *    would be the exact kind of fake this site refuses.
 *
 * Sources: src/data/api.ts (endpoint paths), src/data/business.ts (published
 * service ids), src/data/build.ts (build stamp). Nothing is retyped by hand.
 */
import { API_ENDPOINTS } from './api';
import { business, services } from './business';
import { build } from './build';

/**
 * The date this policy took effect (ISO-8601). Changing it is a change of
 * promise, not a change of payload — which is why it is a hand-written date and
 * not the build timestamp.
 */
export const STABILITY_EFFECTIVE_FROM = '2026-10-20';

export interface StabilityRule {
  /** The thing promised. Short enough to be a heading. */
  what: string;
  /** What the promise means, and what breaking it would look like. */
  detail: string;
}

/** What a machine may rely on between deploys. Changing one of these is breaking. */
export const STABLE_RULES: StabilityRule[] = [
  {
    what: 'Endpoint paths',
    detail:
      'Every path in `endpointPaths` keeps answering 200 at that path. A path is never silently re-purposed for different data: new data arrives as new fields or as a new endpoint.',
  },
  {
    what: 'Operation ids',
    detail:
      'The `operationId` of each endpoint in /openapi.json is the name a function-calling client binds to. It does not change while the endpoint is served.',
  },
  {
    what: 'Response field names',
    detail:
      'A field published at a live path keeps its name and its meaning. Renaming it, removing it or re-purposing it for a different fact is a breaking change — see `deprecation`.',
  },
  {
    what: 'Published service ids',
    detail:
      'The ids in `stableServiceIds` are what /api/services.json publishes and what a consumer should key on. A service may be renamed or its copy reworded; its id may not change.',
  },
  {
    what: 'Published page URLs',
    detail:
      'The page URLs listed in /api/pages.json and the sitemap keep resolving. A page that has to move leaves a redirect to its new URL — on this static host that is a redirect page rather than a server-side 301.',
  },
  {
    what: 'Published enum values',
    detail:
      'A value published today (for example `priceUnit` of `project` or `month`) keeps its meaning. New values may be added, so treat an unrecognised value as something new rather than as an error.',
  },
];

/** Changes that may land at any deploy, with no notice and no version bump. */
export const ADDITIVE_CHANGES: string[] = [
  'New fields on an existing payload. Read the fields you know and ignore the rest; an unknown field is not an error.',
  'New endpoints, and new services, case studies, field notes or pages.',
  'New values on an existing enum field.',
  'Prose: descriptions, summaries, documentation and presentation may be reworded at any deploy, as long as the facts they state do not change.',
  'Provenance: `generatedAt`, build stamps and revision numbers change on every deploy.',
  'Array order: collections are published in a stable order today, but that order is not a promise. Sort by `date`, `slug` or `id` when order matters to you.',
];

/** What this site does not promise, stated plainly rather than left implied. */
export const NOT_PROMISED: string[] = [
  'Response headers of any kind, including `Deprecation`, `Sunset` and `Link` — see `deprecation.httpHeaders`.',
  'Rate limits: none is enforced and none is guaranteed. Payloads change only at deploy, so cache them.',
  'An uptime SLA. Production is checked after every deploy and every 30 minutes afterwards; that is monitoring, not a promise of availability.',
  'The `/.well-known/` copies of agent.json and security.txt. They are served (they answered 404 until 22 Oct 2026), but /agent.json and /security.txt are what every surface advertises: rely on those.',
  'The wording and layout of the HTML pages, as long as the facts they state stay the same.',
];

/**
 * An endpoint or field being withdrawn. Empty today: nothing published here
 * has been deprecated. A test refuses an entry without a sunset date and a
 * replacement, so this list cannot become "we removed it, we just did not say
 * when".
 */
export interface Deprecation {
  /** The path (or path plus field) going away. */
  path: string;
  /** The field being withdrawn, when the deprecation is narrower than a path. */
  field?: string;
  /** What to use instead. */
  replacement: string;
  /** ISO date the deprecation was first published in this document. */
  deprecatedOn: string;
  /** ISO date the old path or field stops being served. */
  sunset: string;
}

/** Nothing is deprecated today. */
export const DEPRECATIONS: Deprecation[] = [];

/** How a breaking change is published. Enforced by the tests where it can be. */
export const DEPRECATION_POLICY = {
  minimumNoticeDays: 90,
  announcedIn:
    '/api/stability.json `deprecations[]` — this document. It is machine-readable, so an agent can poll it instead of reading prose on a page that may have changed.',
  procedure: [
    'A broken shape is published at a NEW versioned path (/api/v2/<name>.json) and advertised here and in /api/index.json. The existing path keeps serving its current shape; it is not rewritten in place.',
    'The old path, or the narrower field, is added to `deprecations` below with the date it was announced, the date it stops being served, and the replacement to use.',
    'The old path is removed only after its `sunset` date has passed, and never sooner than `minimumNoticeDays` after it appeared in this list.',
  ],
  httpHeaders:
    'No Deprecation or Sunset HTTP headers are sent. This document is the announcement channel instead.',
} as const;

/**
 * The /api/stability.json payload.
 *
 * `endpointPaths` and `stableServiceIds` are read from the modules that publish
 * them, so the promise covers exactly what is served — a new endpoint or a
 * renamed service id shows up here without anyone remembering to edit this file.
 */
export function stabilityPolicy() {
  return {
    schemaVersion: '1.0',
    generatedAt: build.time.toISOString(),
    effectiveFrom: STABILITY_EFFECTIVE_FROM,
    url: `${business.url}/api/stability.json`,
    summary:
      'What a machine may rely on when it reads this site between deploys, and what may change without notice. Scoped to the public JSON API at automancer.uk.',
    versioning: {
      scheme: 'path-versioned',
      currentVersion: 1,
      detail:
        'Every endpoint under /api/ is version 1. A breaking change is published as a new versioned path (/api/v2/...), served alongside the existing one; the existing path is not rewritten in place. `schemaVersion` inside each payload identifies that payload shape, and within one schemaVersion at one path changes are additive only.',
    },
    stable: STABLE_RULES,
    endpointPaths: API_ENDPOINTS.map((endpoint) => endpoint.path),
    stableServiceIds: services.map((service) => service.id),
    additiveChanges: ADDITIVE_CHANGES,
    deprecation: DEPRECATION_POLICY,
    deprecations: DEPRECATIONS,
    notPromised: NOT_PROMISED,
    contact: {
      email: business.email,
      url: `${business.url}/contact`,
      note: 'If an endpoint answers something this document says it will not, that is a defect rather than a version change. Email us and say which path.',
    },
  };
}
