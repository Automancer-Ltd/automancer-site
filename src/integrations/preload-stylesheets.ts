import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AstroIntegration } from 'astro';
import { parse } from 'node-html-parser';

export function preloadStylesheets(): AstroIntegration {
  return {
    name: 'preload-stylesheets',
    hooks: {
      'astro:build:done': ({ dir }) => {
        for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
          if (!entry.isFile() || !entry.name.endsWith('.html')) continue;
          const file = join(entry.parentPath, entry.name);
          const html = readFileSync(file, 'utf8');
          const head = parse(html).querySelector('head');
          if (!head) continue;

          // Astro discovers these content-hashed links at build time. Start their
          // requests before the rest of the head without moving any CSS in the cascade.
          const styles = head.querySelectorAll('link[rel="stylesheet"]')
            .map((link) => link.getAttribute('href') ?? '')
            .filter((href) => /^\/_astro\/[\w.-]+\.css$/.test(href));
          if (!styles.length) continue;
          const viewport = head.querySelector('meta[name="viewport"]');
          const policy = head.querySelector('meta[http-equiv="content-security-policy"]');
          const lastFont = head.querySelectorAll('link[rel="preload"][as="font"]').at(-1);
          if (!viewport || !policy) {
            throw new Error(`Cannot preload styles under the page's CSP in ${file}`);
          }

          // Keep the CSP and every hashed inline block byte-for-byte as Astro emitted them.
          const [, viewportEnd] = viewport.range;
          // Give the above-the-fold type first use of the connection. Starting CSS
          // ahead of those fonts can paint the homepage with a visibly shifting fallback.
          const preloadAt = lastFont?.range[1] ?? viewportEnd;
          const [policyStart, policyEnd] = policy.range;
          if (preloadAt > policyStart) {
            throw new Error(`Expected Astro to emit the page CSP after the resource hints in ${file}`);
          }
          const preloads = [...new Set(styles)]
            .map((href) => `<link rel="preload" as="style" fetchpriority="high" href="${href}">`)
            .join('');
          writeFileSync(file,
            html.slice(0, viewportEnd) + html.slice(policyStart, policyEnd)
            + html.slice(viewportEnd, preloadAt) + preloads
            + html.slice(preloadAt, policyStart) + html.slice(policyEnd),
          );
        }
      },
    },
  };
}
