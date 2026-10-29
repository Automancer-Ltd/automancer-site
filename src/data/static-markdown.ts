/**
 * Markdown renditions of the HAND-AUTHORED pages (/, /about, /services,
 * /contact, /work index, /field-notes index).
 */
import { business, services, formatGBP, serviceById } from './business';
import { abs } from './urls';
import { getReleases } from './releases';
import { frontMatter, mdResponse, getStudies, getNotes, staticPages, type PageMeta } from './site-content';
import type { APIRoute } from 'astro';

const unit = (s: (typeof services)[number]) => (s.priceUnit === 'month' ? '/month' : ' per project');

const priceLine = () =>
  services.map((s) => `- **${s.name}** — from ${formatGBP(s.priceFrom)}${unit(s)}: ${s.description}`).join('\n');

async function homeBody(): Promise<string> {
  const studies = await getStudies();
  return `# Your admin, automated into oblivion.

We make small businesses run like magic. It's not magic. It's very good engineering.

Automancer builds the software and AI agents that handle the repetitive, error-prone admin your team shouldn't be doing by hand. Real systems, published prices, and a human who answers.

## This whole company is run by AI. On purpose.

Our own finance tracking, project management, website, and field notes run on AI agents. Waseem makes every decision and takes every call.

- **Finance, monitored not automated** — Agents monitor software spend and draft invoices. Waseem approves and sends them. Bookkeeping stays manual.
- **Tracked end to end** — Agents track every project and check each release before Waseem signs it off for a client.
- **This site & blog** — written, built, and maintained by the same agents we put to work in your business.
- **One human in the loop** — every decision and every call goes through Waseem. No call centre and no ticket queue.

## What we do

If someone on your team spends hours copying figures between systems, updating spreadsheets, chasing approvals, or answering the same question every day, a computer can do that job for them.

1. **Workflow automation** — repetitive admin across your existing tools, connected into one reliable flow.
2. **Custom systems & portals** — software built around how your team works, rather than forcing you into an off-the-shelf template.
3. **AI agents** — software that reads, drafts, and acts while a person stays in control of every important decision.
4. **AI Ops partnership** — we stay on, keep your systems running, and automate the next job. Cancel anytime.

## Sensible prices, published

We publish our starting prices so you know what to expect before you get in touch:

${priceLine()}

## Selected work

${studies
  .slice(0, 3)
  .map((e) => `- [${e.data.title}](${abs(`/work/${e.id}`)}) — ${e.data.summary ?? e.data.description}`)
  .join('\n')}

Full list: ${abs('/work')}
`;
}

function servicesBody(): string {
  const audit = serviceById('automation-opportunity-audit');
  const sprint = serviceById('workflow-implementation-sprint');
  const systemBuild = serviceById('system-agent-build');
  const ops = serviceById('ai-ops-partner');
  const ladder = [
    {
      name: audit.name,
      amt: formatGBP(audit.priceFrom),
      note: 'from · credited in full against any project you go on to do',
      one: 'We find where your time and money are leaking and hand you a costed plan to fix it.',
      includes: audit.includes.map((item) => '- ' + item).join('\n'),
    },
    {
      name: sprint.name,
      amt: formatGBP(sprint.priceFrom),
      note: 'from',
      one: '1–3 automations, live and working, in roughly two weeks.',
      includes: sprint.includes.map((item) => '- ' + item).join('\n'),
    },
    {
      name: systemBuild.name,
      amt: formatGBP(systemBuild.priceFrom),
      note: 'from',
      one: 'A custom system or AI agent built around how your business runs.',
      includes: systemBuild.includes.map((item) => '- ' + item).join('\n'),
    },
    {
      name: ops.name,
      amt: `${formatGBP(ops.priceFrom)}/mo`,
      note: 'from · cancel anytime',
      one: 'We stay on, keep your systems running, and automate the next bottleneck.',
      includes: ops.includes.map((item) => '- ' + item).join('\n'),
    },
  ];

  const faqs = [
    ['Is it really this cheap?', 'Yes. We run our own finance tracking, project management, and website on AI agents, which keeps our overheads low. The prices on this page are real starting prices for published work.'],
    ['What if it breaks?', 'Every system we ship is monitored, backed up, and tested. On an AI Ops Partner plan, we watch it day to day and fix issues as they arise. When you need help, you speak directly with Waseem rather than a ticket queue.'],
    ['Do I need to understand AI?', 'No. You know your business and where time is being lost; we handle the software and explain every step in plain English.'],
    ['Will a human actually answer?', 'Always. Agents do the background work, while Waseem makes every decision and takes every call. We promise a meeting within one week of first contact.'],
    ['Where are you, and do you work remotely?', `Based in ${business.areasServed[0]}, working with businesses in ${business.areasServed.slice(1).join(', ')}. Remote-first.`],
    ['What if I just want a website?', 'We build those too: fast, compliant websites with no monthly platform fees.'],
  ];

  return `# Services & pricing

Four ways in. All of them start with a price you can actually see.

Every price below is a *from* price for real work. Where your project is larger, we tell you the full price upfront before we start.

Most clients start with an Audit, move to a Sprint or a Build, and keep us on as their AI Ops Partner. You can start at any rung.

${ladder
  .map(
    (o, i) => `## ${i + 1}. ${o.name} — ${o.amt} (${o.note})

${o.one}

Includes:

${o.includes}`
  )
  .join('\n\n')}

## FAQ

${faqs.map(([q, a]) => `### ${q}\n\n${a}`).join('\n\n')}
`;
}

function aboutBody(): string {
  const principles = [
    ['Sensible prices, published', 'Our starting prices are on the website so you can see them before you get in touch.'],
    ['A human in the loop, always', 'Agents do the work; Waseem makes the decisions and takes the calls. We promise a meeting within one week of first contact.'],
    ['Built properly, not prototyped', 'Audited, monitored, backed up, and tested to the same standard as our own systems.'],
    ['Staged, checked delivery', 'You see each part working in a test environment before it goes live.'],
    ['Remote-first, Bradford-rooted', 'Based in Bradford and working with businesses in Leeds, Manchester, and across the UK.'],
  ];
  return `# An AI-run business, with a human at the helm.

Automancer runs its own finance tracking, project management, and website on AI agents. Waseem makes every decision and takes every call.

## Why "Automancer"?

An automancer works magic through machines. That's the joke, and it's also the job description. When systems talk to each other and repetitive admin happens overnight, it feels like magic. In practice, it is careful software engineering pointed at the dullest, most expensive jobs in your week.

For years, custom automation required a six-figure budget and an internal IT department. Smaller businesses had to make do with disconnected apps and spreadsheets. Better tools now make it affordable for a care provider in Bradford or a manufacturer in Manchester to have software built around their exact workflow.

We built Automancer to deliver that — and we run our own consultancy on the same tools we build for clients.

## The business is the demo

AI agents monitor software spend and draft invoices. Waseem checks, approves, and sends them. Bookkeeping stays manual. Agents track every project, run automated checks on every change, and maintain this website and its field notes.

One rule never changes: **a human makes every decision and takes every call.** The agents draft, calculate, monitor, and test. Waseem decides what ships, approves every invoice, and speaks directly with every client.

## Meet Waseem

Automancer is founded and run by Waseem Ilyas, an engineer who builds software that takes repetitive admin off small teams. Before starting Automancer, he founded and ran a SaaS product company from scratch, shipping and operating software that businesses relied on every day.

He works with clients across social care, manufacturing, professional services, and travel — from a ~600-person care provider's operations platform to a single-page website for a new travel agency. When you work with Automancer, you work directly with Waseem.

## Five rules we actually keep

${principles.map(([n, d], i) => `${i + 1}. **${n}** — ${d}`).join('\n')}
`;
}

function contactBody(): string {
  return `# Tell us what's eating your week.

No calendar gauntlet. No chatbot. No twelve-step sales sequence.

## How to reach a human

- **Web form:** ${abs('/contact')} (requires JavaScript and a browser security check)
- **Email:** ${business.email}
- **Phone:** ${business.phone} — a voicemail line; leave a message and it reaches Waseem, same as the form.

Based in ${business.areasServed[0]} · Leeds · Manchester · UK-wide, remote-first.

## The one-week promise

We promise a meeting within one week of first contact. You speak directly with Waseem within seven days.

## What happens after you hit send

1. **Your message enters our pipeline** — it lands in the same project system our AI agents run. Nothing gets lost in an inbox.
2. **Waseem reads it personally.** No auto-responder pretending to be a person.
3. **You get a personal email back** — to arrange a conversation within one week of first contact.
4. **We take it from there** — usually starting with an Automation Audit, or a quick pointer if that is all you need.

Agents — use email. The form needs a browser; a plain email reaches the same human.
`;
}

async function workIndexBody(): Promise<string> {
  const studies = await getStudies();
  return `# Work

Real systems, live in production. Case studies where every fact is taken from the actual work.

${studies
  .map(
    (e) =>
      `- **[${e.data.title}](${abs(`/work/${e.id}`)})** (${e.data.sector}${e.data.status ? ` · ${e.data.status}` : ''}) — ${e.data.description}`
  )
  .join('\n')}

Each case study is also available as clean Markdown at its URL plus \`.md\`.
`;
}

async function fieldNotesIndexBody(): Promise<string> {
  const notes = await getNotes();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return `# Field Notes

Dispatches from an AI-run business. Written by the agents, decided by the human. Plain notes on what actually works when you point AI at a small business's boring problems.

${notes
  .map((e) => `- **[${e.data.title}](${abs(`/field-notes/${e.id}`)})** (${fmt(e.data.date)}, by ${e.data.author}) — ${e.data.description}`)
  .join('\n')}

Each note is also available as clean Markdown at its URL plus \`.md\`.
`;
}

async function releasesBody(): Promise<string> {
  const releases = await getReleases();
  return [
    '# Release notes',
    '',
    `Every release, newest first. The same notes as data: ${abs('/api/releases.json')}`,
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
