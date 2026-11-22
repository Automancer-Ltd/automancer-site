import { readFile, readdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { brotliCompress, constants } from 'node:zlib';
import type { AstroIntegration } from 'astro';
import { BROTLI_TYPES, withoutLock } from '../../ops/edge/worker.js';

const compress = promisify(brotliCompress);

/**
 * What the edge Worker sends for a built file, as Brotli at its highest level (t24283).
 * HTML loses OFFSITE_LOCK first, as the Worker takes it out of every page it serves; every
 * other file is sent as built. tests/precompress.test.ts decodes each copy and compares it.
 */
export async function brotliOf(file: string, bytes: Buffer): Promise<Buffer> {
  const body = extname(file) === '.html' ? Buffer.from(withoutLock(bytes.toString('utf8'))) : bytes;
  return compress(body, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
      [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
      [constants.BROTLI_PARAM_SIZE_HINT]: body.length,
    },
  });
}

/**
 * Writes `<file>.br` beside every built file of a type in BROTLI_TYPES (ops/edge/worker.js), which
 * the Worker sends to a browser that takes Brotli in place of Cloudflare's on-the-fly compression.
 * Must stay the last integration: a file changed after this hook would be served stale.
 */
export function precompress(): AstroIntegration {
  return {
    name: 'precompress',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        const files = (await readdir(root, { recursive: true, withFileTypes: true }))
          .filter((entry) => entry.isFile() && Object.hasOwn(BROTLI_TYPES, extname(entry.name)))
          .map((entry) => join(entry.parentPath, entry.name));
        let before = 0;
        let after = 0;
        await Promise.all(files.map(async (file) => {
          const bytes = await readFile(file);
          const packed = await brotliOf(file, bytes);
          before += bytes.length;
          after += packed.length;
          await writeFile(`${file}.br`, packed);
        }));
        logger.info(`${files.length} files: ${before} B → ${after} B as Brotli`);
      },
    },
  };
}
