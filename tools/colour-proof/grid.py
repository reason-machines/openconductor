# Builds the palette x light/dark grid and a marked-up Neutral pair from the
# screenshots capture.mjs wrote.
#
#   python3 tools/colour-proof/grid.py evidence/colour-proof/pr550-palettes
#
# Writes <dir>/grid.png (rows: palettes, columns: light, dark; half scale) and
# <dir>/neutral-marked.png (Neutral light and dark at full scale, each sample
# point circled and labelled with its RGB from samples.json).
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

d = Path(sys.argv[1])
samples = json.loads((d / "samples.json").read_text())
order = [r["palette"] for r in samples["results"]]
palettes = list(dict.fromkeys(order))
schemes = ["light", "dark"]
scale, label_w, head_h, pad = 0.5, 110, 34, 8
w, h = int(1440 * scale), int(900 * scale)
grid = Image.new("RGB", (label_w + len(schemes) * (w + pad), head_h + len(palettes) * (h + pad)), "white")
g = ImageDraw.Draw(grid)
for j, s in enumerate(schemes):
    g.text((label_w + j * (w + pad) + w // 2 - 15, 10), s, fill="black")
for i, p in enumerate(palettes):
    y = head_h + i * (h + pad)
    g.text((10, y + h // 2), p.capitalize(), fill="black")
    for j, s in enumerate(schemes):
        shot = Image.open(d / f"{p}--{s}.png").convert("RGB").resize((w, h), Image.LANCZOS)
        grid.paste(shot, (label_w + j * (w + pad), y))
grid.save(d / "grid.png", optimize=True)

pair = []
for r in samples["results"]:
    if r["palette"] != "neutral":
        continue
    img = Image.open(d / r["file"]).convert("RGB")
    dr = ImageDraw.Draw(img)
    for k, s in r["samples"].items():
        x, y = s["at"]
        dr.ellipse((x - 9, y - 9, x + 9, y + 9), outline=(255, 0, 255), width=3)
        tx = x - 230 if x > 1200 else x + 14
        txt = f"{k} {s['hex']} d{s['spread']}"
        dr.rectangle((tx - 3, y - 20, tx + 7 * len(txt), y - 4), fill=(255, 0, 255))
        dr.text((tx, y - 19), txt, fill="white")
    pair.append(img)
if pair:
    out = Image.new("RGB", (sum(i.width for i in pair) + pad * (len(pair) - 1), pair[0].height), "white")
    x = 0
    for i in pair:
        out.paste(i, (x, 0))
        x += i.width + pad
    out.save(d / "neutral-marked.png", optimize=True)
