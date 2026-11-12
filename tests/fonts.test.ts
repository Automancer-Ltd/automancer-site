/**
 * The web fonts are cut down to the characters the site shows (ops/fonts/subset.py,
 * ops/fonts/charset.txt; t19380). A character a font lacks would render in a
 * fallback font, so a new page or field note with, say, "é" or "½" must fail here
 * first, saying which character, where, and how to add it.
 *
 * Reads the character map straight out of each built woff2 that the page CSS
 * references, so the check is against the bytes visitors download.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { DIST, ROOT, allHtmlFiles } from './support/dist';

/** UIntBase128 from the WOFF2 table directory. */
function base128(buf: Buffer, at: { pos: number }): number {
  let value = 0;
  for (let i = 0; i < 5; i++) {
    const byte = buf[at.pos++]!;
    value = value * 128 + (byte & 0x7f);
    if (!(byte & 0x80)) return value;
  }
  throw new Error('bad UIntBase128');
}

/** Every code point a WOFF2 font maps to a glyph (cmap formats 4 and 12). */
function woff2Codepoints(file: Buffer): Set<number> {
  if (file.toString('latin1', 0, 4) !== 'wOF2') throw new Error('not a woff2 file');
  const numTables = file.readUInt16BE(12);
  const compressedSize = file.readUInt32BE(20);
  const at = { pos: 48 };
  const tables: { tag: number | string; length: number }[] = [];
  for (let i = 0; i < numTables; i++) {
    const flags = file[at.pos++]!;
    const known = flags & 0x3f;
    const tag = known === 63 ? file.toString('latin1', at.pos, (at.pos += 4)) : known;
    const origLength = base128(file, at);
    const version = flags >> 6;
    // glyf (10) and loca (11) are transformed at version 0; every other table at version 1+.
    const transformed = tag === 10 || tag === 11 ? version !== 3 : version !== 0;
    tables.push({ tag, length: transformed ? base128(file, at) : origLength });
  }
  const data = brotliDecompressSync(file.subarray(at.pos, at.pos + compressedSize));
  let offset = 0;
  let cmap: Buffer | null = null;
  for (const t of tables) {
    if (t.tag === 0) cmap = data.subarray(offset, offset + t.length);
    offset += t.length;
  }
  if (!cmap) throw new Error('no cmap table');

  const out = new Set<number>();
  const records = cmap.readUInt16BE(2);
  for (let i = 0; i < records; i++) {
    const sub = cmap.subarray(cmap.readUInt32BE(4 + i * 8 + 4));
    const format = sub.readUInt16BE(0);
    if (format === 4) {
      const segs = sub.readUInt16BE(6) / 2;
      const ends = 14;
      const starts = ends + segs * 2 + 2;
      const deltas = starts + segs * 2;
      const rangeOffsets = deltas + segs * 2;
      for (let s = 0; s < segs; s++) {
        const end = sub.readUInt16BE(ends + s * 2);
        const start = sub.readUInt16BE(starts + s * 2);
        const delta = sub.readUInt16BE(deltas + s * 2);
        const ro = sub.readUInt16BE(rangeOffsets + s * 2);
        for (let c = start; c <= end && c !== 0xffff; c++) {
          let glyph: number;
          if (ro === 0) glyph = (c + delta) & 0xffff;
          else {
            const g = sub.readUInt16BE(rangeOffsets + s * 2 + ro + (c - start) * 2);
            glyph = g === 0 ? 0 : (g + delta) & 0xffff;
          }
          if (glyph !== 0) out.add(c);
        }
      }
    } else if (format === 12) {
      const groups = sub.readUInt32BE(12);
      for (let g = 0; g < groups; g++) {
        const start = sub.readUInt32BE(16 + g * 12);
        const end = sub.readUInt32BE(20 + g * 12);
        for (let c = start; c <= end; c++) out.add(c);
      }
    }
  }
  return out;
}

const astroDir = join(DIST, '_astro');
const css = readdirSync(astroDir)
  .filter((f) => f.endsWith('.css'))
  .map((f) => readFileSync(join(astroDir, f), 'utf8'))
  .join('\n');

interface Family {
  /** What the served subset can draw. */
  served: Set<number>;
  /** What the full font in ops/fonts/source/ can draw. */
  full: Set<number>;
}

/** Each family in the built CSS: its served subset and the full font it was cut from. */
const families = new Map<string, Family>();
for (const [, body] of css.matchAll(/@font-face\s*{([^}]*)}/g)) {
  const family = /font-family:\s*["']?([^;"']+)/.exec(body!)?.[1];
  const url = /url\(["']?(\/_astro\/([a-z-]+)\.[\w-]+\.woff2)/.exec(body!);
  if (!family || !url) throw new Error(`@font-face without a family or an /_astro/ woff2: ${body}`);
  if (families.has(family)) continue;
  families.set(family, {
    served: woff2Codepoints(readFileSync(join(DIST, url[1]!))),
    full: woff2Codepoints(readFileSync(join(ROOT, 'ops/fonts/source', `${url[2]}-latin.woff2`))),
  });
}

/** Characters a visitor can see in the built pages: text, placeholders, button values, CSS content. */
function shown(): Map<string, Set<string>> {
  const where = new Map<string, Set<string>>();
  const add = (text: string, route: string) => {
    for (const ch of text) {
      if (/\s/u.test(ch) || ch.codePointAt(0)! < 0x20) continue;
      if (!where.has(ch)) where.set(ch, new Set());
      where.get(ch)!.add(route);
    }
  };
  for (const page of allHtmlFiles()) {
    if (page.isRedirectStub) continue;
    const body = page.doc.querySelector('body');
    if (!body) continue;
    for (const el of body.querySelectorAll('script, style, template')) el.remove();
    add(body.textContent, page.route);
    for (const el of page.doc.querySelectorAll('[placeholder]')) add(el.getAttribute('placeholder') ?? '', page.route);
    for (const el of page.doc.querySelectorAll('input[value]')) add(el.getAttribute('value') ?? '', page.route);
  }
  for (const [, text] of css.matchAll(/content:\s*"([^"]*)"/g)) add(text!, 'the page CSS');
  return where;
}

describe('web font coverage', () => {
  it('finds the four self-hosted families in the built CSS', () => {
    expect([...families.keys()].sort()).toEqual(['JetBrains Mono', 'Outfit', 'Space Grotesk', 'Syne']);
    for (const { served } of families.values()) expect(served.has('A'.codePointAt(0)!)).toBe(true);
  });

  // A character the full font lacks too (the arrows ← →) already renders in a fallback; only
  // one the subset dropped would change how a page looks.
  it('every character a page shows that the full fonts can draw is still in the served fonts', () => {
    const missing: string[] = [];
    for (const [ch, routes] of shown()) {
      const cp = ch.codePointAt(0)!;
      const lacking = [...families]
        // Syne leaves out the tilde on purpose; it falls through to Space Grotesk.
        .filter(([family, { served, full }]) => full.has(cp) && !served.has(cp) && !(family === 'Syne' && ch === '~'))
        .map(([family]) => family);
      if (lacking.length) {
        const hex = cp.toString(16).toUpperCase().padStart(4, '0');
        missing.push(`"${ch}" U+${hex} (missing from ${lacking.join(', ')}), shown on ${[...routes].slice(0, 3).join(', ')}`);
      }
    }
    expect(
      missing,
      'A page shows characters the served web fonts dropped, so they would render in a fallback font. ' +
        'Add them to ops/fonts/charset.txt, run `python3 -I ops/fonts/subset.py` (needs fonttools and brotli), ' +
        'and commit both, or use a character that is already there.'
    ).toEqual([]);
  });

  it("keeps Syne's tilde out, so a tilde renders in Space Grotesk", () => {
    expect(families.get('Syne')!.served.has(0x7e)).toBe(false);
    expect(families.get('Space Grotesk')!.served.has(0x7e)).toBe(true);
  });
});
