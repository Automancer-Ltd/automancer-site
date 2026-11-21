/**
 * Share cards: the 1200×630 picture a social site, chat app or search result
 * shows when someone shares a page of this site.
 *
 * Each card is drawn at build time from words its page already shows (the
 * title, its label, its date or status), never new ones: the card restates the
 * page, it makes no claim of its own. The SVG below is rasterised by resvg
 * (WebAssembly; no browser) with static instances of the site's own fonts,
 * cut by ops/og-card/fonts.py from the served subsets, so a card can show
 * exactly the characters a page can.
 *
 * Served at /og/<field-notes|work>/<slug>.png and /og/pages/<name>.png
 * (src/pages/og/), named by each page's og:image and twitter:image, its
 * WebPage primaryImageOfPage and a field note's BlogPosting image.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import sharp from 'sharp';

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

/** One published from-price, as the page prints it. */
export interface CardPrice {
  name: string;
  /** "£450". */
  from: string;
  /** "/mo" for a monthly price. */
  per?: string;
}

export interface CardInput {
  /** The line above the title: "Field note · Pricing", a page's own eyebrow. */
  eyebrow: string;
  /** The page's headline, verbatim. */
  title: string;
  /** A word of the title the page sets in its spectrum (.spectral-text). */
  accent?: string;
  /** Bottom line, from the page: a note's date and author, a study's status. Empty for none. */
  meta: string;
  /** The published from-prices, drawn as a row under the title. */
  prices?: CardPrice[];
}

type FontName = 'syne-800' | 'space-grotesk-400' | 'jetbrains-mono-500';
interface FontMetrics { unitsPerEm: number; advance: Record<string, number> }

// The build always runs from the repository root (package.json scripts).
const asset = (p: string) => resolve(process.cwd(), p);
const FONTS: FontName[] = ['syne-800', 'space-grotesk-400', 'jetbrains-mono-500'];
const FAMILY: Record<FontName, string> = {
  'syne-800': 'Syne',
  // The instance keeps the subset's name table, which calls it "Light" (its default axis value).
  'space-grotesk-400': 'Space Grotesk Light',
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
type TitleStep = { size: number; maxLines: number };
// Largest size first; the first that fits its line count wins.
const TITLE_STEPS: TitleStep[] = [
  { size: 84, maxLines: 2 },
  { size: 72, maxLines: 3 },
  { size: 60, maxLines: 4 },
  { size: 50, maxLines: 5 },
];
// A card with a price row has less height for its title.
const PRICED_TITLE_STEPS: TitleStep[] = [
  { size: 64, maxLines: 2 },
  { size: 54, maxLines: 3 },
  { size: 46, maxLines: 3 },
];

const widest = (lines: string[], size: number) => Math.max(...lines.map((l) => textWidth(l, 'syne-800', size, TITLE_SPACING)));

/**
 * The title's size and lines: the largest step whose wrap fits, balanced as the
 * page's own title is (text-wrap: balance): the narrowest measure that keeps
 * the same number of lines, so no line is left with one short word.
 */
export function fitTitle(title: string, steps: TitleStep[] = TITLE_STEPS): { size: number; lines: string[] } {
  for (const step of steps) {
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
  const last = steps.at(-1)!;
  throw new Error(`Share card: "${title}" does not fit ${last.maxLines} lines at ${last.size}px. Shorten the headline or add a step.`);
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

// The stops a page's spectral word shows (yellow, green, blue), so an accent
// on a card reads as the same word on the page rather than the glow behind it.
const ACCENT = ['#ffcc22', '#33dd77', '#3399ff'];
// Each price column's top rule, one spectrum colour per rung.
const RUNG_COLOURS = ['#ff4466', '#ffcc22', '#33dd77', '#3399ff'];

const PRICE_GAP = 24;
const PRICE_NAME_SIZE = 19;
const PRICE_NAME_LINE = 24;
const PRICE_SIZE = 34;
const PRICE_SPACING = -0.02;
// Baselines, from the column's rule: its name, then "from" and the price under it.
const PRICE_NAME_AT = 30;
const PRICE_AT = 46;
// "from" sits before the price, as the page's overview row prints it.
const FROM_SIZE = 15;
const FROM_GAP = 8;
const fromWidth = () => textWidth('from', 'jetbrains-mono-500', FROM_SIZE) + FROM_GAP;

/** The price row's layout: each column's width and name lines, and the row's height. */
function priceRow(prices: CardPrice[]) {
  const colWidth = (TITLE_WIDTH - PRICE_GAP * (prices.length - 1)) / prices.length;
  const names = prices.map((p) => {
    const lines = wrap(p.name, 'space-grotesk-400', PRICE_NAME_SIZE, colWidth);
    if (lines.length > 2 || widestOf(lines, 'space-grotesk-400', PRICE_NAME_SIZE) > colWidth) {
      throw new Error(`Share card: the service name "${p.name}" does not fit two lines of its column.`);
    }
    return lines;
  });
  for (const p of prices) {
    if (fromWidth() + textWidth(p.from, 'syne-800', PRICE_SIZE, PRICE_SPACING) + (p.per ? 6 + textWidth(p.per, 'jetbrains-mono-500', 18) : 0) > colWidth) {
      throw new Error(`Share card: the price "${p.from}${p.per ?? ''}" is wider than its column.`);
    }
  }
  const nameLines = Math.max(...names.map((n) => n.length));
  const height = PRICE_NAME_AT + PRICE_NAME_LINE * (nameLines - 1) + PRICE_AT + 4;
  return { colWidth, names, nameLines, height };
}

const widestOf = (lines: string[], font: FontName, size: number, spacing = 0) =>
  Math.max(...lines.map((l) => textWidth(l, font, size, spacing)));

/** The title's lines as tspans, with the accent word (if any) in the spectrum. */
function titleTspans(lines: string[], size: number, firstBaseline: number, lineHeight: number, accent?: string): { tspans: string; defs: string } {
  let defs = '';
  let accented = false;
  const tspans = lines
    .map((line, i) => {
      const y = firstBaseline + i * lineHeight;
      const at = accent && !accented ? line.indexOf(accent) : -1;
      if (at < 0) return `<tspan x="${PAD}" y="${y}">${esc(line)}</tspan>`;
      accented = true;
      const before = line.slice(0, at);
      const after = line.slice(at + accent!.length);
      // Letter spacing follows every character, so the word starts one spacing after its prefix.
      const x = PAD + (before ? textWidth(before, 'syne-800', size, TITLE_SPACING) + TITLE_SPACING * size : 0);
      const w = textWidth(accent!, 'syne-800', size, TITLE_SPACING);
      const stops = ACCENT.map((c, j) => `<stop offset="${(j / (ACCENT.length - 1)).toFixed(3)}" stop-color="${c}"/>`).join('');
      defs = `<linearGradient id="accent" gradientUnits="userSpaceOnUse" x1="${x.toFixed(1)}" y1="0" x2="${(x + w).toFixed(1)}" y2="0">${stops}</linearGradient>`;
      return `<tspan x="${PAD}" y="${y}">${esc(before)}</tspan><tspan fill="url(#accent)">${esc(accent!)}</tspan>${after ? `<tspan>${esc(after)}</tspan>` : ''}`;
    })
    .join('');
  if (accent && !accented) throw new Error(`Share card: the accent "${accent}" is not a word of "${lines.join(' ')}" on one line.`);
  return { tspans, defs };
}

/** The card as SVG text. Exported for tests; `renderCard` rasterises it. */
export function cardSvg(input: CardInput): string {
  const row = input.prices?.length ? priceRow(input.prices) : undefined;
  const { size, lines } = fitTitle(input.title, row ? PRICED_TITLE_STEPS : TITLE_STEPS);
  const lineHeight = Math.round(size * 1.04);
  const eyebrow = input.eyebrow.toUpperCase();
  const eyebrowSize = 20;
  const eyebrowSpacing = 0.16;
  const eyebrowWidth = TITLE_WIDTH - 48;
  if (textWidth(eyebrow, 'jetbrains-mono-500', eyebrowSize, eyebrowSpacing) > eyebrowWidth) {
    throw new Error(`Share card: the label "${eyebrow}" is wider than the card.`);
  }
  if (textWidth(input.meta, 'jetbrains-mono-500', 20) > 760) {
    throw new Error(`Share card: the line "${input.meta}" is wider than its space.`);
  }

  // The eyebrow, title and any price row sit centred between the header and the footer.
  const top = row ? 132 : 150;
  const bottom = row ? 532 : 520;
  const rowGap = 44;
  const blockHeight = eyebrowSize + 40 + lineHeight * (lines.length - 1) + size * 0.78 + (row ? size * 0.22 + rowGap + row.height : 0);
  const eyebrowBaseline = Math.round(top + (bottom - top - blockHeight) / 2 + eyebrowSize * 0.8);
  const firstBaseline = Math.round(eyebrowBaseline + 40 + size * 0.78);
  if (blockHeight > bottom - top) {
    throw new Error(`Share card: "${input.title}" and its prices are taller than the space between the logo and the footer.`);
  }

  const stops = SPECTRUM.map((c, i) => `<stop offset="${(i / (SPECTRUM.length - 1)).toFixed(3)}" stop-color="${c}"/>`).join('');
  const title = titleTspans(lines, size, firstBaseline, lineHeight, input.accent);
  const logoScale = 52 / 1119.9;

  let prices = '';
  if (row && input.prices) {
    const rowTop = Math.round(firstBaseline + lineHeight * (lines.length - 1) + size * 0.22 + rowGap);
    prices = input.prices
      .map((p, i) => {
        const x = PAD + i * (row.colWidth + PRICE_GAP);
        const names = row.names[i]!
          .map((l, j) => `<tspan x="${x.toFixed(1)}" y="${rowTop + PRICE_NAME_AT + j * PRICE_NAME_LINE}">${esc(l)}</tspan>`)
          .join('');
        // Every column's price shares a baseline, below the longest name.
        const priceBaseline = rowTop + PRICE_NAME_AT + PRICE_NAME_LINE * (row.nameLines - 1) + PRICE_AT;
        const priceX = x + fromWidth();
        const per = p.per
          ? `<text x="${(priceX + textWidth(p.from, 'syne-800', PRICE_SIZE, PRICE_SPACING) + 6).toFixed(1)}" y="${priceBaseline}" font-family="JetBrains Mono" font-size="18" fill="#a9a9b4">${esc(p.per)}</text>`
          : '';
        return `<rect x="${x.toFixed(1)}" y="${rowTop}" width="${row.colWidth.toFixed(1)}" height="2" fill="${RUNG_COLOURS[i % RUNG_COLOURS.length]}"/>
<text font-family="${FAMILY['space-grotesk-400']}" font-size="${PRICE_NAME_SIZE}" fill="#c9c9d1">${names}</text>
<text x="${x.toFixed(1)}" y="${priceBaseline}" font-family="JetBrains Mono" font-size="${FROM_SIZE}" fill="#7b7b86">from</text>
<text x="${priceX.toFixed(1)}" y="${priceBaseline}" font-family="Syne" font-size="${PRICE_SIZE}" letter-spacing="${(PRICE_SPACING * PRICE_SIZE).toFixed(2)}" fill="#f4f4f6">${esc(p.from)}</text>${per}`;
      })
      .join('\n');
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}">
<defs>
<linearGradient id="spectrum" x1="0" y1="0" x2="1" y2="0">${stops}</linearGradient>
<radialGradient id="glow-warm" gradientUnits="userSpaceOnUse" cx="1030" cy="80" r="420"><stop offset="0" stop-color="#ff4466" stop-opacity="0.2"/><stop offset="1" stop-color="#ff4466" stop-opacity="0"/></radialGradient>
<radialGradient id="glow-cool" gradientUnits="userSpaceOnUse" cx="100" cy="630" r="420"><stop offset="0" stop-color="#3399ff" stop-opacity="0.15"/><stop offset="1" stop-color="#3399ff" stop-opacity="0"/></radialGradient>
${title.defs}
</defs>
<rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="#000"/>
<rect x="610" width="590" height="500" fill="url(#glow-warm)"/>
<rect y="210" width="520" height="420" fill="url(#glow-cool)"/>
<rect width="${OG_WIDTH}" height="6" fill="url(#spectrum)"/>
<g transform="translate(${PAD} 56) scale(${logoScale.toFixed(6)})"><path fill="#fff" d="${logo()}"/></g>
<text x="${PAD + 64}" y="94" font-family="Syne" font-size="32" letter-spacing="-0.6" fill="#fff">Automancer</text>
<rect x="${PAD}" y="${eyebrowBaseline - 7}" width="32" height="1.5" fill="#a9a9b4" opacity="0.5"/>
<text x="${PAD + 48}" y="${eyebrowBaseline}" font-family="JetBrains Mono" font-size="${eyebrowSize}" letter-spacing="${(eyebrowSpacing * eyebrowSize).toFixed(2)}" fill="#a9a9b4">${esc(eyebrow)}</text>
<text font-family="Syne" font-size="${size}" letter-spacing="${(TITLE_SPACING * size).toFixed(2)}" fill="#f4f4f6">${title.tspans}</text>
${prices}
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
    font: { fontBuffers: fontBuffers!, loadSystemFonts: false, defaultFontFamily: FAMILY['space-grotesk-400'] },
    fitTo: { mode: 'original' },
  });
  const image = resvg.render();
  const pixels = image.pixels;
  image.free();
  resvg.free();

  // Repeated colours in the glow compress best without adaptive filtering.
  const png = await sharp(pixels, { raw: { width: OG_WIDTH, height: OG_HEIGHT, channels: 4 } })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
  return Uint8Array.from(png);
}
