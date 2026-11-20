/**
 * Share cards: the 1200×630 picture a social site, chat app or search result
 * shows when someone shares a field note or a case study.
 *
 * Each card is drawn at build time from words its page already shows (the
 * title, its label, its date or status), never new ones: the card restates the
 * page, it makes no claim of its own. The SVG below is rasterised by resvg
 * (WebAssembly; no browser) with static instances of the site's own fonts,
 * cut by ops/og-card/fonts.py from the served subsets, so a card can show
 * exactly the characters a page can.
 *
 * Served at /og/<field-notes|work>/<slug>.png (src/pages/og/), named by each
 * page's og:image and twitter:image, and by a field note's BlogPosting image.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { initWasm, Resvg } from '@resvg/resvg-wasm';

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

export interface CardInput {
  /** "Field note" or "Case study". */
  kind: string;
  /** The page's own label: a field note's category, a case study's sector. */
  label: string;
  /** The page's headline, verbatim. */
  title: string;
  /** Bottom line, from the page: a note's date and author, a study's status. */
  meta: string;
}

type FontName = 'syne-800' | 'space-grotesk-400' | 'jetbrains-mono-500';
interface FontMetrics { unitsPerEm: number; advance: Record<string, number> }

// The build always runs from the repository root (package.json scripts).
const asset = (p: string) => resolve(process.cwd(), p);
const FONTS: FontName[] = ['syne-800', 'space-grotesk-400', 'jetbrains-mono-500'];
const FAMILY: Record<FontName, string> = {
  'syne-800': 'Syne',
  'space-grotesk-400': 'Space Grotesk',
  'jetbrains-mono-500': 'JetBrains Mono',
};

let metricsCache: Record<FontName, FontMetrics> | undefined;
function metrics(): Record<FontName, FontMetrics> {
  metricsCache ??= JSON.parse(readFileSync(asset('src/assets/og/metrics.json'), 'utf8')) as Record<FontName, FontMetrics>;
  return metricsCache;
}

/**
 * Width of `text` in px at `size`, with CSS-style letter spacing (em). Throws on
 * a character the card fonts lack, so a new character cannot render as a box:
 * add it to ops/fonts/charset.txt and rerun both font scripts.
 */
export function textWidth(text: string, font: FontName, size: number, spacingEm = 0): number {
  const m = metrics()[font];
  let units = 0;
  let n = 0;
  for (const ch of text) {
    n += 1;
    const adv = m.advance[ch];
    if (adv === undefined) {
      throw new Error(`Share card: ${FAMILY[font]} has no "${ch}" (U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}). Add it to ops/fonts/charset.txt, run ops/fonts/subset.py and ops/og-card/fonts.py.`);
    }
    units += adv;
  }
  return (units / m.unitsPerEm) * size + Math.max(0, n - 1) * spacingEm * size;
}

/** Greedy word wrap; a word longer than the line stays whole on its own line. */
export function wrap(text: string, font: FontName, size: number, maxWidth: number, spacingEm = 0): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && textWidth(next, font, size, spacingEm) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const PAD = 80;
const TITLE_WIDTH = OG_WIDTH - PAD * 2;
const TITLE_SPACING = -0.035;
// Largest size first; the first that fits its line count wins.
const TITLE_STEPS: Array<{ size: number; maxLines: number }> = [
  { size: 84, maxLines: 2 },
  { size: 72, maxLines: 3 },
  { size: 60, maxLines: 4 },
  { size: 50, maxLines: 5 },
];

const widest = (lines: string[], size: number) => Math.max(...lines.map((l) => textWidth(l, 'syne-800', size, TITLE_SPACING)));

/**
 * The title's size and lines: the largest step whose wrap fits, balanced as the
 * page's own title is (text-wrap: balance): the narrowest measure that keeps
 * the same number of lines, so no line is left with one short word.
 */
export function fitTitle(title: string): { size: number; lines: string[] } {
  for (const step of TITLE_STEPS) {
    const lines = wrap(title, 'syne-800', step.size, TITLE_WIDTH, TITLE_SPACING);
    if (lines.length > step.maxLines || widest(lines, step.size) > TITLE_WIDTH) continue;
    let lo = 0;
    let hi = TITLE_WIDTH;
    while (hi - lo > 1) {
      const mid = (lo + hi) / 2;
      const trial = wrap(title, 'syne-800', step.size, mid, TITLE_SPACING);
      if (trial.length === lines.length && widest(trial, step.size) <= mid) hi = mid;
      else lo = mid;
    }
    return { size: step.size, lines: wrap(title, 'syne-800', step.size, hi, TITLE_SPACING) };
  }
  throw new Error(`Share card: "${title}" does not fit five lines at 50px. Shorten the headline or add a step.`);
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let logoPath: string | undefined;
function logo(): string {
  if (!logoPath) {
    const svg = readFileSync(asset('public/assets/images/logo.svg'), 'utf8');
    const d = /<path[^>]*\sd="([^"]+)"/.exec(svg)?.[1];
    if (!d) throw new Error('Share card: public/assets/images/logo.svg has no path.');
    logoPath = d;
  }
  return logoPath;
}

// The site's spectrum (global.css --spectrum), left to right.
const SPECTRUM = ['#ff4466', '#ff8833', '#ffcc22', '#33dd77', '#3399ff', '#7744ff', '#cc44dd'];

/** The card as SVG text. Exported for tests; `renderCard` rasterises it. */
export function cardSvg(input: CardInput): string {
  const { size, lines } = fitTitle(input.title);
  const lineHeight = Math.round(size * 1.04);
  const eyebrow = `${input.kind} · ${input.label}`.toUpperCase();
  const eyebrowSize = 20;
  const eyebrowSpacing = 0.16;
  const eyebrowWidth = TITLE_WIDTH - 48;
  if (textWidth(eyebrow, 'jetbrains-mono-500', eyebrowSize, eyebrowSpacing) > eyebrowWidth) {
    throw new Error(`Share card: the label "${eyebrow}" is wider than the card.`);
  }
  if (textWidth(input.meta, 'jetbrains-mono-500', 20) > 760) {
    throw new Error(`Share card: the line "${input.meta}" is wider than its space.`);
  }

  // The eyebrow and title sit centred between the header and the footer.
  const top = 150;
  const bottom = 520;
  const blockHeight = eyebrowSize + 40 + lineHeight * (lines.length - 1) + size * 0.78;
  const eyebrowBaseline = Math.round(top + (bottom - top - blockHeight) / 2 + eyebrowSize * 0.8);
  const firstBaseline = Math.round(eyebrowBaseline + 40 + size * 0.78);

  const stops = SPECTRUM.map((c, i) => `<stop offset="${(i / (SPECTRUM.length - 1)).toFixed(3)}" stop-color="${c}"/>`).join('');
  const title = lines
    .map((l, i) => `<tspan x="${PAD}" y="${firstBaseline + i * lineHeight}">${esc(l)}</tspan>`)
    .join('');
  const logoScale = 52 / 1119.9;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}">
<defs>
<linearGradient id="spectrum" x1="0" y1="0" x2="1" y2="0">${stops}</linearGradient>
<radialGradient id="glow-warm" gradientUnits="userSpaceOnUse" cx="1030" cy="80" r="420"><stop offset="0" stop-color="#ff4466" stop-opacity="0.2"/><stop offset="1" stop-color="#ff4466" stop-opacity="0"/></radialGradient>
<radialGradient id="glow-cool" gradientUnits="userSpaceOnUse" cx="100" cy="630" r="420"><stop offset="0" stop-color="#3399ff" stop-opacity="0.15"/><stop offset="1" stop-color="#3399ff" stop-opacity="0"/></radialGradient>
</defs>
<rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="#000"/>
<rect x="610" width="590" height="500" fill="url(#glow-warm)"/>
<rect y="210" width="520" height="420" fill="url(#glow-cool)"/>
<rect width="${OG_WIDTH}" height="6" fill="url(#spectrum)"/>
<g transform="translate(${PAD} 56) scale(${logoScale.toFixed(6)})"><path fill="#fff" d="${logo()}"/></g>
<text x="${PAD + 64}" y="94" font-family="Syne" font-size="32" letter-spacing="-0.6" fill="#fff">Automancer</text>
<rect x="${PAD}" y="${eyebrowBaseline - 7}" width="32" height="1.5" fill="#a9a9b4" opacity="0.5"/>
<text x="${PAD + 48}" y="${eyebrowBaseline}" font-family="JetBrains Mono" font-size="${eyebrowSize}" letter-spacing="${(eyebrowSpacing * eyebrowSize).toFixed(2)}" fill="#a9a9b4">${esc(eyebrow)}</text>
<text font-family="Syne" font-size="${size}" letter-spacing="${(TITLE_SPACING * size).toFixed(2)}" fill="#f4f4f6">${title}</text>
<rect x="${PAD}" y="548" width="${TITLE_WIDTH}" height="1" fill="#26262c"/>
<text x="${PAD}" y="590" font-family="JetBrains Mono" font-size="20" fill="#7b7b86">${esc(input.meta)}</text>
<circle cx="${(OG_WIDTH - PAD - textWidth('automancer.uk', 'jetbrains-mono-500', 22) - 16).toFixed(1)}" cy="583" r="5" fill="#33dd77"/>
<text x="${OG_WIDTH - PAD}" y="590" text-anchor="end" font-family="JetBrains Mono" font-size="22" fill="#f4f4f6">automancer.uk</text>
</svg>`;
}

let ready: Promise<void> | undefined;
let fontBuffers: Uint8Array[] | undefined;
function init(): Promise<void> {
  ready ??= (async () => {
    const require = createRequire(import.meta.url);
    await initWasm(readFileSync(require.resolve('@resvg/resvg-wasm/index_bg.wasm')));
    fontBuffers = FONTS.map((f) => new Uint8Array(readFileSync(asset(`src/assets/og/${f}.ttf`))));
  })();
  return ready;
}

/** The card as PNG bytes, exactly OG_WIDTH × OG_HEIGHT. */
export async function renderCard(input: CardInput): Promise<Uint8Array<ArrayBuffer>> {
  await init();
  const resvg = new Resvg(cardSvg(input), {
    font: { fontBuffers: fontBuffers!, loadSystemFonts: false, defaultFontFamily: 'Space Grotesk' },
    fitTo: { mode: 'original' },
  });
  // Copied out of WebAssembly memory into a buffer a Response can own.
  const png = new Uint8Array(resvg.render().asPng());
  resvg.free();
  return png;
}
