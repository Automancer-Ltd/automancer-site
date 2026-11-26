/**
 * The words of the hand-authored pages that their Markdown twins repeat (t27008): each list is
 * written once here and read by both the page and src/data/static-markdown.ts, so a person and a
 * machine read the same sentence. tests/twin-parity.test.ts holds every other sentence of a page
 * to its twin, both ways.
 */
import { formatGBP, serviceById, type ServiceOffering as Service } from './business';

const audit = serviceById('automation-opportunity-audit');
const sprint = serviceById('workflow-implementation-sprint');
const systemBuild = serviceById('system-agent-build');
const ops = serviceById('ai-ops-partner');

/** Home: the starting-price ladder, one line under each service. */
export const HOME_LADDER: readonly { service: Service; description: string }[] = [
  { service: audit, description: "We map where your time and money are leaking, and hand you a costed plan. Fee credited against any project you go on to do." },
  { service: sprint, description: '1–3 automations live in roughly two weeks.' },
  { service: systemBuild, description: 'A custom system or AI agent, built to last.' },
  { service: ops, description: 'We run it, watch it, and keep automating. Cancel anytime.' },
];

/** Home: how the company itself runs on agents. */
export const HOME_PROOF: readonly { n: string; tag: string; h: string; p: string }[] = [
  { n: '01', tag: 'finance', h: 'Monitored, not automated', p: 'Agents monitor software spend and draft invoices. Waseem approves and sends them. Bookkeeping stays manual.' },
  { n: '02', tag: 'delivery', h: 'Tracked end to end', p: 'Agents track every project and check each release before Waseem signs it off for a client.' },
  { n: '03', tag: 'content', h: 'This site & blog', p: "Written, built, and maintained by the same agents we put to work in your business." },
  { n: '04', tag: 'control', h: 'One human in the loop', p: 'Every decision and every call goes through Waseem. No call centre and no ticket queue.' },
];

/** Home: what we do. */
export const HOME_CAPS: readonly { name: string; desc: string }[] = [
  { name: 'Workflow automation', desc: 'Repetitive admin across your existing tools, connected into one reliable flow.' },
  { name: 'Custom systems & portals', desc: 'Software built around how your team works, rather than forcing you into an off-the-shelf template.' },
  { name: 'AI agents', desc: 'Software that reads, drafts, and acts while a person stays in control of every important decision.' },
  { name: 'AI Ops partnership', desc: 'We stay on, keep your systems running, and automate the next job. Cancel anytime.' },
];

/** A passage with links in it: plain text, and the words that link somewhere. */
export type Linked = string | readonly (string | { text: string; href: string })[];

/** Services: each offer in detail, in ladder order. */
export const SERVICE_OFFERS: readonly {
  service: Service;
  step: string;
  amt: string;
  per?: string;
  note: string;
  one: string;
  who: string;
  catch: Linked;
  cta: string;
}[] = [
  {
    service: audit,
    step: 'Rung 01 · start here',
    amt: formatGBP(audit.priceFrom),
    note: 'from · credited in full against any project you go on to do',
    one: 'We find where your time and money are leaking and hand you a costed plan to fix it.',
    who: "You know time is being lost to double-entry, spreadsheet updates, and chasing tasks, but you want to know what is worth fixing first. Start here.",
    catch: `If you go on to book a Sprint or a Build with us, the audit fee is deducted in full from the project price. Otherwise, you keep a clear plan for ${formatGBP(audit.priceFrom)}.`,
    cta: 'Book an Audit',
  },
  {
    service: sprint,
    step: 'Rung 02 · act fast',
    amt: formatGBP(sprint.priceFrom),
    note: 'from',
    one: '1–3 automations, live and working, in roughly two weeks.',
    who: 'You already know which repetitive admin jobs are slowing your team down and you want them automated quickly.',
    catch: 'Typical jobs: turning enquiries into quotes, preparing invoices and reconciliations, syncing data between two systems, routing approvals, and generating weekly reports automatically.',
    cta: 'Start a Sprint',
  },
  {
    service: systemBuild,
    step: 'Rung 03 · build it right',
    amt: formatGBP(systemBuild.priceFrom),
    note: 'from',
    one: 'A custom system or AI agent built around how your business runs.',
    who: 'You have outgrown spreadsheets or off-the-shelf tools that do not fit your process. You need a customer portal, an internal operations system, or an AI agent with human sign-off.',
    // Each figure links to the line of evidence behind it on its case study (t23577).
    catch: [
      'Recent builds: a customer trade portal that replaced phone-and-memory ordering, a care provider’s operations platform with ',
      { text: '294 carer records', href: '/work/care-provider-transformation/#source-carer-record-count' },
      ' and ',
      { text: '588 scheduled supervisions', href: '/work/care-provider-transformation/#source-supervision-schedule-count' },
      ', and a self-service AI product that runs ',
      { text: 'a £300–400 consultant review for £10–80', href: '/work/debiaser-ai-product/#source-debiaser-per-engagement-cost' },
      '.',
    ],
    cta: 'Scope a Build',
  },
  {
    service: ops,
    step: 'Rung 04 · stay live',
    amt: formatGBP(ops.priceFrom),
    per: '/mo',
    note: 'from · cancel anytime',
    one: 'We stay on, keep your systems running, and automate the next bottleneck.',
    who: 'You have live automation and want it monitored, maintained, and steadily improved without hiring an in-house engineer.',
    catch: 'Because our own monitoring and operations run on AI agents, we can watch and maintain your systems at a low monthly cost.',
    cta: 'Become a Partner',
  },
];

/** Services: the questions everyone asks. */
export const SERVICE_FAQS: readonly { q: string; a: string }[] = [
  { q: 'Is it really this cheap?', a: 'Yes. We run our own finance tracking, project management, and website on AI agents, which keeps our overheads low. The prices on this page are real starting prices for published work.' },
  { q: 'What if it breaks?', a: 'Every system we ship is monitored, backed up, and tested. On an AI Ops Partner plan, we watch it day to day and fix issues as they arise. When you need help, you speak directly with Waseem rather than a ticket queue.' },
  { q: 'Do I need to understand AI?', a: 'No. You know your business and where time is being lost; we handle the software and explain every step in plain English.' },
  { q: 'Will a human actually answer?', a: 'Always. Agents do the background work, while Waseem makes every decision and takes every call. When you get in touch, he reads it himself and replies personally. We promise a meeting within one week of first contact.' },
  { q: 'Where are you, and do you work remotely?', a: 'We are based in Bradford and work with businesses in Leeds, Manchester, and across the UK. Most of our work runs remotely.' },
  { q: 'What if I just want a website?', a: 'We build those too: fast, compliant websites with no monthly platform fees.' },
];

/** About: the five rules. */
export const ABOUT_PRINCIPLES: readonly { name: string; desc: string }[] = [
  { name: 'Sensible prices, published', desc: 'Our starting prices are on the website so you can see them before you get in touch.' },
  { name: 'A human in the loop, always', desc: 'Agents do the work; Waseem makes the decisions and takes the calls. We promise a meeting within one week of first contact.' },
  { name: 'Built properly, not prototyped', desc: 'Audited, monitored, backed up, and tested to the same standard as our own systems.' },
  { name: 'Staged, checked delivery', desc: 'You see each part working in a test environment before it goes live.' },
  { name: 'Remote-first, Bradford-rooted', desc: 'Based in Bradford and working with businesses in Leeds, Manchester, and across the UK.' },
];

/** A linked passage as Markdown, each link made absolute with `abs` (absHref: it keeps a fragment). */
export function linkedMarkdown(text: Linked, abs: (path: string) => string): string {
  return typeof text === 'string' ? text : text.map((part) => (typeof part === 'string' ? part : `[${part.text}](${abs(part.href)})`)).join('');
}
