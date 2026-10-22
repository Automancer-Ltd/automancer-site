/**
 * axe-core's WCAG 2.2 A and AA rules on every emitted content page.
 *
 * a11y.test.ts hand-checks the highest-value structure with node-html-parser,
 * which has no DOM for axe. This file loads each page's HTML into a happy-dom
 * window (scripts stripped, stylesheets not loaded) and runs axe itself, so
 * any rule axe knows (names, roles, ARIA, labels, lists, tables, lang) fails
 * the build. Rules that need real layout stay off: contrast is owned by
 * contrast.test.ts; target size and scrollable regions need a browser.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Window } from 'happy-dom';
import { describe, expect, it } from 'vitest';
import { ROOT, SITE_URL, pageCheckPages } from './support/dist';

const AXE = readFileSync(join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const LAYOUT_RULES = ['color-contrast', 'target-size', 'scrollable-region-focusable'];

type AxeResult = { violations: { id: string; nodes: { target: string[] }[] }[] };

async function violations(html: string, route: string): Promise<string[]> {
  const window = new Window({
    url: new URL(route, SITE_URL).href,
    settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true, disableIframePageLoading: true },
  });
  try {
    window.document.write(html.replace(/<script\b[\s\S]*?<\/script>/gi, ''));
    window.eval(AXE);
    const axe = (window as unknown as { axe: { run: (doc: unknown, opts: unknown) => Promise<AxeResult> } }).axe;
    const result = await axe.run(window.document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      rules: Object.fromEntries(LAYOUT_RULES.map((id) => [id, { enabled: false }])),
    });
    return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  } finally {
    await window.happyDOM.close();
  }
}

describe('axe-core WCAG 2.2 A/AA', () => {
  for (const page of pageCheckPages()) {
    it(`${page.route} has no violations`, async () => {
      expect(await violations(page.html, page.route)).toEqual([]);
    });
  }
});
