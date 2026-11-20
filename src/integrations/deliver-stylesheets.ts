import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import { parse } from 'node-html-parser';

export function deliverStylesheets(): AstroIntegration {
  return {
    name: 'deliver-stylesheets',
    hooks: {
      'astro:build:done': ({ dir }) => {
        const homeFile = fileURLToPath(new URL('index.html', dir));
        for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
          if (!entry.isFile() || !entry.name.endsWith('.html')) continue;
          const file = join(entry.parentPath, entry.name);
          const html = readFileSync(file, 'utf8');
          const head = parse(html).querySelector('head');
          if (!head) continue;

          const styles = head.querySelectorAll('link[rel="stylesheet"]')
            .map((link) => ({ link, href: link.getAttribute('href') ?? '' }))
            .filter(({ href }) => /^\/_astro\/[\w.-]+\.css$/.test(href));
          if (!styles.length) continue;
          const viewport = head.querySelector('meta[name="viewport"]');
          const policy = head.querySelector('meta[http-equiv="content-security-policy"]');
          const lastFont = head.querySelectorAll('link[rel="preload"][as="font"]').at(-1);
          if (!viewport || !policy) {
            throw new Error(`Cannot deliver styles under the page's CSP in ${file}`);
          }

          const [, viewportEnd] = viewport.range;
          // Give the above-the-fold type first use of the connection. Starting CSS
          // ahead of those fonts can paint the homepage with a visibly shifting fallback.
          const preloadAt = lastFont?.range[1] ?? viewportEnd;
          const [policyStart, policyEnd] = policy.range;
          if (preloadAt > policyStart) {
            throw new Error(`Expected Astro to emit the page CSP after the resource hints in ${file}`);
          }

          const inline = file === homeFile;
          let policyTag = html.slice(policyStart, policyEnd);
          let tail = html.slice(policyEnd);
          let preloads = '';
          if (inline) {
            // Save the stylesheet round trip on the main landing page. Replace
            // links in place to keep the cascade, and hash the exact inline bytes.
            const hashes = [];
            for (const { link, href } of styles.toReversed()) {
              const css = readFileSync(new URL(href.slice(1), dir), 'utf8');
              const [start, end] = link.range;
              if (start < policyEnd || Object.keys(link.attributes).length !== 2 || /<\/style/i.test(css)) {
                throw new Error(`Cannot inline ${href} in the homepage`);
              }
              tail = tail.slice(0, start - policyEnd) + `<style>${css}</style>` + tail.slice(end - policyEnd);
              hashes.push(`'sha256-${createHash('sha256').update(css).digest('base64')}'`);
            }
            const directive = policyTag.includes('style-src-elem ') ? 'style-src-elem ' : 'style-src ';
            if (!policyTag.includes(directive)) throw new Error('Homepage CSP has no stylesheet directive');
            policyTag = policyTag.replace(directive, `${directive}${hashes.join(' ')} `);
          } else {
            // Interior pages share the cached CSS. Start it before metadata without
            // moving stylesheet links or changing any existing inline hashes.
            preloads = [...new Set(styles.map(({ href }) => href))]
              .map((href) => `<link rel="preload" as="style" fetchpriority="high" href="${href}">`)
              .join('');
          }
          writeFileSync(file,
            html.slice(0, viewportEnd) + policyTag
            + html.slice(viewportEnd, preloadAt) + preloads
            + html.slice(preloadAt, policyStart) + tail,
          );
        }
      },
    },
  };
}
