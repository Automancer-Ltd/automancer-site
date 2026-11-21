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
  options?: Array<{ value: string; label: string; price?: string }>;
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
  prefill: { parameter: string; field: string; values: string[]; example: string };
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

  it('lists every editable enquiry field, in order, and nothing else', () => {
    const controls = form!
      .querySelectorAll('input, textarea, select')
      .filter((el) => el.getAttribute('name') !== 'website' && el.getAttribute('type') !== 'hidden' && !el.hasAttribute('readonly'))
      .map((el) => el.getAttribute('name'))
      // A choice is several radios under one name: count it once.
      .filter((name, i, all) => all.indexOf(name) === i);
    expect(controls).toEqual(contract.fields.map((f) => f.id));
  });

  it('publishes each field with the label, requirement, limit and example the page shows', () => {
    for (const field of contract.fields) {
      if (field.kind === 'choice') continue; // the next test reads a choice
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

  it('publishes each choice with the legend, answers and prices the page shows', () => {
    const choices = contract.fields.filter((f) => f.kind === 'choice');
    expect(choices.map((f) => f.id)).toEqual(['service']);
    for (const field of choices) {
      const radios = form!.querySelectorAll(`input[type="radio"][name="${field.id}"]`);
      const fieldset = radios[0]?.closest('fieldset');
      expect(fieldset, `${field.id}: no fieldset around its answers`).toBeTruthy();
      const legend = fieldset!.querySelector('legend')!;
      expect(text(legend.innerHTML.replace(/<span class="opt">\(optional\)<\/span>/, '')), `${field.id}: legend differs`).toBe(field.label);
      expect(legend.innerHTML.includes('(optional)'), `${field.id}: optional marker differs`).toBe(!field.required);
      const shown = radios.map((r) => {
        const card = r.closest('label')!;
        const price = card.querySelector('.service-option__price');
        return {
          value: r.getAttribute('value'),
          label: text(card.querySelector('.service-option__name')!.innerHTML),
          ...(price ? { price: text(price.innerHTML) } : {}),
        };
      });
      expect(shown, `${field.id}: answers differ`).toEqual(field.options);
      expect(field.maxLength).toBe(Math.max(...field.options!.map((o) => o.value.length)));
    }
  });

  it('every service button on the site arrives with a published answer picked', () => {
    expect(contract.prefill.field).toBe('service');
    const values = contract.fields.find((f) => f.id === 'service')!.options!.map((o) => o.value);
    expect(contract.prefill.values).toEqual(values);
    const prefilled = (doc: ReturnType<typeof parse>) =>
      doc.querySelectorAll('a[href^="/contact/?"]').map((a) => new URL(a.getAttribute('href')!, SITE_URL));
    const services = parse(readDistFile('services/index.html') ?? '');
    const links = prefilled(services);
    // Four offers, the closing Audit button, "Ask us which offer fits" and the footer's Audit link.
    expect(links.length).toBe(7);
    for (const url of links) expect(values).toContain(url.searchParams.get(contract.prefill.parameter));
    expect(new Set(links.map((u) => u.searchParams.get(contract.prefill.parameter))).size).toBe(5);
    expect(values).toContain(new URL(contract.prefill.example).searchParams.get(contract.prefill.parameter));
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
