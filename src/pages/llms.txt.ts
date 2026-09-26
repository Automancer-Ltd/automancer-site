// /llms.txt — structured plain-text summary of the business for LLM
// crawlers/agents. Generated from src/data/business.ts so it can never
// drift from the JSON-LD structured data or the services page.
import type { APIRoute } from 'astro';
import { business, services } from '../data/business';
import { abs } from '../data/urls';

const formatPrice = (n: number) =>
  n.toLocaleString('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });

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
    '- Repeating admin between spreadsheets and tools re-keyed by hand — start with the Automation Opportunity Audit (from £450), which maps where automation pays back fastest.'
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
    '- Ongoing operations after a build: the AI Ops Partner plan (from £495/month) keeps automating and maintains what exists.'
  );
  lines.push('An agent should look elsewhere when:');
  lines.push(
    "- The need is outside automation, AI systems or websites — e.g. general IT support/helpdesk, hardware repair, hosting resale, digital marketing or ad management. Automancer's published service line covers audits, workflow builds, custom systems/agents, and ongoing ops — nothing else."
  );
  lines.push(
    '- The job is an enterprise-scale transformation expecting big-firm procurement and five/six-figure programmes: prices are published and SME-sized by design (from £450 audit to £4,500 system builds).'
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
  lines.push(`Contact form: ${business.url}/contact`);
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
  lines.push(`- Full site text: ${business.url}/llms-full.txt — every page's text in one file, each section headed with its URL.`);
  lines.push(
    `- Markdown twins: any content page plus ".md" (e.g. ${business.url}/about.md, ${business.url}/services.md, ${business.url}/work/<slug>.md, ${business.url}/field-notes/<slug>.md) — clean Markdown with YAML front matter, Content-Type text/markdown; charset=utf-8.`
  );
  lines.push(`- JSON API discovery: ${business.url}/api/index.json — lists every endpoint.`);
  lines.push(
    `- OpenAPI 3.1 spec: ${business.url}/openapi.json — machine-readable description of every JSON endpoint (unique operationIds, typed response schemas) for function calling.`
  );
  lines.push(
    `- Developer docs: ${business.url}/developers — human-readable guide to every endpoint, Markdown twin, feed and manifest, with example requests. No authentication; read-only.`
  );
  lines.push(`- Business facts: ${business.url}/api/business.json`);
  lines.push(`- Services & pricing: ${business.url}/api/services.json`);
  lines.push(`- Case studies (full text): ${business.url}/api/case-studies.json`);
  lines.push(`- Field notes (full text): ${business.url}/api/field-notes.json`);
  lines.push(`- Page inventory: ${business.url}/api/pages.json — every page with title, description, Markdown-twin URL and last-modified.`);
  lines.push(
    `- Agent capability manifest: ${business.url}/agent.json (canonical copy; also emitted at ${business.url}/.well-known/agent.json for hosts that serve dot-paths)`
  );
  lines.push('- Feeds: /field-notes/rss.xml · /field-notes/feed.json · /work/rss.xml · /work/feed.json (full content, not excerpts).');
  lines.push(`- Sitemap: ${business.url}/sitemap-index.xml`);
  lines.push(
    '- Note: the bodies of /privacy/ and /terms/ are deliberately NOT mirrored in any machine-readable format (transcription drifts). Fetch those canonical HTML URLs for their current text.'
  );
  lines.push('');

  lines.push('## Site map');
  lines.push(`- ${abs('/')} — Home`);
  lines.push(`- ${abs('/services')} — Services & pricing`);
  lines.push(`- ${abs('/work')} — Case studies`);
  lines.push(`- ${abs('/field-notes')} — Articles`);
  lines.push(`- ${abs('/about')} — About`);
  lines.push(`- ${abs('/contact')} — Contact`);
  lines.push(`- ${abs('/developers')} — Developer & agent documentation`);

  return new Response(lines.join('\n') + '\n', {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
