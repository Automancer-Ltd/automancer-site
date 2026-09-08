/**
 * Markdown renditions of the HAND-AUTHORED pages (/, /about, /services,
 * /contact, /work index, /field-notes index).
 *
 * Content-collection pages (/work/<slug>, /field-notes/<slug>) do NOT go
 * through here — their twins are derived straight from the collection entry
 * via site-content.ts, so they cannot drift from the article HTML.
 *
 * These pages are prose rendered from .astro templates; their twins are
 * curated renditions assembled from the SAME shared data modules the pages
 * render (business facts, services/pricing, collection listings) plus a
 * faithful condensed narrative. Facts (names, prices, contact details,
 * promises) always come from business.ts — never retyped. The one known
 * limitation is stated in docs/AGENT-READINESS.md: page prose here is a
 * rendition, not a scrape of the rendered HTML.
 */
import { business, services, formatGBP } from './business';
import { abs } from './urls';
import { frontMatter, mdResponse, getStudies, getNotes, staticPages, type PageMeta } from './site-content';
import type { APIRoute } from 'astro';

const unit = (s: (typeof services)[number]) => (s.priceUnit === 'month' ? '/month' : ' per project');

const priceLine = () =>
  services.map((s) => `- **${s.name}** — from ${formatGBP(s.priceFrom)}${unit(s)}: ${s.description}`).join('\n');

/* ── Page bodies ─────────────────────────────────────────────────────── */

async function homeBody(): Promise<string> {
  const studies = await getStudies();
  return `# Your admin, automated into oblivion.

We make small businesses run like magic. It's not magic. It's very good engineering.

Automancer builds the software and AI agents that do the boring, expensive, error-prone work your team shouldn't be doing by hand. Real systems, sensible prices, and a human who answers.

## This whole company is run by AI. On purpose.

Most consultancies will tell you AI is the future. We handed ours the keys — the finance ops, the project tracking, this website, the field notes. We don't demo automation in a slide deck; we live inside it. A human — Waseem — makes every decision and takes every call.

- **Finance, monitored not automated** — Agents monitor software spend and prepare invoices. Waseem approves and issues them. Bookkeeping remains manual.
- **Self-tracking delivery** — every project lane is governed and monitored by agents, board-gated before anything touches a client.
- **This site & blog** — written, built and maintained by the same agents we'd put to work in your business.
- **One human in the loop** — every decision. Every call. No call centre, no "your ticket is important to us".

## What we do

If a person on your team spends hours copying data between systems, re-keying spreadsheets, chasing approvals, or answering the same question for the hundredth time — that's a job for a machine.

1. **Workflow automation** — the repetitive, multi-step admin between your tools, stitched into one clean flow.
2. **Custom systems & portals** — proper software built for how you actually work, not an off-the-shelf box you bend yourself around.
3. **AI agents** — software that reads, decides, drafts and acts, with a human keeping control of anything that matters.
4. **AI Ops partnership** — we stay on, keep it running, and automate the next thing. Cancel anytime.

## Sensible prices, published

Enterprise automation firms quote enterprise numbers. We don't:

${priceLine()}

## Selected work

${studies
  .slice(0, 3)
  .map((e) => `- [${e.data.headline ?? e.data.title}](${abs(`/work/${e.id}`)}) — ${e.data.summary ?? e.data.description}`)
  .join('\n')}

Full list: ${abs('/work')}
`;
}

function servicesBody(): string {
  const ladder = [
    {
      name: 'Automation Opportunity Audit',
      amt: formatGBP(services[0].priceFrom),
      note: 'from · credited in full against any project you go on to do',
      one: 'We find where your time and money are leaking — and hand you a costed plan to plug it.',
      includes:
        '- A working session mapping how your business actually runs — the tools, the handoffs, the bottlenecks.\n- A ranked list of automation opportunities, each with an estimate of what it costs you now.\n- A costed, plain-English plan: what to do first, what it\u2019ll take, and what it\u2019ll cost.\n- No obligation to do any of it with us. It\u2019s your plan to keep.',
    },
    {
      name: 'Workflow Sprint',
      amt: formatGBP(services[1].priceFrom),
      note: 'from',
      one: '1–3 automations, live and working, in roughly two weeks.',
      includes:
        '- We take 1–3 specific, well-defined workflows and automate them end to end.\n- Built on tools you already use where we can; new pieces added only where they earn their place.\n- Live in production in around two weeks, with you testing it as we go.\n- Handover so your team knows how it works — and how to trust the numbers coming out of it.',
    },
    {
      name: 'System / Agent Build',
      amt: formatGBP(services[2].priceFrom),
      note: 'from',
      one: 'A proper custom system or AI agent, built to run your business — not bent around someone else\u2019s.',
      includes:
        '- Custom software designed around how you actually work.\n- Built audited, monitored, backed up and tested — not a prototype that falls over the first busy Monday.\n- AI agents where they add value, with a human kept firmly in control of anything that matters.\n- Delivered in governed stages so you see it working before it goes live.',
    },
    {
      name: 'AI Ops Partner',
      amt: `${formatGBP(services[3].priceFrom)}/mo`,
      note: 'from · cancel anytime',
      one: 'We don\u2019t build it and vanish. We stay on, keep it running, and automate the next thing.',
      includes:
        '- Monitoring and maintenance of everything we\u2019ve built for you.\n- A steady drip of new automation — we keep finding and removing the next bottleneck.\n- A human (Waseem) who knows your setup and answers when you need something.\n- Cancel anytime. No twelve-month lock-in, no exit fee.',
    },
  ];

  const faqs = [
    ['Is it really this cheap?', 'Yes — we run our own company on AI agents (finance ops, project tracking, even this website), which makes us fast and lean, and we price accordingly. These are real published from prices, not bait.'],
    ['What if it breaks?', 'We build properly — audited, monitored, backed up, tested. On an AI Ops Partner retainer, keeping it running is literally our job. And if something goes wrong, a human answers — not a ticket queue.'],
    ['Do I need to understand AI?', 'Not even slightly. You need to understand your business; we handle the AI, the engineering and the jargon, in plain English.'],
    ['Will a human actually answer?', 'Always. Agents do the work, but Waseem makes every decision and takes every call. We promise a meeting within one week of first contact.'],
    ['Where are you, and do you work remotely?', `Based in ${business.address.addressLocality}, working with businesses in ${business.areasServed.slice(1).join(', ')}. Remote-first.`],
    ['What if I just want a website?', 'We do those too — fast, affordable, compliant landing sites with no monthly platform fees.'],
  ];

  return `# Services & pricing

Four ways in. All of them start with a price you can actually see.

Every price below is a *from* price for real, published work — not a teaser rate. Where your job is bigger, we'll tell you before we start, not after.

Most people start with an Audit, act on a Sprint or a Build, and — if it's working — keep us on as their AI Ops Partner. You can jump on at any rung.

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
    ['Sensible prices, published', 'No enterprise mark-up, no "let\'s get you on a call" before we\'ll say a number. Our prices are on the website.'],
    ['A human in the loop, always', 'Agents do the work; Waseem makes the decisions and takes the calls. We promise a meeting within one week of first contact.'],
    ['Built properly, not prototyped', 'Audited, monitored, backed up, tested. The same standard we hold our own infrastructure to.'],
    ['Governed, staged delivery', 'You see it working before it goes live. No big-bang launches, no nasty surprises.'],
    ['Remote-first, Bradford-rooted', 'Based in Bradford, serving Leeds, Manchester and the UK. Where you are is not a problem we\u2019ve ever had.'],
  ];
  return `# An AI-run business, with a human at the helm.

Most consultancies talk about AI. Automancer is one. The finance, the project tracking, the website you're reading — all run by agents. Every decision and every call — run by Waseem.

## Why "Automancer"?

An automancer works magic through machines. That's the joke, and it's also the honest job description. We make small businesses run like they're enchanted — admin that does itself, systems that talk to each other, work that just quietly happens overnight — and then we tell you plainly that it isn't magic at all. It's very good engineering, pointed at the boring problems that cost you the most.

Small businesses have been priced out of proper automation for years. We think that's daft. The technology to fix it is here, it's cheaper than ever, and there's no reason a care provider in Bradford or a manufacturer in Manchester shouldn't have systems as sharp as anyone's.

So we built a consultancy to prove it — by running the consultancy itself on exactly the tools we sell.

## The business is the demo

Automancer's own back office is run by AI agents: finance operations, project tracking, this website, the field notes. And then there's the line we will never cross: **a human makes every decision and takes every call.** That human is Waseem. The agents draft, calculate, monitor and propose. Waseem decides.

We're this open for two reasons. One, honesty: you deserve to know what's automated and what isn't. Two, it *is* the pitch — we already ran the experiment on ourselves.

## Meet Waseem

Automancer is founded and run by Waseem Ilyas — an engineer who got tired of watching good small businesses drown in admin that a machine could do in seconds. Before Automancer, he spun out and ran a live SaaS product business, so he has shipped real software that real people pay for and depend on.

He works with clients across social care, manufacturing, professional services and travel — from a ~600-person care provider's digital transformation to a one-page website for a brand-new travel agency. When you work with Automancer, you work with Waseem.

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

Based in ${business.address.addressLocality} · Leeds · Manchester · UK-wide, remote-first.

## The one-week promise

One week to a meeting, from first contact. Not a number in the diary three weeks out, not an automated "someone will be in touch" — an actual conversation with an actual human, within seven days.

## What happens after you hit send

1. **Your message enters our pipeline** — it lands in the same project system our AI agents run. Nothing gets lost, nothing sits ignored in an inbox.
2. **Waseem reads it. Personally.** No auto-responder pretending to be a person.
3. **You get a personal email back** — to arrange a proper conversation within one week of first contact.
4. **We take it from there** — usually an Automation Audit, but if a quick pointer is all you need, we'll happily give you that too.

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
      `- **[${e.data.headline ?? e.data.title}](${abs(`/work/${e.id}`)})** (${e.data.sector}${e.data.status ? ` · ${e.data.status}` : ''}) — ${e.data.description}`
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

/* ── Registry ────────────────────────────────────────────────────────── */

type BodyFn = () => Promise<string> | string;

/** path → body generator, for the static .md twin routes AND llms-full.txt. */
export const staticBodies: Record<string, BodyFn> = {
  '/': homeBody,
  '/services/': servicesBody,
  '/about/': aboutBody,
  '/contact/': contactBody,
  '/work/': workIndexBody,
  '/field-notes/': fieldNotesIndexBody,
};

function metaFor(path: string): PageMeta {
  const meta = staticPages.find((p) => p.path === path);
  if (!meta) throw new Error(`No PageMeta registered for ${path}`);
  return meta;
}

/**
 * Full Markdown twin of one hand-authored page: YAML front matter
 * (title, description, url, canonical, type) + body. Legal/compliance pages
 * have NO twin by design — see site-content.ts legalNoMirror.
 */
export function staticTwinMarkdown(path: string, body: string): string {
  const meta = metaFor(path);
  const url = abs(path);
  return frontMatter({ title: meta.title, description: meta.description, url, canonical: url, type: meta.type }) + body;
}

export async function serveStaticTwin(path: string): Promise<Response> {
  const bodyFn = staticBodies[path];
  if (!bodyFn) return new Response('Not found', { status: 404 });
  return mdResponse(staticTwinMarkdown(path, await bodyFn()));
}

/** Convenience factory so each twin route file stays three lines long. */
export function twinRoute(path: string): APIRoute {
  return () => serveStaticTwin(path);
}
