#!/usr/bin/env python3
"""Static font instances and advance widths for the share cards.

    python3 -I ops/og-card/fonts.py        # from the repository root; needs fonttools + brotli

The share cards (src/lib/og-card.ts) are drawn at build time by resvg, which
reads a variable font at its default weight only. This script takes the served
web-font subsets in src/assets/fonts/ (so a card can show exactly the characters
a page can) and writes one static TrueType instance per weight a card uses to
src/assets/og/, with each glyph's advance width in src/assets/og/metrics.json so
the card can wrap a title before drawing it.

Rerun it after ops/fonts/subset.py (a new character in charset.txt) and commit
the outputs. The build stops on a card character missing from metrics.json
(textWidth in src/lib/og-card.ts), so a card never draws a box for a letter.
"""

import json
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parent.parent.parent
SRC = ROOT / "src" / "assets" / "fonts"
OUT = ROOT / "src" / "assets" / "og"
# (served subset, weight, output name). Family names stay the font's own.
INSTANCES = [
    ("syne", 800, "syne-800"),
    ("space-grotesk", 400, "space-grotesk-400"),
    ("jetbrains-mono", 500, "jetbrains-mono-500"),
]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    metrics = {}
    for family, weight, name in INSTANCES:
        font = TTFont(SRC / f"{family}.woff2")
        static = instantiateVariableFont(font, {"wght": weight}, updateFontNames=False)
        static.flavor = None
        static.save(OUT / f"{name}.ttf")
        cmap = static.getBestCmap()
        hmtx = static["hmtx"]
        metrics[name] = {
            "unitsPerEm": static["head"].unitsPerEm,
            "advance": {chr(cp): hmtx[glyph][0] for cp, glyph in sorted(cmap.items())},
        }
        print(f"{name}.ttf: {(OUT / f'{name}.ttf').stat().st_size:,} B, {len(cmap)} characters")
    (OUT / "metrics.json").write_text(json.dumps(metrics, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
