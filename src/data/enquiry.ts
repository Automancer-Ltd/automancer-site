/**
 * The enquiry contract: how to reach Automancer, which route an agent can
 * actually complete, and what an enquiry carries. ONE module, read by:
 *
 *   - /contact/              (the form's labels, limits and "what happens next")
 *   - /api/enquiry.json      (the same facts as data)
 *   - /agent.json            (the response promise and a pointer here)
 *
 * The form is the thing a person fills in; this module is what it asks for.
 * tests/enquiry-contract.test.ts reads the BUILT /contact/ page and fails if
 * a field, label, limit or step there differs from the published payload.
 *
 * What this does NOT do: offer a machine submission route. The intake API
 * accepts only a browser submission that passed the Cloudflare Turnstile
 * check, from https://automancer.uk (src/config/site.ts). The site says so
 * rather than describing a POST an agent cannot complete; email is the route
 * an agent can finish, and it reaches the same person.
 */
import { business, formatGBP, services } from './business';
import { build } from './build';
import { abs } from './urls';
import { FIELD_LIMITS } from '../config/site';

export type EnquiryFieldId = 'name' | 'company' | 'email' | 'service' | 'time_sink' | 'team_size' | 'extra';

/** One answer to "What are you interested in?": a published service, or not sure yet. */
export interface EnquiryOption {
  /** The radio's value and the `?service=` value that picks it: a published service id, or `not-sure`. */
  value: string;
  /** The name a person reads, the service's published name. */
  label: string;
  /** The published from-price shown beside it, where it is a service. */
  price?: string;
}

/** Not a service: for a visitor who wants to be told which offer fits. */
export const NOT_SURE = 'not-sure';

/** The services the form offers, in the order /services/ shows them, then "Not sure yet". */
export const SERVICE_OPTIONS: readonly EnquiryOption[] = [
  ...services.map((s) => ({
    value: s.id,
    label: s.name,
    price: `from ${formatGBP(s.priceFrom)}${s.priceUnit === 'month' ? '/mo' : ''}`,
  })),
  { value: NOT_SURE, label: 'Not sure yet' },
];

/** The query parameter that picks a service on arrival: /contact/?service=<id>. */
export const SERVICE_PARAM = 'service';

/**
 * The contact address a button for one offer links to. The form arrives with
 * that offer picked, and the visitor can change or clear it. An unknown id is
 * a build error, not a link that silently picks nothing.
 */
export function contactHref(serviceId: string): string {
  if (!SERVICE_OPTIONS.some((o) => o.value === serviceId)) throw new Error(`No enquiry option "${serviceId}"`);
  return `/contact/?${SERVICE_PARAM}=${encodeURIComponent(serviceId)}`;
}

export interface EnquiryField {
  /** The form control's `name`, and this field's stable id. */
  id: EnquiryFieldId;
  /** The label a person reads on /contact/, without the "(optional)" marker. */
  label: string;
  required: boolean;
  /** The most characters the form accepts in this field (for a choice, its longest value). */
  maxLength: number;
  kind: 'text' | 'email' | 'long-text' | 'choice';
  /** A choice's answers, in the order the form shows them. */
  options?: readonly EnquiryOption[];
  /** The example the form shows inside the empty field, where it shows one. */
  example?: string;
}

/**
 * In the order the form asks for them. `name`, `company`, `email` and the
 * message limit are the intake endpoint's own limits (FIELD_LIMITS); team size
 * and "anything else" are the form's, and both are folded into the message.
 */
export const ENQUIRY_FIELDS: readonly EnquiryField[] = [
  { id: 'name', label: 'Your name', required: true, maxLength: FIELD_LIMITS.name, kind: 'text' },
  { id: 'company', label: 'Business name', required: false, maxLength: FIELD_LIMITS.company, kind: 'text' },
  { id: 'email', label: 'Email', required: true, maxLength: FIELD_LIMITS.email, kind: 'email' },
  {
    id: 'service',
    label: 'What are you interested in?',
    required: false,
    maxLength: Math.max(...SERVICE_OPTIONS.map((o) => o.value.length)),
    kind: 'choice',
    options: SERVICE_OPTIONS,
  },
  {
    id: 'time_sink',
    label: "What's eating your week?",
    required: true,
    maxLength: FIELD_LIMITS.message,
    kind: 'long-text',
    example: "The boring, repetitive, expensive stuff. What takes up too much of your team's time?",
  },
  {
    id: 'team_size',
    label: 'Roughly how big is your team?',
    required: false,
    maxLength: 80,
    kind: 'text',
    example: 'e.g. just me, 12, ~500',
  },
  { id: 'extra', label: 'Anything else we should know?', required: false, maxLength: 2000, kind: 'long-text' },
];

/** Look a field up by id; the form reads its label and limit through this. */
export function enquiryField(id: EnquiryFieldId): EnquiryField {
  const field = ENQUIRY_FIELDS.find((f) => f.id === id);
  if (!field) throw new Error(`No enquiry field "${id}"`);
  return field;
}

/** The fields the form joins into the one `message` the intake API takes. */
export const COMBINED_MESSAGE = {
  fields: ['service', 'time_sink', 'team_size', 'extra'] as EnquiryFieldId[],
  maxLength: FIELD_LIMITS.message,
  detail: `The form sends these four as one message: “Interested in: …” with the chosen option's label when one is picked, then the answer to “What's eating your week?”, then “Team size: …” and “Also: …” when they are given. Together they must fit in ${FIELD_LIMITS.message.toLocaleString('en-GB')} characters.`,
};

/** The promise the contact page makes, in its own words. */
export const RESPONSE_PROMISE = 'We promise a meeting within one week of first contact.';

/** "What happens next" on /contact/, step by step. */
export const AFTER_SEND_STEPS: readonly { h: string; p: string }[] = [
  { h: 'Your message enters our pipeline', p: 'It lands in the same project system our AI agents run — the one we built and use every day. Nothing gets lost, nothing sits ignored in an inbox.' },
  { h: 'Waseem reads it. Personally.', p: 'No auto-responder pretending to be a person. An actual human reads what you wrote and works out how we can help.' },
  { h: 'You get a personal email back', p: 'From Waseem, to arrange a proper conversation — and we\'ll have that meeting within one week of you getting in touch.' },
  { h: 'We take it from there', p: 'Usually that means an Automation Audit, but if a quick pointer is all you need, we\'ll happily give you that too.' },
];

/** The body of an email that answers the same questions the form asks. */
function emailBody(): string {
  return ENQUIRY_FIELDS.filter((f) => f.id !== 'email')
    .map((f) => {
      const choices = f.options ? ` One of: ${f.options.map((o) => o.label).join(', ')}.` : '';
      return `${f.label}${f.required ? '' : ' (optional)'}${choices}\n`;
    })
    .join('\n');
}

const EMAIL_SUBJECT = 'Enquiry';

/** The /api/enquiry.json payload. */
export function enquiryContract() {
  const body = emailBody();
  return {
    schemaVersion: '1.0',
    generatedAt: build.time.toISOString(),
    url: abs('/api/enquiry.json'),
    page: abs('/contact/'),
    summary:
      'How to send Automancer an enquiry. Every route reaches the same person, Waseem. Email is the one an agent can complete on its own; the web form needs a person in a browser.',
    preferredRouteForAgents: 'email',
    routes: [
      {
        id: 'email',
        channel: 'email',
        address: business.email,
        url: `mailto:${business.email}`,
        agentCanComplete: true,
        detail: 'A plain email reaches the same human the form does. Waseem replies by email to the address it came from.',
      },
      {
        id: 'web-form',
        channel: 'web-form',
        url: abs('/contact/'),
        agentCanComplete: false,
        requires: ['JavaScript', 'A Cloudflare Turnstile browser security check'],
        detail:
          'Built for a person in a browser. The intake service refuses a submission without a passed security check, and only accepts one sent from the form on automancer.uk. An agent cannot complete it and should not try to get round the check: use email.',
      },
      {
        id: 'phone',
        channel: 'phone',
        number: business.phone,
        url: `tel:${business.phoneTel}`,
        agentCanComplete: false,
        requires: ['A voice call'],
        detail: 'A voicemail line: leave a message and it reaches Waseem, same as the form. No switchboard, no bot.',
      },
    ],
    fields: ENQUIRY_FIELDS.map((f) => ({ ...f, options: f.options?.map((o) => ({ ...o })) })),
    prefill: {
      parameter: SERVICE_PARAM,
      field: 'service',
      values: SERVICE_OPTIONS.map((o) => o.value),
      example: `${abs('/contact/')}?${SERVICE_PARAM}=${services[0]!.id}`,
      detail:
        'Opening /contact/ with ?service=<value> arrives with that option picked; the visitor can change it. Each service button on the site links this way. An unknown value picks nothing.',
    },
    combinedMessage: COMBINED_MESSAGE,
    email: {
      to: business.email,
      subject: EMAIL_SUBJECT,
      body,
      mailto: `mailto:${business.email}?subject=${encodeURIComponent(EMAIL_SUBJECT)}&body=${encodeURIComponent(body)}`,
      detail:
        "A starting point that asks what the form asks. The form needs a name and what's eating your week; the rest is optional. The reply goes to the address the email is sent from.",
    },
    responsePromise: RESPONSE_PROMISE,
    whatHappensNext: AFTER_SEND_STEPS.map((s) => ({ step: s.h, detail: s.p })),
    privacy: abs('/privacy/'),
  };
}
