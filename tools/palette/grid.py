#!/usr/bin/env python3
"""Side-by-side grid of the workspace view: palettes across, light over dark.

    python3 tools/palette/grid.py [dir] [out.png]

Reads <dir>/<palette>-<mode>.png (from tools/palette/shoot.mjs) and writes one
PNG: a row per mode, a column per palette, each shot at half size.
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

PALETTES = ["neutral", "stone", "blue", "slate", "zinc"]
MODES = ["light", "dark"]
SCALE = 0.5
LABEL_H = 34
GAP = 12
MARGIN = 16

root = Path(sys.argv[1] if len(sys.argv) > 1 else ".oc-tmp/palette")
out = Path(sys.argv[2] if len(sys.argv) > 2 else root / "grid.png")
shot = {}
for m in MODES:
    for p in PALETTES:
        shot[(p, m)] = Image.open(root / f"{p}-{m}.png").convert("RGB")
w, h = next(iter(shot.values())).size
tw, th = int(w * SCALE), int(h * SCALE)
cols, rows = len(PALETTES), len(MODES)
W = MARGIN * 2 + cols * tw + (cols - 1) * GAP
H = MARGIN * 2 + rows * (th + LABEL_H) + (rows - 1) * GAP
canvas = Image.new("RGB", (W, H), (128, 128, 128))
draw = ImageDraw.Draw(canvas)
try:
    font = ImageFont.truetype("DejaVuSans.ttf", 16)
except OSError:
    font = ImageFont.load_default()
for r, m in enumerate(MODES):
    for c, p in enumerate(PALETTES):
        x = MARGIN + c * (tw + GAP)
        y = MARGIN + r * (th + LABEL_H + GAP)
        draw.text((x, y + 8), f"{p.capitalize()} · {m}", fill=(255, 255, 255), font=font)
        canvas.paste(shot[(p, m)].resize((tw, th), Image.LANCZOS), (x, y + LABEL_H))
canvas.save(out)
print(f"wrote {out} {W}x{H}")
