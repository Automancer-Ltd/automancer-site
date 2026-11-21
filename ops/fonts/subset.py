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
every weight renders as before. In JetBrains Mono, the only contextual
ligatures the site uses are repeated slashes, as in URLs and comment labels.

Syne leaves out U+007E (~): its tilde is a dot-sized squiggle that reads
"~600" as "·600", so the tilde falls through to Space Grotesk.

tests/fonts.test.ts fails when a built page shows a character a font lacks.
To add one: put it in charset.txt, rerun this script and ops/fonts/fallbacks.py
(the fallback faces are sized to these files), commit all three.
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


def keep_slash_ligatures(font: TTFont) -> None:
    """Keep the original contextual rules for // and ///, including their guards."""
    gsub = font["GSUB"].table
    lookups = gsub.LookupList.Lookup
    ligatures = {"slash_slash.liga", "slash_slash_slash.liga"}
    slash_substitutions = {
        index for index, lookup in enumerate(lookups)
        if lookup.LookupType == 1 and any(ligatures.intersection(sub.mapping.values()) for sub in lookup.SubTable)
    }
    contextual = next(record.Feature for record in gsub.FeatureList.FeatureRecord if record.FeatureTag == "calt")
    contextual.LookupListIndex = [
        index for index in contextual.LookupListIndex
        if any(
            action.LookupListIndex in slash_substitutions
            for rule in lookups[index].SubTable
            for action in rule.SubstLookupRecord
        )
    ]


def cut(family: str, chars: set[int]) -> bytes:
    font = TTFont(HERE / "source" / f"{family}-latin.woff2")
    if family == "jetbrains-mono":
        keep_slash_ligatures(font)
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
