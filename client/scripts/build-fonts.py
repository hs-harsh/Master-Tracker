#!/usr/bin/env python3
"""
Generate the self-hosted font subsets in client/public/fonts/.

Run this only when the font stack changes; the generated .woff2 files are
committed, so a normal build/dev run does NOT need Python or fonttools.

    pip install 'fonttools[woff]' brotli
    python client/scripts/build-fonts.py

Source of truth for the raw faces is the three @fontsource-variable packages
(devDependencies). This script does two things they cannot do on their own:

 1. Narrows each variable font's `wght` axis to the range the design system
    actually uses, which is where most of the size saving comes from.

 2. Emits a supplemental face for U+20B9 (the rupee sign).
    THIS IS LOAD-BEARING. Verified by cmap inspection:
      - Outfit          -> has NO U+20B9 in any subset
      - JetBrains Mono  -> has NO U+20B9 in any subset (Google Fonts build)
      - Inter           -> has U+20B9, in `latin-ext` only
    The rupee is this app's primary currency symbol (71 uses across 13 files),
    so without this face it falls back to an arbitrary system font mid-figure.
    Pulling all of Inter's latin-ext just for one glyph costs 83KB; subsetting
    it to the single codepoint costs ~1KB.
"""

import os
import sys

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

HERE = os.path.dirname(os.path.abspath(__file__))
CLIENT = os.path.dirname(HERE)
NM = os.path.join(CLIENT, "node_modules", "@fontsource-variable")
OUT = os.path.join(CLIENT, "public", "fonts")

# The `latin` subset Google/Fontsource ship. Everything the app renders lives
# here except U+20B9, which is handled separately below.
LATIN = (
    "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,"
    "U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,"
    "U+2212,U+2215,U+FEFF,U+FFFD"
)

# (output name, source woff2, unicode spec, wght range kept)
#
# Ranges are set from an audit of what the JSX actually asks for, so that no
# call site silently clamps (and so nothing ships that nothing uses):
#   font-display -> 500, 600, 700   + 300 for the .type-display-* ramp
#   font-body    -> 600 max         (Inter 300 was loaded but never used)
#   font-mono    -> 400, 500, 600, 700 + 300 for .stat-hero / .stat-value
JOBS = [
    ("outfit-latin.woff2",         "outfit/files/outfit-latin-wght-normal.woff2",                 LATIN,     (300, 700)),
    ("inter-latin.woff2",          "inter/files/inter-latin-wght-normal.woff2",                   LATIN,     (400, 600)),
    ("jetbrains-mono-latin.woff2", "jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2", LATIN,     (300, 700)),
    # Supplemental rupee face, carved out of Inter's latin-ext. Kept at the
    # full 300-700 so the symbol tracks the weight of the figure it prefixes
    # (300 in .stat-hero, 700 in bold mono). At ~1KB the extra range is free.
    ("rupee.woff2",                "inter/files/inter-latin-ext-wght-normal.woff2",               "U+20B9",  (300, 700)),
]


def build(out_name, src_rel, unicodes, wght):
    src = os.path.join(NM, src_rel)
    if not os.path.exists(src):
        sys.exit(f"missing source font: {src}\nrun `npm install` in client/ first")

    font = TTFont(src)

    # Subset BEFORE instancing. Doing it the other way round leaves the
    # variation tables referencing glyphs the subsetter removed (fonttools
    # then dies with a KeyError on e.g. 'CR').
    opts = subset.Options()
    opts.layout_features = ["*"]
    opts.name_IDs = ["*"]
    opts.notdef_outline = True
    opts.recalc_bounds = True
    opts.drop_tables += ["DSIG"]

    subsetter = subset.Subsetter(options=opts)
    subsetter.populate(unicodes=subset.parse_unicodes(unicodes))
    subsetter.subset(font)

    lo, hi = wght
    if "fvar" in font:
        axes = {a.axisTag: (a.minValue, a.maxValue) for a in font["fvar"].axes}
        if "wght" in axes:
            amin, amax = axes["wght"]
            lo_c, hi_c = max(lo, amin), min(hi, amax)
            # Keep it variable, just clamp the axis to the range we ship.
            font = instancer.instantiateVariableFont(
                font, {"wght": (lo_c, lo_c, hi_c)}, updateFontNames=False
            )

    font.flavor = "woff2"
    dest = os.path.join(OUT, out_name)
    font.save(dest)

    cmap = TTFont(dest).getBestCmap()
    size = os.path.getsize(dest)
    print(f"  {out_name:28} {size/1024:6.1f} KB  {len(cmap):4} glyphs  wght {lo}-{hi}")
    return size, cmap


def main():
    os.makedirs(OUT, exist_ok=True)
    print("building font subsets ->", OUT)
    total = 0
    rupee_ok = False
    for name, src, uni, wght in JOBS:
        size, cmap = build(name, src, uni, wght)
        total += size
        if name == "rupee.woff2":
            rupee_ok = 0x20B9 in cmap

    print(f"  {'TOTAL':28} {total/1024:6.1f} KB")
    if not rupee_ok:
        sys.exit("FAIL: U+20B9 missing from rupee.woff2")
    print("  U+20B9 present in rupee.woff2: OK")


if __name__ == "__main__":
    main()
