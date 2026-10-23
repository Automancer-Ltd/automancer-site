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
  /**
   * The "What's included" bullets the /services page shows, in that order.
   * /api/services.json and the Markdown twin read this same list, so a machine
   * quotes the scope a person reads. These sentences are already published on
   * the page; this field does not add a claim.
   */
  includes: readonly string[];
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
    includes: [
      'A working session where we map how your business actually runs — the tools, the handoffs, the bottlenecks.',
      'A ranked list of automation opportunities, each with an estimate of the time or money it’s costing you now.',
      'A costed, plain-English plan: what to do first, what it’ll take, and what it’ll cost.',
      'No obligation to do any of it with us. It’s your plan to keep.',
    ],
    priceFrom: 450,
    priceUnit: 'project',
  },
  {
    id: 'workflow-implementation-sprint',
    name: 'Workflow Sprint',
    description: 'Build and deploy automation for 1–3 selected workflows.',
    includes: [
      'We take 1–3 specific, well-defined workflows and automate them end to end.',
      'Built on tools you already use where we can; new pieces added only where they earn their place.',
      'Live in production in around two weeks, with you testing it as we go.',
      'Handover so your team knows how it works — and how to trust the numbers coming out of it.',
    ],
    priceFrom: 1950,
    priceUnit: 'project',
  },
  {
    id: 'system-agent-build',
    name: 'System / Agent Build',
    description:
      'From task-specific assistants to full AI employees that draw on your organisational knowledge.',
    includes: [
      'Custom software designed around how you actually work.',
      'Built the way we build our own company: audited, monitored, backed up, and tested — not a prototype that falls over the first busy Monday.',
      'AI agents where they add value, with a human kept firmly in control of anything that matters.',
      'Delivered in governed stages so you see it working before it goes live, and you’re never staring at a big-bang launch.',
    ],
    priceFrom: 4500,
    priceUnit: 'project',
  },
  {
    id: 'ai-ops-partner',
    name: 'AI Ops Partner',
    description:
      'Ongoing optimisation and support as your automation footprint grows.',
    includes: [
      'We monitor and maintain everything we’ve built for you, so it keeps working while you don’t think about it.',
      'A steady drip of new automation — we keep finding and removing the next bottleneck.',
      'A human (Waseem) who knows your setup and answers when you need something.',
      'Cancel anytime. No twelve-month lock-in, no exit fee, no hostage situation. If it’s not earning its keep, you stop.',
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
