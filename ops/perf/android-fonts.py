#!/usr/bin/env python3
"""A fontconfig with only Android's fonts, so Linux Chromium draws a page as an Android phone would.

    python3 -I ops/perf/android-fonts.py [folder=/opt/automancer/var/scratch/android-fonts]
    FONTCONFIG_FILE=<folder>/fonts.conf node ops/perf/font-swap.mjs --widths=390,412 --dpr=3

Android has no Arial, Liberation or Courier New: its sans-serif is Roboto and its monospace Droid
Sans Mono. This writes those (ops/fonts/stand-ins/, already cut to the site's characters) into the
folder as plain TrueType files, and a fonts.conf that offers nothing else and maps sans-serif,
system-ui, serif and monospace to them. Chromium reads local() faces and generic families through
fontconfig, so with FONTCONFIG_FILE set the '<family> Fallback' faces find nothing and the
'<family> Android Fallback' faces find Roboto (t23067). Characters outside charset.txt (arrows the
web fonts lack) draw as boxes, which real phones fill from Noto. Measure at --dpr=3: Linux
positions glyphs on whole device pixels, which skews widths at 1x.
"""

import sys
from pathlib import Path

from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent.parent
folder = Path(sys.argv[1] if len(sys.argv) > 1 else "/opt/automancer/var/scratch/android-fonts").resolve()
(folder / "fonts").mkdir(parents=True, exist_ok=True)
(folder / "cache").mkdir(exist_ok=True)
for source in sorted((ROOT / "ops" / "fonts" / "stand-ins").glob("*.woff2")):
    font = TTFont(source)
    font.flavor = None
    font.save(folder / "fonts" / f"{source.stem}.ttf")
generic = "".join(f"<alias><family>{name}</family><prefer><family>{family}</family></prefer></alias>"
                  for name, family in [("sans-serif", "Roboto"), ("system-ui", "Roboto"), ("serif", "Roboto"),
                                       ("monospace", "Droid Sans Mono")])
(folder / "fonts.conf").write_text(
    '<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n'
    f"<fontconfig><dir>{folder / 'fonts'}</dir><cachedir>{folder / 'cache'}</cachedir>{generic}</fontconfig>\n",
    encoding="utf-8")
print(f"FONTCONFIG_FILE={folder / 'fonts.conf'}")
