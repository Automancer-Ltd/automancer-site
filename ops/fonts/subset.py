#!/usr/bin/env python3
"""Cut the site's four web fonts down to the characters the site shows.

    python3 -I ops/fonts/subset.py        # from the repository root; needs fonttools + brotli

Reads the full Google Fonts latin files in ops/fonts/source/ and writes the
served subsets to src/assets/fonts/, where Astro gives each a content-hashed
/_astro/ URL (cached for a year: a changed font gets a new URL at once).

Keeps every glyph in ops/fonts/charset.txt and the OpenType features the CSS
can switch on: the defaults a browser applies (kerning, ligatures, marks,
contextual forms) and the numeral forms font-variant-numeric asks for
(tnum, lnum, pnum). Each file stays variable over its full weight axis, so
every weight renders as before. Drops accented letters and alternates no page
uses: that is most of the bytes (121 KB to 76 KB for the four, Nov 2026).

Syne leaves out U+007E (~): its tilde is a dot-sized squiggle that reads
"~600" as "·600", so the tilde falls through to Space Grotesk.

tests/fonts.test.ts fails when a built page shows a character a font lacks.
To add one: put it in charset.txt, rerun this script, commit both.
"""

from io import BytesIO
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

HERE = Path(__file__).resolve().parent
OUT = HERE.parent.parent / "src" / "assets" / "fonts"
FAMILIES = ["syne", "space-grotesk", "outfit", "jetbrains-mono"]
FEATURES = ["kern", "liga", "clig", "calt", "ccmp", "locl", "mark", "mkmk", "rlig", "rvrn", "tnum", "lnum", "pnum"]
LEAVE_OUT = {"syne": {0x7E}}


def charset() -> set[int]:
    """Every non-comment character in charset.txt, plus the space."""
    chars = {0x20}
    for line in (HERE / "charset.txt").read_text(encoding="utf-8").splitlines():
        if line.startswith("#"):
            continue
        chars.update(ord(c) for c in line if not c.isspace())
    return chars | {0xA0}


def cut(family: str, chars: set[int]) -> bytes:
    font = TTFont(HERE / "source" / f"{family}-latin.woff2")
    options = subset.Options()
    options.layout_features = FEATURES
    options.name_IDs = ["*"]  # keep the licence and names
    options.name_languages = ["*"]
    options.notdef_outline = True
    options.flavor = "woff2"
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=sorted(chars - LEAVE_OUT.get(family, set())))
    subsetter.subset(font)
    font.flavor = "woff2"
    out = BytesIO()
    font.save(out)
    return out.getvalue()


def main() -> None:
    chars = charset()
    OUT.mkdir(parents=True, exist_ok=True)
    for family in FAMILIES:
        data = cut(family, chars)
        (OUT / f"{family}.woff2").write_bytes(data)
        before = (HERE / "source" / f"{family}-latin.woff2").stat().st_size
        print(f"{family}: {before} -> {len(data)} bytes")


if __name__ == "__main__":
    main()
