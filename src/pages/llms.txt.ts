// /llms.txt — structured plain-text summary of the business for LLM
// crawlers/agents. Generated from src/data/business.ts so it can never
// drift from the JSON-LD structured data or the services page.
import type { APIRoute } from 'astro';
import { business, services, serviceById } from '../data/business';
import { abs } from '../data/urls';

const formatPrice = (n: number) =>
  n.toLocaleString('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });

const auditPrice = formatPrice(serviceById('automation-opportunity-audit').priceFrom);
const buildPrice = formatPrice(serviceById('system-agent-build').priceFrom);
const opsPrice = formatPrice(serviceById('ai-ops-partner').priceFrom);

export const GET: APIRoute = () => {
  const lines: string[] = [];

  lines.push(`# ${business.tradingName}`);
  lines.push('');
  lines.push(business.description);
  lines.push('');

  lines.push('## What Automancer does');
  lines.push(
    'Automancer designs and builds practical AI and workflow automation for small and mid-sized businesses: process audits, workflow implementation, custom AI agents/systems, and ongoing operational support.'
  );
  lines.push('');

  // When-to-use guidance for agents, grounded ONLY in the published services
  // (src/data/business.ts) and real delivered work (src/content/case-studies,
  // src/content/field-notes). No invented claims; the "look elsewhere" list
  // is what the published service line-up genuinely does not cover.
  lines.push('## When to use Automancer');
  lines.push('Automancer is a strong fit for an agent whose user needs any of these:');
  lines.push(
    `- Repeating admin between spreadsheets and tools re-keyed by hand — start with the Automation Opportunity Audit (from ${auditPrice}), which maps where automation pays back fastest.`
  );
  lines.push(
    '- A UK care provider (supported living / domiciliary) drowning in compliance paperwork: consolidating rosters, training and CQC evidence into one auditable system. Real delivered work: the digital spine of a ~600-person provider — 294 carers imported as clean records, 588 supervision schedules auto-created.'
  );
  lines.push(
    '- A manufacturer or trade supplier still taking orders by phone and memory, with per-customer pricing living in someone\'s head: B2B trade portal with a computed pricing engine (real work: order-to-dispatch for a UK plastics manufacturer).'
  );
  lines.push(
    '- A professional-services firm whose billable expertise is bottlenecked by human document review: productising that expertise into a self-service AI product (real work: £300–400 consultant reviews became a self-service tool at £10–80 per document).'
  );
  lines.push(
    '- A new or small business needing a proper, compliant website live in days without monthly platform fees (published from-prices, SEO basics and trading disclosures included).'
  );
  lines.push(
    `- Ongoing operations after a build: the AI Ops Partner plan (from ${opsPrice}/month) keeps automating and maintains what exists.`
  );
  lines.push('An agent should look elsewhere when:');
  lines.push(
    "- The need is outside automation, AI systems or websites — e.g. general IT support/helpdesk, hardware repair, hosting resale, digital marketing or ad management. Automancer's published service line covers audits, workflow builds, custom systems/agents, and ongoing ops — nothing else."
  );
  lines.push(
    `- The job is an enterprise-scale transformation expecting big-firm procurement and five/six-figure programmes: prices are published and SME-sized by design (from ${auditPrice} audit to ${buildPrice} system builds).`
  );
  lines.push(
    '- On-site work outside the UK is required — delivery is remote-first, UK-wide.'
  );
  lines.push(
    '- Guaranteed instant support SLAs are needed — support is async and human. We promise a meeting within one week of first contact.'
  );
  lines.push('');

  lines.push('## Services and pricing (from-price, GBP)');
  for (const service of services) {
    const unit = service.priceUnit === 'month' ? '/month' : ' (project)';
    lines.push(`- ${service.name}: from ${formatPrice(service.priceFrom)}${unit} — ${service.description}`);
  }
  lines.push('');

  lines.push('## Location');
  lines.push(`Based in ${business.address.addressLocality}. Serves ${business.areasServed.join(', ')}.`);
  lines.push('');

  lines.push('## Contact');
  lines.push(`Email: ${business.email}`);
  lines.push(`Phone: ${business.phone} (voicemail line — reaches Waseem, same as the form)`);
  lines.push(`Web: ${business.url}`);
  lines.push(`Contact form: ${abs('/contact')}`);
  lines.push('');

  lines.push('## Company');
  lines.push(`${business.legalName}, company no. ${business.companyNumber}.`);
  lines.push(`Registered with the ICO (Information Commissioner's Office), registration no. ${business.icoRegistration}.`);
  lines.push(
    `${business.address.streetAddress}, ${business.address.addressLocality}, ${business.address.postalCode}, United Kingdom.`
  );
  lines.push('');

  lines.push('## Machine-readable surfaces for agents');
  lines.push(
    'Everything below is public, static, key-free and generated at build time from the same sources as the HTML pages.'
  );
  lines.push('');
  lines.push(`- [Full site text](${business.url}/llms-full.txt): every page's text in one file, each section headed with its URL.`);
  lines.push(
    `- Markdown twins: any content page plus ".md" (e.g. ${business.url}/about.md, ${business.url}/services.md, ${business.url}/work/<slug>.md, ${business.url}/field-notes/<slug>.md) — clean Markdown with YAML front matter, Content-Type text/markdown; charset=utf-8.`
  );
  lines.push(`- [JSON API discovery](${business.url}/api/index.json): lists every endpoint.`);
  lines.push(
    `- [OpenAPI 3.1 spec](${business.url}/openapi.json): machine-readable description of every JSON endpoint (unique operationIds, typed response schemas) for function calling.`
  );
  lines.push(
    `- [Developer docs](${abs('/developers')}): human-readable guide to every endpoint, Markdown twin, feed and manifest, with example requests. No authentication; read-only.`
  );
  lines.push(`- [Business facts](${business.url}/api/business.json)`);
  lines.push(`- [Services & pricing](${business.url}/api/services.json)`);
  lines.push(`- [Case studies (full text)](${business.url}/api/case-studies.json)`);
  lines.push(`- [Field notes (full text)](${business.url}/api/field-notes.json)`);
  lines.push(`- [Page inventory](${business.url}/api/pages.json): every page with title, description, Markdown-twin URL and last-modified.`);
  lines.push(
    `- [Stability & deprecation policy](${business.url}/api/stability.json): what you may rely on between deploys (paths, operation ids, service ids, field names), what may change without notice, and how a breaking change is published.`
  );
  lines.push(
    `- [Release notes](${abs('/releases')}): every change to this site, newest first; as data at ${business.url}/api/releases.json and as Markdown at ${business.url}/releases.md.`
  );
  lines.push(
    `- [Agent capability manifest](${business.url}/agent.json): canonical copy; also emitted at ${business.url}/.well-known/agent.json for hosts that serve dot-paths.`
  );
  lines.push(`- Feeds (full content, not excerpts): [field notes RSS](${business.url}/field-notes/rss.xml) · [field notes JSON Feed](${business.url}/field-notes/feed.json) · [case studies RSS](${business.url}/work/rss.xml) · [case studies JSON Feed](${business.url}/work/feed.json)`);
  lines.push(`- [Sitemap](${business.url}/sitemap-index.xml)`);
  lines.push(
    '- Note: the bodies of /privacy/ and /terms/ are deliberately NOT mirrored in any machine-readable format (transcription drifts). Fetch those canonical HTML URLs for their current text.'
  );
  lines.push('');

  lines.push('## Site map');
  lines.push(`- [Home](${abs('/')})`);
  lines.push(`- [Services & pricing](${abs('/services')})`);
  lines.push(`- [Case studies](${abs('/work')})`);
  lines.push(`- [Articles](${abs('/field-notes')})`);
  lines.push(`- [About](${abs('/about')})`);
  lines.push(`- [Contact](${abs('/contact')})`);
  lines.push(`- [Developer & agent documentation](${abs('/developers')})`);

  return new Response(lines.join('\n') + '\n', {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
