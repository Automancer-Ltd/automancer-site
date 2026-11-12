/**
 * /api/enquiry.json tells an agent how to reach Waseem and what an enquiry
 * carries. It is only worth publishing if it says exactly what the /contact/
 * form a person fills in says, so this reads the BUILT page and the BUILT
 * payload and fails on any difference: a field, its label, whether it is
 * required, its limit, its example, or a "What happens next" step.
 *
 * It also holds the honest part of the contract: email is the only route
 * marked as one an agent can complete, because the form needs a person to
 * pass a browser security check.
 */
import { parse } from 'node-html-parser';
import { describe, expect, it } from 'vitest';
import { SITE_URL, readDistFile } from './support/dist';

interface Field {
  id: string;
  label: string;
  required: boolean;
  maxLength: number;
  kind: string;
  example?: string;
}
interface Route {
  id: string;
  address?: string;
  number?: string;
  url: string;
  agentCanComplete: boolean;
}
interface Contract {
  preferredRouteForAgents: string;
  routes: Route[];
  fields: Field[];
  combinedMessage: { fields: string[]; maxLength: number };
  email: { to: string; body: string; mailto: string };
  responsePromise: string;
  whatHappensNext: Array<{ step: string; detail: string }>;
}

const contract = JSON.parse(readDistFile('api/enquiry.json') ?? '{}') as Contract;
const page = parse(readDistFile('contact/index.html') ?? '');
const form = page.querySelector('#contact-form');
const agent = JSON.parse(readDistFile('agent.json') ?? '{}') as {
  contact?: { email?: string; phone?: string; responseTime?: string; enquiryContract?: { url?: string } };
};

/** Collapse whitespace and decode the entities Astro emits in text. */
const text = (s: string) =>
  s
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

describe('/api/enquiry.json — the enquiry contract matches the /contact/ form', () => {
  it('is emitted with fields and routes', () => {
    expect(contract.fields?.length, 'no fields published').toBeGreaterThan(0);
    expect(contract.routes?.length, 'no routes published').toBeGreaterThan(0);
    expect(form, '/contact/ has no #contact-form').toBeTruthy();
  });

  it('lists every visible form control, in order, and nothing else', () => {
    const controls = form!
      .querySelectorAll('input, textarea, select')
      .filter((el) => el.getAttribute('name') !== 'website' && el.getAttribute('type') !== 'hidden')
      .map((el) => el.getAttribute('name'));
    expect(controls).toEqual(contract.fields.map((f) => f.id));
  });

  it('publishes each field with the label, requirement, limit and example the page shows', () => {
    for (const field of contract.fields) {
      const control = form!.querySelector(`[name="${field.id}"]`);
      expect(control, `no control named ${field.id}`).toBeTruthy();
      const label = form!.querySelector(`label[for="${control!.id}"]`);
      expect(label, `no label for ${field.id}`).toBeTruthy();
      const shown = text(label!.innerHTML.replace(/<span class="opt">\(optional\)<\/span>/, ''));
      expect(shown, `${field.id}: label differs`).toBe(field.label);
      expect(control!.hasAttribute('required'), `${field.id}: required differs`).toBe(field.required);
      expect(Number(control!.getAttribute('maxlength')), `${field.id}: limit differs`).toBe(field.maxLength);
      expect(control!.getAttribute('placeholder') ?? undefined, `${field.id}: example differs`).toBe(
        field.example === undefined ? undefined : field.example
      );
      if (field.kind === 'email') expect(control!.getAttribute('type')).toBe('email');
      if (field.kind === 'long-text') expect(control!.tagName.toLowerCase()).toBe('textarea');
    }
  });

  it('names the joined-message limit the form script enforces', () => {
    const script = readDistFile('contact/index.html') ?? '';
    expect(script, 'the form no longer reads the published message limit').toContain(
      `"message":${contract.combinedMessage.maxLength}`
    );
    for (const id of contract.combinedMessage.fields) {
      expect(contract.fields.map((f) => f.id), `combinedMessage names unknown field ${id}`).toContain(id);
    }
  });

  it('publishes the "What happens next" steps the page shows, in order', () => {
    const steps = page.querySelectorAll('.step-num').map((el) => ({
      step: text(el.querySelector('h3')!.innerHTML),
      detail: text(el.querySelector('p')!.innerHTML),
    }));
    expect(steps).toEqual(contract.whatHappensNext);
  });

  it('marks only email as a route an agent can complete, and prefers it', () => {
    const completable = contract.routes.filter((r) => r.agentCanComplete).map((r) => r.id);
    expect(completable).toEqual(['email']);
    expect(contract.preferredRouteForAgents).toBe('email');
  });

  it('gives the same address, number and promise as the page and agent.json', () => {
    const email = contract.routes.find((r) => r.id === 'email')!;
    const phone = contract.routes.find((r) => r.id === 'phone')!;
    expect(email.address).toBe(agent.contact?.email);
    expect(contract.email.to).toBe(agent.contact?.email);
    expect(phone.number).toBe(agent.contact?.phone);
    expect(contract.responsePromise).toBe(agent.contact?.responseTime);
    expect(page.querySelector(`a[href="${phone.url}"]`), 'the page does not link the published phone number').toBeTruthy();
  });

  it('ships an email template that asks every question the form asks and opens as written', () => {
    for (const field of contract.fields.filter((f) => f.id !== 'email')) {
      expect(contract.email.body).toContain(field.label);
    }
    const decoded = new URL(contract.email.mailto);
    expect(decoded.protocol).toBe('mailto:');
    expect(decoded.searchParams.get('body')).toBe(contract.email.body);
  });

  it('is advertised where an agent looks for contact routes', () => {
    const url = `${SITE_URL}/api/enquiry.json`;
    expect(agent.contact?.enquiryContract?.url).toBe(url);
    expect(readDistFile('llms.txt') ?? '').toContain(url);
    expect(readDistFile('contact.md') ?? '').toContain(url);
  });
});
