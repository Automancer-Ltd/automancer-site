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
  /**
   * Stable public identifier, published in /api/services.json and used as the
   * JSON-LD offer @id.
   *
   * Declared explicitly rather than derived from `name`. It used to be a slug
   * of the name, which made it a POINTER TO A MUTABLE FIELD dressed as an
   * identifier: renaming a service silently changed its published id, and any
   * consumer holding the old one would find it simply gone, with nothing to
   * notice. These values are the ones already published, so pinning them here
   * changes no output today and stops the drift tomorrow.
   *
   * Changing an id is a breaking change to a public API. Renaming a service is
   * not.
   */
  id: string;
  name: string;
  description: string;
  /** GBP, numeric, no currency symbol. */
  priceFrom: number;
  /** e.g. "project" or "month" */
  priceUnit: 'project' | 'month';
}

export const business = {
  legalName: 'Automancer Ltd',
  tradingName: 'Automancer',
  companyNumber: '17060907',
  /** Part of the UK where the company is registered — a Companies Act trading disclosure. */
  placeOfRegistration: 'England and Wales',
  /** ICO (Information Commissioner's Office) data-protection registration. */
  icoRegistration: 'ZC180569',
  url: 'https://automancer.uk',
  email: 'waseem@automancer.uk',
  /** Voicemail line (Vonage) that feeds the intake pipeline. */
  phone: '+44 7451 261333',
  /** E.164, no spaces — for tel: links. */
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
      'A focused review of your workflows to identify where automation will have the biggest impact.',
    priceFrom: 450,
    priceUnit: 'project',
  },
  {
    id: 'workflow-implementation-sprint',
    name: 'Workflow Sprint',
    description: 'Build and deploy automation for 1–3 selected workflows.',
    priceFrom: 1950,
    priceUnit: 'project',
  },
  {
    id: 'system-agent-build',
    name: 'System / Agent Build',
    description:
      'From task-specific assistants to full AI employees that draw on your organisational knowledge.',
    priceFrom: 4500,
    priceUnit: 'project',
  },
  {
    id: 'ai-ops-partner',
    name: 'AI Ops Partner',
    description:
      'Ongoing optimisation and support as your automation footprint grows.',
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
