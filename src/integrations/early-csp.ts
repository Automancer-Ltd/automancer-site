import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import { parse } from 'node-html-parser';

const integrityOf = (bytes: string | Buffer) => `sha256-${createHash('sha256').update(bytes).digest('base64')}`;

export function earlyCsp(): AstroIntegration {
  return {
    name: 'early-csp',
    hooks: {
      'astro:build:done': ({ dir }) => {
        const root = fileURLToPath(dir);
        const entries = readdirSync(dir, { recursive: true, withFileTypes: true });
        const modules = new Map<string, string>();
        for (const entry of entries.filter((file) => file.isFile() && file.name.endsWith('.js'))) {
          const file = join(entry.parentPath, entry.name);
          modules.set('/' + relative(root, file).split(sep).map(encodeURIComponent).join('/'), integrityOf(readFileSync(file)));
        }
        // Import maps cover module fetches without a script tag, including Sentry's lazy import.
        const map = JSON.stringify({ integrity: Object.fromEntries([...modules].sort(([a], [b]) => a.localeCompare(b, 'en'))) });
        for (const entry of entries) {
          if (!entry.isFile() || !entry.name.endsWith('.html')) continue;
          const file = join(entry.parentPath, entry.name);
          const html = readFileSync(file, 'utf8');
          const page = parse(html);
          const head = page.querySelector('head');
          const viewport = head?.querySelector('meta[name="viewport"]');
          if (!viewport) continue; // Redirect stubs have their own policy.
          const policy = head?.querySelector('meta[http-equiv="content-security-policy"]');
          if (!policy) throw new Error(`Missing page CSP in ${file}`);

          // Apply Astro's policy before the browser fetches fonts or reads styles.
          const [, viewportEnd] = viewport.range;
          const [start, end] = policy.range;
          const edits = [{ start, end, text: '' }];
          const firstModule = page.querySelector('script[type="module"], link[rel="modulepreload"]');
          if (modules.size && firstModule) {
            const hash = `'${integrityOf(map)}'`;
            const content = policy.getAttribute('content') ?? '';
            const withMap = content.replace(/\bscript-src /, `script-src ${hash} `);
            if (withMap === content) throw new Error(`Missing script-src in ${file}`);
            policy.setAttribute('content', withMap);
            const [before] = firstModule.range;
            edits.push({ start: before, end: before, text: `<script type="importmap">${map}</script>` });
          }
          edits.push({ start: viewportEnd, end: viewportEnd, text: policy.toString() });
          for (const tag of page.querySelectorAll('script[src], link[rel="modulepreload"]')) {
            const url = tag.getAttribute('src') ?? tag.getAttribute('href');
            const integrity = url && modules.get(url);
            if (!integrity) throw new Error(`Missing built script ${url} in ${file}`);
            const [start, end] = tag.range;
            tag.setAttribute('integrity', integrity);
            edits.push({ start, end, text: tag.toString() });
          }
          let secured = html;
          for (const { start, end, text } of edits.sort((a, b) => b.start - a.start || b.end - a.end)) {
            secured = secured.slice(0, start) + text + secured.slice(end);
          }
          writeFileSync(file, secured);
        }
      },
    },
  };
}
