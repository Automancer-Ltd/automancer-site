import { describe, expect, it } from 'vitest';
import { allHtmlFiles, contentPages, readDistFile } from './support/dist';

const services = contentPages().find((page) => page.route === '/services/');
const stylesheet = services?.doc.querySelector('link[rel="stylesheet"][href^="/_astro/"]')?.getAttribute('href');
const css = stylesheet ? readDistFile(stylesheet.slice(1)) : null;

function declaration(selector: string, property: string): string {
  expect(css, 'services stylesheet was not emitted').toBeTruthy();
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const block = css!.match(new RegExp(`${escaped}\\{([^}]*)\\}`))?.[1];
  const value = block?.match(new RegExp(`(?:^|;)${property}:([^;}]+)`))?.[1];
  expect(value, `${selector} has no ${property} declaration`).toBeTruthy();
  return value!;
}

function rgb(value: string): [number, number, number] {
  const variable = value.match(/^var\(--([^)]+)\)$/)?.[1];
  if (variable) {
    const resolved = css!.match(new RegExp(`--${variable}:([^;}]+)`))?.[1];
    expect(resolved, `--${variable} is undefined`).toBeTruthy();
    return rgb(resolved!);
  }

  const hex = value.match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1];
  expect(hex, `unsupported colour: ${value}`).toBeTruthy();
  const full = hex!.length === 3 ? [...hex!].map((digit) => digit + digit).join('') : hex!;
  return [0, 2, 4].map((offset) => parseInt(full.slice(offset, offset + 2), 16)) as [number, number, number];
}

function contrast(foreground: string, background: string): number {
  const luminance = (colour: string) => {
    const [r, g, b] = rgb(colour).map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('services offer labels', () => {
  it.each([
    ['light', '.on-paper .offer__includes h3', '.on-paper'],
    ['dark', '.offer__includes h3', '.on-dark'],
  ])('meets WCAG AA on the %s offer sections', (_name, textSelector, surfaceSelector) => {
    const ratio = contrast(declaration(textSelector, 'color'), declaration(surfaceSelector, 'background'));
    expect(ratio, `${textSelector} contrast is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });

  // `.on-paper .offer__step` shares this rule; the helper matches the selector that ends it.
  it.each([
    ['paper', '.on-paper'],
    ['paper-2', '.on-paper-2'],
  ])('STEP labels meet WCAG AA on the %s offer sections', (_name, surfaceSelector) => {
    const ratio = contrast(declaration('.on-paper-2 .offer__step', 'color'), declaration(surfaceSelector, 'background'));
    expect(ratio, `.offer__step on ${surfaceSelector} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });
});

describe('footer spectral tagline', () => {
  // Darkest point of a gradient, sampled along its sRGB interpolation (the CSS default).
  function darkest(gradientVariable: string, background: string) {
    const gradient = css!.match(new RegExp(`--${gradientVariable}:linear-gradient\\(90deg,([^;}]+)\\)`))?.[1];
    expect(gradient, `--${gradientVariable} is undefined`).toBeTruthy();
    const stops = gradient!.split(',').map((stop) => rgb(stop.trim()));
    let worst = Infinity;
    for (let i = 0; i < stops.length - 1; i += 1) {
      for (let step = 0; step <= 50; step += 1) {
        const mixed = stops[i].map((channel, c) => Math.round(channel + ((stops[i + 1][c] - channel) * step) / 50));
        const hex = `#${mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
        worst = Math.min(worst, contrast(hex, background));
      }
    }
    return worst;
  }

  it('the footer paints the text-safe spectrum on its tagline', () => {
    expect(declaration('.footer .spectral-text', 'background-image')).toBe('var(--spectrum-text)');
  });

  it('every point of the text-safe spectrum meets WCAG AA on the footer', () => {
    const ratio = darkest('spectrum-text', declaration('.footer', 'background'));
    expect(ratio, `darkest point of --spectrum-text is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });

  it('the display spectrum is the sub-AA gradient this gate exists to catch', () => {
    // Positive control: the unlifted violet stop really is below 4.5 on black.
    const ratio = darkest('spectrum', declaration('.footer', 'background'));
    expect(ratio, `darkest point of --spectrum is ${ratio.toFixed(2)}:1 — expected below 4.5`).toBeLessThan(4.5);
  });
});

describe('muted body-secondary on paper vs dark', () => {
  it.each([
    ['paper', '.on-paper .muted', '.on-paper'],
    ['near', '.muted', '.on-near'],
    ['dark', '.muted', '.on-dark'],
  ])('meets WCAG AA on the %s surface', (_name, textSelector, surfaceSelector) => {
    const ratio = contrast(declaration(textSelector, 'color'), declaration(surfaceSelector, 'background'));
    expect(ratio, `${textSelector} on ${surfaceSelector} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });

  it('the dark-surface --muted token on paper is the 2.33:1 pair this gate exists to catch', () => {
    // Positive control: the failing pair really is below AA, so a usage
    // check that forbids it is about this pair, not a broken instrument.
    const ratio = contrast('var(--muted)', declaration('.on-paper', 'background'));
    expect(ratio, `--muted on paper is ${ratio.toFixed(2)}:1 — expected below 4.5`).toBeLessThan(4.5);
  });
});

describe('paper surfaces never inline the dark-surface --muted token', () => {
  const INLINE_MUTED = /color\s*:\s*var\(--muted\)/;

  it('no page inlines color:var(--muted) inside a paper surface', () => {
    let examined = 0;
    for (const page of allHtmlFiles()) {
      if (page.isRedirectStub) continue;
      for (const paper of page.doc.querySelectorAll('.on-paper, .on-paper-2')) {
        for (const el of paper.querySelectorAll('[style]')) {
          examined += 1;
          const style = el.getAttribute('style') ?? '';
          expect(
            INLINE_MUTED.test(style),
            `${page.route}: ${el.tagName.toLowerCase()} inlines --muted on paper ("${style}")`
          ).toBe(false);
        }
      }
    }
    expect(examined, 'no inlined styles on paper — instrument saw nothing').toBeGreaterThan(0);
  });
});
