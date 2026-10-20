// /robots.txt — GENERATED from site config so it cannot drift.
//
// We WANT to be crawled — by search engines and by AI agents alike. Every
// major AI crawler is named and explicitly Allowed; there is not a single
// Disallow rule for content. The machine-readable surfaces this site offers
// are advertised in comments so a crawler reading only this file learns
// where the good stuff lives.
import type { APIRoute } from 'astro';
import { business } from '../data/business';

const aiCrawlers = [
  // OpenAI
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  // Anthropic
  'ClaudeBot',
  'Claude-User',
  'Claude-SearchBot',
  'anthropic-ai',
  // Perplexity
  'PerplexityBot',
  'Perplexity-User',
  // Google / Apple
  'Google-Extended',
  'Applebot-Extended',
  // Others
  'CCBot',
  'Bytespider',
  'Amazonbot',
  'meta-externalagent',
  'cohere-ai',
  'Diffbot',
  'Timpibot',
];

export const GET: APIRoute = () => {
  const lines: string[] = [
    '# automancer.uk — we welcome crawlers, including AI agents.',
    '',
    'User-agent: *',
    'Allow: /',
    '',
    '# Major AI crawlers, explicitly allowed.',
  ];
  for (const ua of aiCrawlers) {
    lines.push(`User-agent: ${ua}`, 'Allow: /');
  }
  lines.push(
    '',
    `# XML sitemap of every page`,
    `Sitemap: ${business.url}/sitemap-index.xml`,
    '',
    '# Machine-readable surfaces for agents:',
    `#   Developer docs ............... ${business.url}/developers`,
    `#   Plain-text site guide ........ ${business.url}/llms.txt`,
    `#   Full site text in one file ... ${business.url}/llms-full.txt`,
    `#   Agent capability manifest .... ${business.url}/agent.json`,
    `#     (canonical copy; also emitted at /.well-known/agent.json for hosts that serve dot-paths)`,
    `#   API discovery document ....... ${business.url}/api/index.json`,
    `#   OpenAPI 3.1 spec ............. ${business.url}/openapi.json`,
    `#   Stability & deprecation ...... ${business.url}/api/stability.json`,
    `#   Markdown twins ............... any page + ".md" (e.g. ${business.url}/about.md)`,
    `#   Feeds ........................ /field-notes/rss.xml · /field-notes/feed.json · /work/rss.xml · /work/feed.json`,
    ''
  );
  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
