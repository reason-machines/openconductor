"""Side-by-side of one UI map state: Conductor's render left, OpenConductor right, same size.

    python3 tools/side-by-side/pair.py <conductor.png> <openconductor.png> <out.png> \
        [--crop x,y,w,h] [--scale 2] [--left "Conductor 0.87.6 (harness render)"] [--right "OpenConductor abc1234"]

The UI map's references (parity/ui-map/ref) are Conductor's extracted frontend in Chromium, so
the default left label says "harness render" (parity/side-by-side/README.md). Pillow only.
"""
import argparse
from PIL import Image, ImageDraw

BAR = 28
GUTTER = 8


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("ref")
    ap.add_argument("oc")
    ap.add_argument("out")
    ap.add_argument("--crop")
    ap.add_argument("--scale", type=int, default=1)
    ap.add_argument("--left", default="Conductor 0.87.6 (harness render)")
    ap.add_argument("--right", default="OpenConductor")
    a = ap.parse_args()
    ref = Image.open(a.ref).convert("RGB")
    oc = Image.open(a.oc).convert("RGB")
    assert ref.size == oc.size, (ref.size, oc.size)
    if a.crop:
        x, y, w, h = (int(v) for v in a.crop.split(","))
        ref, oc = ref.crop((x, y, x + w, y + h)), oc.crop((x, y, x + w, y + h))
    w, h = ref.width * a.scale, ref.height * a.scale
    out = Image.new("RGB", (w * 2 + GUTTER, h + BAR), (60, 60, 60))
    for i, (img, label) in enumerate(((ref, a.left), (oc, a.right))):
        x = i * (w + GUTTER)
        out.paste(img.resize((w, h), Image.NEAREST) if a.scale != 1 else img, (x, BAR))
        ImageDraw.Draw(out).text((x + 8, 8), label, fill=(255, 255, 255))
    out.save(a.out, optimize=True)


if __name__ == "__main__":
    main()
