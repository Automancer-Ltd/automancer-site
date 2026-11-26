/**
 * Markdown renditions of the HAND-AUTHORED pages (/, /about, /services,
 * /contact, /work index, /field-notes index, /releases).
 *
 * Each twin says what its page says, sentence for sentence and in the page's order (t27008):
 * tests/twin-parity.test.ts fails a twin that leaves out a sentence its page shows, or states
 * one its page does not. Lists both views show are written once, in src/data/page-words.ts.
 */
import { business, formatGBP, serviceById, serviceOfferAnchor } from './business';
import { AFTER_SEND_STEPS, contactHref } from './enquiry';
import { ABOUT_PRINCIPLES, HOME_CAPS, HOME_LADDER, HOME_PROOF, SERVICE_FAQS, SERVICE_OFFERS, linkedMarkdown } from './page-words';
import { abs, absHref } from './urls';
import { getReleases } from './releases';
import { noteTopic } from './note-topics';
import { frontMatter, mdResponse, getStudies, getNotes, noteTopicLinks, staticPages, studySourcesUrl, type CaseStudy, type PageMeta } from './site-content';
import type { APIRoute } from 'astro';

/** The card's Sources link, as the page shows it beside a study that quotes figures (t23577). */
const sourcesSuffix = (e: CaseStudy) => (studySourcesUrl(e) ? ` ([Sources](${studySourcesUrl(e)}))` : '');

const audit = serviceById('automation-opportunity-audit');
const auditFrom = formatGBP(audit.priceFrom);
/** A button on the page, as a Markdown link. */
const button = (label: string, path: string) => `[${label}](${absHref(path)})`;
const auditButton = (label = 'Book an Audit') => button(`${label} — from ${auditFrom}`, contactHref(audit.id));
/** The page's price as it reads there: "from £450", "from £495/mo". */
const fromPrice = (s: (typeof HOME_LADDER)[number]['service']) => `from ${formatGBP(s.priceFrom)}${s.priceUnit === 'month' ? '/mo' : ''}`;

/** The case studies as the home and work pages order them: the featured one first. */
async function studiesFeaturedFirst(): Promise<CaseStudy[]> {
  const studies = await getStudies();
  const feature = studies.find((e) => e.data.featured) ?? studies[0];
  return feature ? [feature, ...studies.filter((e) => e.id !== feature.id)] : [];
}

async function homeBody(): Promise<string> {
  const [feature, ...rest] = await studiesFeaturedFirst();
  const card = (e: CaseStudy, tag: string) =>
    `- ${tag}: **[${e.data.title}](${abs(`/work/${e.id}/`)})** — ${e.data.summary ?? e.data.description}${sourcesSuffix(e)}`;
  return `AI & automation consultancy · Bradford → UK-wide

# Your admin, automated into oblivion.

We make small businesses run like magic.

Automancer builds the software and AI agents that handle the repetitive, error-prone admin your team shouldn't be doing by hand. Real systems, published prices, and a human who answers.

It's not magic. It's very good engineering.

${auditButton('Book an Automation Audit')} · ${button('See the work', '/work/')}

## Clear starting prices, upfront.

We publish our starting prices so you know what to expect before you get in touch. [Compare all services](${abs('/services/')}).

${HOME_LADDER.map(({ service, description }) => `- [${service.name}](${abs('/services/')}#${serviceOfferAnchor(service.id)}) — ${fromPrice(service)}: ${description}`).join('\n')}

## This whole company is run by AI. On purpose.

The proof is the business you're looking at. // proof.log — live

Our own finance tracking, project management, website, and field notes run on AI agents. Waseem makes every decision and takes every call. The agents handle the routine work; the judgement stays human.

${HOME_PROOF.map((c) => `- ${c.tag}: **${c.h}** — ${c.p}`).join('\n')}

> We build your systems using the same tools we run our own company on.

## We automate the work that's eating your week.

What we do. // capabilities: ${HOME_CAPS.length}

If someone on your team spends hours copying figures between systems, updating spreadsheets, chasing approvals, or answering the same question every day, a computer can do that job for them.

${HOME_CAPS.map((c, i) => `${i + 1}. **${c.name}** — ${c.desc}`).join('\n')}

Not sure what to automate first? [Start with an Audit](${abs('/services/')}).

## Real businesses. Real systems. Live in production.

Selected work:

${[
  ...(feature ? [card(feature, `${feature.data.sector}${feature.data.status ? ` · ${feature.data.status}` : ''}`)] : []),
  ...rest.slice(0, 2).map((e) => card(e, e.data.sector)),
].join('\n')}

[See all our work](${abs('/work/')}).

## This site speaks machine, too.

For agents & developers: every fact here is also available as data: a public, read-only JSON API that needs no authentication, Markdown twins of every page, full-text files written for LLMs, and an OpenAPI spec of it all. ${button('Developer & agent documentation', '/developers/')} · ${button('Read llms.txt', '/llms.txt')}

## Tell us what's eating your week.

Fill in a short form. No calendar gauntlet, no chatbot, no sales sequence. Waseem reads it himself and emails you back — and we promise a meeting within one week of first contact.

${auditButton('Start with an Audit')} · ${button('Just ask a question', '/contact/')}

Based in Bradford. Working with businesses in Leeds, Manchester and across the UK, remote-first.
`;
}

function servicesBody(): string {
  return `Services & pricing

# Four ways in. All of them start with a price you can actually see.

We publish our starting prices so you can check whether we fit your budget before booking a call. Here is what we do, who each service is for, and what it costs to start.

Every price below is a *from* price for real work. Where your project is larger, we tell you the full price upfront before we start.

## Think of these as rungs.

Most clients start with an Audit, move to a Sprint or a Build, and keep us on as their AI Ops Partner. You can start at any rung.

${SERVICE_OFFERS.map(
  (o) => `## ${o.service.name} — ${o.amt}${o.per ?? ''} (${o.note})

${o.step}

${o.one}

${o.who}

${button(o.cta, contactHref(o.service.id))}

What's included:

${o.service.includes.map((item) => `- ${item}`).join('\n')}

${linkedMarkdown(o.catch, absHref)}`
).join('\n\n')}

## The questions everyone asks.

Straight answers.

${SERVICE_FAQS.map(({ q, a }) => `### ${q}\n\n${a}`).join('\n\n')}

## Start where it makes sense for you.

Not sure which service fits? Start with an Audit to get a costed plan, and we deduct the audit fee in full if you go ahead with a project.

${auditButton()} · ${button('Ask us which offer fits', contactHref('not-sure'))}
`;
}

function aboutBody(): string {
  return `About Automancer

# An AI-run business, with a human at the helm.

Automancer runs its own finance tracking, project management, and website on AI agents. Waseem makes every decision and takes every call.

## Why "Automancer"?

01 · the name

An automancer works magic through machines. That's the joke, and it's also the job description. When systems talk to each other and repetitive admin happens overnight, it feels like magic. In practice, it is careful software engineering pointed at the dullest, most expensive jobs in your week.

For years, custom automation required a six-figure budget and an internal IT department. Smaller businesses had to make do with disconnected apps and spreadsheets. Better tools now make it affordable for a care provider in Bradford or a manufacturer in Manchester to have software built around their exact workflow.

We built Automancer to deliver that — and we run our own consultancy on the same tools we build for clients.

## The business is the demo.

02 · the demo

Here is how Automancer runs day to day.

AI agents monitor software spend and draft invoices. Waseem checks, approves, and sends them. Bookkeeping stays manual. Agents track every project, run automated checks on every change, and maintain this website and its field notes.

One rule never changes: **a human makes every decision and takes every call.** The agents draft, calculate, monitor, and test. Waseem decides what ships, approves every invoice, and speaks directly with every client.

Running our own back office this way keeps our overheads low and proves our tools in daily use before we put them to work for you.

## Meet Waseem.

03 · the human

Automancer is founded and run by Waseem Ilyas, an engineer who builds software that takes repetitive admin off small teams.

Before starting Automancer, he founded and ran a SaaS product company from scratch. He brings that production discipline — automated testing, monitoring, and verified backups — to every client project.

He works with businesses across social care, manufacturing, professional services, and travel, from [a ~600-person care provider's operations platform](${abs('/work/care-provider-transformation/')}) to a single-page site for a new travel agency.

When you contact Automancer, you deal directly with Waseem. He reads your enquiry, scopes your project, and takes every call.

## Five rules we actually keep.

How we do things. // rules_kept: 5/5

${ABOUT_PRINCIPLES.map((p, i) => `${i + 1}. **${p.name}** — ${p.desc}`).join('\n')}

## Want a business that runs a bit more like ours?

Start with an Audit and we'll show you where AI and automation will save time and money in your business, with clear numbers and a practical plan.

${auditButton()} · ${button('See the work', '/work/')}
`;
}

function contactBody(): string {
  return `# Tell us what's eating your week.

Waseem reads your enquiry himself.

- **Email Waseem:** ${business.email}
- **Leave a voicemail:** ${business.phone}

## Send an enquiry

Tell us a bit about your business and what's driving you mad. You don't need to know the solution.

The form is at ${abs('/contact/')}. No spam, no sales sequence, no sharing your details. Just a human reading what you sent.

Agents — use email. The form needs a browser; a plain email reaches the same human.
The routes, the form's fields and limits, and an email template that asks the same questions are published as data at ${business.url}/api/enquiry.json.

## The one-week promise

1 week to a meeting, from first contact.

Not a number in the diary three weeks out, not an automated "someone will be in touch" — an actual conversation with an actual human, within seven days. Agents do the heavy lifting behind the scenes, but a human makes every decision and takes every call.

Based in ${business.areasServed[0]} · Leeds · Manchester · UK-wide, remote-first.

## What happens next.

After you hit send:

${AFTER_SEND_STEPS.map((s, i) => `${i + 1}. **${s.h}** — ${s.p}`).join('\n')}

That's it. No funnel, no pressure, no "book a slot with a bot". Just tell us what's wrong and let a human sort it.
`;
}

async function workIndexBody(): Promise<string> {
  const [feature, ...rest] = await studiesFeaturedFirst();
  const card = (e: CaseStudy, details: string[]) =>
    [
      `### [${e.data.title}](${abs(`/work/${e.id}/`)})`,
      '',
      `${e.data.sector}${e.data.status ? ` · ${e.data.status}` : ''}`,
      '',
      `${e.data.summary ?? e.data.description}${sourcesSuffix(e)}`,
      ...details,
    ].join('\n');
  return `# Real businesses. Real systems. Live in production.

Working systems we built for real UK businesses. Here's what we did and what it changed.

// honesty note: Every case study here is anonymised at launch, while we get sign-off from each client to name them. Every fact, figure and outcome is real and taken from the actual work — we don't invent numbers.

${[
  ...(feature
    ? [card(feature, [
        ...(feature.data.stats.length ? ['', ...feature.data.stats.map((s) => `- **${s.v}** — ${s.l}`)] : []),
        ...(feature.data.tags.length ? ['', feature.data.tags.slice(0, 4).join(' · ')] : []),
      ])]
    : []),
  ...rest.map((e) => card(e, e.data.statline ? ['', e.data.statline] : [])),
].join('\n\n')}

Each case study is also available as clean Markdown at its URL plus \`.md\`.

## Your business could be the next one on this page.

Start with an Audit and we'll show you where automation would pay for itself — with real numbers, not promises.

${auditButton()} · ${button('See our services', '/services/')}
`;
}

async function fieldNotesIndexBody(): Promise<string> {
  const notes = await getNotes();
  const subjects = noteTopicLinks(notes);
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return [
    'Field notes',
    '',
    '# Notes from the field, not the content calendar.',
    '',
    'Written by the same agents that run this company, from real delivered work — and read, edited and signed off by Waseem. Plain English, real numbers, no filler.',
    '',
    ...(subjects.length ? ['## Browse by subject', '', ...subjects, ''] : []),
    '## All notes',
    '',
    ...notes.map(({ id, data }) => {
      const path = `/field-notes/${id}`;
      return `- **[${data.title}](${abs(path)})** — ${fmt(data.date)} · ${noteTopic(data)} — ${data.summary ?? data.description} [Markdown](${abs(`${path}.md`)})`;
    }),
    '',
    "// more notes ship as the work does — we only write about things we've actually built.",
    '',
    '## Reading about it is nice. Removing it is better.',
    '',
    'If a note here sounds like your Tuesday, tell us about it. Waseem reads every enquiry himself.',
    '',
    `${auditButton()} · ${button("Tell us what's eating your week", '/contact/')}`,
    '',
  ].join('\n');
}

async function releasesBody(): Promise<string> {
  const releases = await getReleases();
  return [
    'Release notes',
    '',
    '# What changed on this site, and when.',
    '',
    `Every release, newest first, from the same record we keep for ourselves. Machines can read the same notes at [/api/releases.json](${abs('/api/releases.json')}) or as Markdown at [/releases.md](${abs('/releases.md')}).`,
    '',
    ...releases.map((r) => `## ${r.version} — ${r.displayDate}\n\n${r.notes}\n`),
  ].join('\n');
}

export const staticBodies: Record<string, () => string | Promise<string>> = {
  '/': homeBody,
  '/services/': servicesBody,
  '/about/': aboutBody,
  '/contact/': contactBody,
  '/work/': workIndexBody,
  '/field-notes/': fieldNotesIndexBody,
  '/releases/': releasesBody,
};

export async function renderStaticTwin(path: string): Promise<string> {
  const meta: PageMeta | undefined = staticPages.find((p) => p.path === path);
  const bodyFn = staticBodies[path];
  if (!meta || !bodyFn || meta.legalNoMirror) {
    throw new Error(`No Markdown twin registered for static path "${path}"`);
  }
  const url = abs(path === '/' ? '/' : path.replace(/\/$/, ''));
  return (
    frontMatter({
      title: meta.title,
      description: meta.description,
      url,
      canonical: url,
      type: meta.type,
      lastUpdated: meta.lastUpdated,
    }) + (await bodyFn())
  );
}

export function twinRoute(path: string): APIRoute {
  return async () => mdResponse(await renderStaticTwin(path));
}
