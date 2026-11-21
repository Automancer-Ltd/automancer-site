import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AstroIntegration } from 'astro';
import { parse } from 'node-html-parser';

export function earlyCsp(): AstroIntegration {
  return {
    name: 'early-csp',
    hooks: {
      'astro:build:done': ({ dir }) => {
        for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
          if (!entry.isFile() || !entry.name.endsWith('.html')) continue;
          const file = join(entry.parentPath, entry.name);
          const html = readFileSync(file, 'utf8');
          const head = parse(html).querySelector('head');
          const viewport = head?.querySelector('meta[name="viewport"]');
          if (!viewport) continue; // Redirect stubs have their own policy.
          const policy = head?.querySelector('meta[http-equiv="content-security-policy"]');
          if (!policy) throw new Error(`Missing page CSP in ${file}`);

          // Apply Astro's policy before the browser fetches fonts or reads styles.
          const [, viewportEnd] = viewport.range;
          const [start, end] = policy.range;
          if (start > viewportEnd) {
            writeFileSync(file, html.slice(0, viewportEnd) + html.slice(start, end)
              + html.slice(viewportEnd, start) + html.slice(end));
          }
        }
      },
    },
  };
}
