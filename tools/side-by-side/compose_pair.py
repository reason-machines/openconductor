"""Puts a Conductor capture (left) next to an OpenConductor capture (right) at the same
size, with a label above each, and optionally a 2x crop of one region of both.
Pillow only.

    python3 tools/side-by-side/compose_pair.py <conductor.png> <openconductor.png> <out.png> \
        [--left-label TEXT] [--right-label TEXT] [--crop x,y,w,h <crop-out.png>]
"""
import argparse
from PIL import Image, ImageDraw

BAR = 28
GUTTER = 8


def pair(a, b, labels, scale=1):
    w, h = a.width * scale, a.height * scale
    out = Image.new("RGB", (w * 2 + GUTTER, h + BAR), (60, 60, 60))
    for i, (img, label) in enumerate(zip((a, b), labels)):
        x = i * (w + GUTTER)
        out.paste(img.resize((w, h), Image.NEAREST) if scale != 1 else img, (x, BAR))
        ImageDraw.Draw(out).text((x + 8, 8), label, fill=(255, 255, 255))
    return out


p = argparse.ArgumentParser()
p.add_argument("ref")
p.add_argument("oc")
p.add_argument("out")
p.add_argument("--left-label", default="Conductor 0.87.6 (harness render, REA capture)")
p.add_argument("--right-label", default="OpenConductor")
p.add_argument("--crop", nargs=2, metavar=("X,Y,W,H", "OUT"))
a = p.parse_args()
ref = Image.open(a.ref).convert("RGB")
oc = Image.open(a.oc).convert("RGB")
assert ref.size == oc.size, (ref.size, oc.size)
labels = (a.left_label, a.right_label)
pair(ref, oc, labels).save(a.out, optimize=True)
if a.crop:
    x, y, w, h = (int(v) for v in a.crop[0].split(","))
    box = (x, y, x + w, y + h)
    pair(ref.crop(box), oc.crop(box), labels, scale=2).save(a.crop[1], optimize=True)
