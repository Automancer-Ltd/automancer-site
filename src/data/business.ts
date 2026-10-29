/**
 * Canonical business facts.
 *
 * Single source of truth consumed by:
 *   - the JsonLd component (LocalBusiness/ProfessionalService schema)
 *   - the /llms.txt endpoint
 *   - the /services page pricing table
 *
 * Keep this in sync with reality; everything else derives from it.
 */

export interface ServiceOffering {
  id: string;
  name: string;
  description: string;
  includes: readonly string[];
  priceFrom: number;
  priceUnit: 'project' | 'month';
}

export const business = {
  legalName: 'Automancer Ltd',
  tradingName: 'Automancer',
  companyNumber: '17060907',
  placeOfRegistration: 'England and Wales',
  icoRegistration: 'ZC180569',
  url: 'https://automancer.uk',
  email: 'waseem@automancer.uk',
  phone: '+44 7451 261333',
  phoneTel: '+447451261333',
  address: {
    streetAddress: '62 Beckfield Road',
    addressLocality: 'Bingley',
    postalCode: 'BD16 1QS',
    addressCountry: 'GB',
  },
  areasServed: ['Bradford', 'Leeds', 'Manchester', 'UK-wide (remote)'],
  description:
    'Practical AI and workflow automation for UK small businesses. Cut admin, reduce errors, and improve operations with Automancer.',
} as const;

/** Display format for a published from-price: £450 · £1,950. */
export function formatGBP(n: number): string {
  return '£' + n.toLocaleString('en-GB', { maximumFractionDigits: 0 });
}

export const services: ServiceOffering[] = [
  {
    id: 'automation-opportunity-audit',
    name: 'Automation Opportunity Audit',
    description:
      'A focused review of your workflows to find where automation saves the most time and money.',
    includes: [
      'A working session where we map how your team works: the tools, the handoffs, and the bottlenecks.',
      'A ranked list of automation opportunities, each with an estimate of the time or money it costs you today.',
      'A costed, plain-English plan showing what to tackle first, how long it takes, and what it costs.',
      'No obligation to build any of it with us. The plan is yours to keep.',
    ],
    priceFrom: 450,
    priceUnit: 'project',
  },
  {
    id: 'workflow-implementation-sprint',
    name: 'Workflow Sprint',
    description: 'Build and deploy automation for 1–3 selected workflows.',
    includes: [
      'We take 1–3 specific workflows and automate them end to end.',
      'Built on the tools you already use wherever possible, adding new software only when needed.',
      'Live in production in around two weeks, with your team testing it before launch.',
      'Clear handover so your staff know how it works and can trust the figures it produces.',
    ],
    priceFrom: 1950,
    priceUnit: 'project',
  },
  {
    id: 'system-agent-build',
    name: 'System / Agent Build',
    description:
      'Custom software, portals, and AI agents built around how your business runs.',
    includes: [
      'Custom software designed around your team’s daily work.',
      'Monitored, backed up, and tested to the same standard we use for our own systems.',
      'AI agents that handle repetitive tasks while a person approves the decisions that matter.',
      'Delivered in stages so you see each part working in a test environment before it goes live.',
    ],
    priceFrom: 4500,
    priceUnit: 'project',
  },
  {
    id: 'ai-ops-partner',
    name: 'AI Ops Partner',
    description:
      'Ongoing monitoring, maintenance, and new automation each month.',
    includes: [
      'We monitor and maintain everything we build for you so it keeps running smoothly.',
      'Continuous improvements: we keep finding and automating the next bottleneck.',
      'Direct access to Waseem, who knows your systems and answers when you need help.',
      'Cancel anytime. No 12-month lock-in and no exit fee.',
    ],
    priceFrom: 495,
    priceUnit: 'month',
  },
];

/** The published offering with this stable id. An unknown id is a build error, not a blank price. */
export function serviceById(id: string): ServiceOffering {
  const found = services.find((service) => service.id === id);
  if (!found) throw new Error(`No published service with id "${id}"`);
  return found;
}
