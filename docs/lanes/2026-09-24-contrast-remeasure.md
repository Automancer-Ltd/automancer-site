# AUT-7594 — footer tagline and offer labels, fixed and re-measured

Run record, 2026-09-24. Branch `agent/AUT-7594`. Follows up the 2026-08-31 measurement in
`orch-auto-site-contrast-notes.md`. The decision to fix two items and accept two as exceptions was
Magnus's, recorded on AUT-7594 on 2026-09-24.

## What changed

| element | before | after |
|---|---|---|
| Footer tagline "very good engineering" (`.footer .spectral-text`, 13.76px / 400) | `--spectrum`. The violet stop `--spec-6` `#7744ff` is 4.06:1 on black | `--spectrum-text`: the same stops in the same order and direction, with violet lifted along its own hue to `--spec-6-text` `#8455ff` (hue 256.7° vs 256.4°, both 100% saturation). Scoped to the footer only |
| `STEP 01` / `STEP 03` (`.on-paper .offer__step`) | `--faint` `#7b7b86` on `#ffffff` | `--faint-dark` `#6d6d77`, the paper-surface label token that `.on-paper .offer__includes h3` already uses |

The hero and pullquote spectral text is unchanged. It is large text, where the 4.06 violet already
clears the 3:1 threshold.

## Method

The capture setup is the one in `orch-auto-site-contrast-notes.md`: agent-browser 0.34.0,
headless Chrome, 1280x633, DPR 1, pages fully scrolled and `.reveal` forced visible, fonts ready.
Capture A is the node as rendered and capture B hides the glyph paint. The glyph mask is
`|A−B| > 12`, and the backdrop is the 2.5/97.5 percentiles of B under the mask. Both builds were
served locally from `dist/`: `main` at `00369d0` for the before, this branch for the after.

Two additions:

1. **Phase sweep.** The spectral animation is paused, and `background-position` is stepped
   through 20 phases (0–285% in 15% steps, which covers the whole gradient cycle twice). The
   as-rendered animated frame is also taken. The worst case therefore does not depend on when
   the screenshot fired.
2. **Paint colour for gradient text.** A third capture, D, repaints the element with
   `background-clip: border-box`. This fills the span's own box with its own gradient, at the
   same phase and the same width. The foreground is the luminance of D **under the glyph mask**,
   so it is the colour the browser paints each glyph pixel with. This is the gradient equivalent
   of the "computed CSS colour" the original method uses for solid text. The known-answer check
   holds: the before build reads 4.04 against the analytic 4.06 for `#7744ff`, and the after build
   reads 4.68 against the analytic 4.71.

### Why the original gradient foreground cannot be used at this size

The 31 Aug method sampled gradient-text foregrounds as the 5th–95th percentile of glyph pixels with
`|A−B| > 60`. At 13.76px most of those pixels are partly-covered antialiased edges, so that
statistic measures edge coverage, not colour. Calibration: the footer's solid `--muted` email link
is `#a9a9b4` (9.02:1 by CSS colour). Through the same pixel path it reads **1.45:1**. Under that
statistic no colour at this size can reach 4.5. The 1.47–1.62 readings were mostly this artefact.
The tagline did still fail AA, but at 4.04, not 1.5.

## Results

Worst case over 3 pages × 20 paused phases. The as-rendered animated frames scored higher on
the original statistic: 1.85–2.04 before and 1.90–2.01 after. The backdrop was black (lum 0.000)
in every frame.

| page | element | 31 Aug recorded | before (original stat) | before (paint colour) | after (original stat) | after (paint colour) | AA | verdict |
|---|---|---|---|---|---|---|---|---|
| / | footer tagline | 1.47 | 1.42 | **4.04** | 1.44 | **4.68** | 4.5 | PASS |
| /contact | footer tagline | 1.62 | 1.42 | **4.04** | 1.44 | **4.68** | 4.5 | PASS |
| /services | footer tagline | 1.48 | 1.42 | **4.04** | 1.44 | **4.68** | 4.5 | PASS |
| — | calibration: footer `.tlink`, solid 9.02 by CSS | — | 1.45 | — | 1.45 | — | — | shows the original stat's floor |

Solid text uses the original method unchanged (computed CSS colour against the measured backdrop):

| page | element | 31 Aug recorded | before | after | AA | verdict |
|---|---|---|---|---|---|---|
| /services | `#offer-1 .offer__step` "STEP 01" | 4.18 | 4.18 | **5.12** | 4.5 | PASS |
| /services | `#offer-3 .offer__step` "STEP 03" | 4.18 | 4.18 | **5.12** | 4.5 | PASS |

The paint-colour result is pinned in `tests/contrast.test.ts`. That test samples the emitted
`--spectrum-text` along its sRGB interpolation against the `.footer` background, and uses the
unlifted `--spectrum` as a positive control that must stay below 4.5. The STEP labels are
checked on both paper surfaces.

## Accepted exceptions (unchanged, not restyled)

- **EX-1 — the 14 proof-strip `·` separators, 2.22:1.** They are decoration inside
  `.proof-strip__track`, which is `aria-hidden="true"`. A static screen-reader summary carries
  the content.
- **EX-2 — the ghost offer numerals, 1.64–1.73:1.** These are 1px outline figures,
  `aria-hidden="true"`. The `STEP 0n` label and the offer name carry the information. Not a
  token swap (see `docs/PLAN.md` §1, finding of 2026-09-21).

## Not done

Mobile viewports and hover/focus states were not measured, and nothing outside `/`, `/contact`
and `/services` was measured. This matches the scope of the original lane. The measuring script
is lane tooling and is attached to AUT-7594, not committed.
