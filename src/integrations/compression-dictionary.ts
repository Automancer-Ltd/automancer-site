import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { constants, zstdCompress } from 'node:zlib';
import type { AstroIntegration } from 'astro';
import { parse } from 'node-html-parser';
import { DCZ_MAGIC, DICTIONARY_DIR, withoutLock } from '../../ops/edge/worker.js';

const compress = promisify(zstdCompress);

/**
 * The shared compression dictionary (t26098, RFC 9842 Compression Dictionary Transport).
 *
 * Every page carries the same frame: about 46 KB of inlined CSS, the header, the menu and the
 * footer, so a visitor's second page repeats most of the first. Brotli cannot see that across
 * pages; a dictionary can. The build uses the home page frame, omitting its <main> and build
 * provenance so browsers can reuse the same dictionary when only those parts of the page change.
 * Every page names it in a <link rel="compression-dictionary">.
 * A browser that keeps it (Chromium) fetches it once while idle and then asks for each page with
 * `Available-Dictionary: :<its SHA-256>:`; the edge Worker answers with `<page>.dcz`, the page
 * compressed with Zstandard against that dictionary (precompress()), when the hashes match, and
 * with the Brotli copy otherwise.
 */
export function dictionaryOf(home: string): string {
  let frame = withoutLock(home);
  const omitted = parse(frame).querySelectorAll(
    'main, meta[name="build-revision"], .proof-strip b, .proof-strip .sr-only',
  );
  if (!omitted.some((node) => node.rawTagName === 'main')) {
    throw new Error('compression dictionary: the home page has no <main>');
  }
  // Keep the rendered bytes of the rest of the frame, including inlined CSS.
  for (const { range: [start, end] } of omitted.sort((a, b) => b.range[0] - a.range[0])) {
    frame = frame.slice(0, start) + frame.slice(end);
  }
  return frame;
}

/** The URL a dictionary is served at, named by its content so browsers may keep it for a year. */
export function dictionaryUrl(dictionary: Buffer): string {
  return `/${DICTIONARY_DIR}/${createHash('sha256').update(dictionary).digest('hex').slice(0, 16)}.txt`;
}

/**
 * A `dcz` body (RFC 9842 section 5): the eight-byte magic, the SHA-256 of the dictionary the
 * browser holds, then a Zstandard frame compressed with that dictionary as raw content.
 */
export async function dczOf(body: Buffer, dictionary: Buffer): Promise<Buffer> {
  const frame = await compress(body, {
    dictionary,
    params: { [constants.ZSTD_c_compressionLevel]: 19, [constants.ZSTD_c_checksumFlag]: 1 },
  });
  return Buffer.concat([Buffer.from(DCZ_MAGIC), createHash('sha256').update(dictionary).digest(), frame]);
}

const LINK = (href: string) => `<link rel="compression-dictionary" href="${href}">`;

/**
 * Writes the release's dictionary under /_dictionary/ and names it in every page's <head>. Runs
 * after every integration that changes a page and before precompress(), which compresses each
 * page against it.
 */
export function compressionDictionary(): AstroIntegration {
  return {
    name: 'compression-dictionary',
    hooks: {
      'astro:build:done': ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        const dictionary = Buffer.from(dictionaryOf(readFileSync(join(root, 'index.html'), 'utf8')));
        const href = dictionaryUrl(dictionary);
        mkdirSync(join(root, DICTIONARY_DIR), { recursive: true });
        writeFileSync(join(root, href), dictionary);
        let pages = 0;
        for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
          if (!entry.isFile() || !entry.name.endsWith('.html')) continue;
          const file = join(entry.parentPath, entry.name);
          const html = readFileSync(file, 'utf8');
          // Redirect stubs carry no viewport and are never read twice.
          if (!html.includes('<meta name="viewport"')) continue;
          const headEnd = html.indexOf('</head>');
          if (headEnd === -1) throw new Error(`compression dictionary: no </head> in ${file}`);
          writeFileSync(file, html.slice(0, headEnd) + LINK(href) + html.slice(headEnd));
          pages += 1;
        }
        logger.info(`${href}: ${dictionary.length} B, named by ${pages} pages`);
      },
    },
  };
}

/** The dictionary a built page names, or null. */
export function namedDictionary(html: string): string | null {
  return /<link rel="compression-dictionary" href="([^"]+)">/.exec(html)?.[1] ?? null;
}
