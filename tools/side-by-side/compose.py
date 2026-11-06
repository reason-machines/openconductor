"""Puts the real Conductor capture (left) next to OpenConductor (right), same
1440x900 window, plus a 2x crop of the right panel. Pillow only.

    python3 tools/side-by-side/compose.py <conductor.png> <openconductor.png> <out-prefix>
"""
import sys
from PIL import Image, ImageDraw

ref_path, oc_path, prefix = sys.argv[1:4]
ref = Image.open(ref_path).convert("RGB")
oc = Image.open(oc_path).convert("RGB")
assert ref.size == oc.size == (1440, 900), (ref.size, oc.size)
BAR = 28


def pair(a, b, labels, scale=1):
    w, h = a.width * scale, a.height * scale
    out = Image.new("RGB", (w * 2 + 8, h + BAR), (60, 60, 60))
    for i, (img, label) in enumerate(zip((a, b), labels)):
        x = i * (w + 8)
        out.paste(img.resize((w, h), Image.NEAREST) if scale != 1 else img, (x, BAR))
        ImageDraw.Draw(out).text((x + 8, 8), label, fill=(255, 255, 255))
    return out


pair(ref, oc, ("Conductor 0.87.6 (REA capture)", "OpenConductor")).save(f"{prefix}--window.png", optimize=True)
# Each app's right panel, from its own left edge (Conductor's chat column is wider,
# so its panel starts further right), on canvases of the same size.
def panel(img, left):
    c = Image.new("RGB", (540, 900), (60, 60, 60))
    c.paste(img.crop((left, 0, 1440, 900)), (0, 0))
    return c


ref_left, oc_left = (int(v) for v in (sys.argv[4:6] if len(sys.argv) > 5 else (1045, 914)))
pair(panel(ref, ref_left), panel(oc, oc_left), ("Conductor", "OpenConductor"), scale=2).save(f"{prefix}--panel-2x.png", optimize=True)
