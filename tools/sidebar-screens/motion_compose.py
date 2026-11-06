"""Composes motion frames side by side (Conductor left, OpenConductor right).

    python3 motion_compose.py <spec.json> <out_dir>

spec: {"scene": str, "frames": [{"label", "t", "left", "right"}]}. Writes
<out_dir>/<scene>.png (frames stacked as rows, labelled) and <out_dir>/<scene>.mp4
(each pair held until the next frame's time, 30 fps, last frame held 600 ms).
"""
import json
import os
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw

GAP = 8
LABEL_H = 22
BG = (24, 22, 21)
FG = (235, 235, 235)


def pair(left_path, right_path, label):
    left = Image.open(left_path).convert("RGB")
    right = Image.open(right_path).convert("RGB")
    # Small crops (a single button) are enlarged 6x, nearest-neighbour, so a 3% press is visible.
    if left.width < 120:
        left = left.resize((left.width * 6, left.height * 6), Image.NEAREST)
        right = right.resize((right.width * 6, right.height * 6), Image.NEAREST)
    w = left.width + GAP + right.width
    h = max(left.height, right.height) + LABEL_H
    img = Image.new("RGB", (w, h), BG)
    d = ImageDraw.Draw(img)
    d.text((6, 5), f"Conductor  {label}", fill=FG)
    d.text((left.width + GAP + 6, 5), f"OpenConductor  {label}", fill=FG)
    img.paste(left, (0, LABEL_H))
    img.paste(right, (left.width + GAP, LABEL_H))
    return img


def main():
    spec = json.load(open(sys.argv[1]))
    out = sys.argv[2]
    pairs = [pair(f["left"], f["right"], f["label"]) for f in spec["frames"]]
    # Strip: at most 4 pairs per row.
    per_row = 4
    rows = [pairs[i:i + per_row] for i in range(0, len(pairs), per_row)]
    pw, ph = pairs[0].width, pairs[0].height
    strip = Image.new("RGB", (per_row * pw + (per_row - 1) * GAP * 2, len(rows) * ph + (len(rows) - 1) * GAP * 2), (60, 60, 60))
    for r, row in enumerate(rows):
        for c, p in enumerate(row):
            strip.paste(p, (c * (pw + GAP * 2), r * (ph + GAP * 2)))
    png = os.path.join(out, f"{spec['scene']}.png")
    strip.save(png, optimize=True)
    # Video: hold each pair for its real duration (min one frame at 30 fps).
    with tempfile.TemporaryDirectory() as tmp:
        lines = []
        frames = spec["frames"]
        for i, (f, p) in enumerate(zip(frames, pairs)):
            fp = os.path.join(tmp, f"{i:03d}.png")
            p.save(fp)
            nxt = frames[i + 1]["t"] if i + 1 < len(frames) and frames[i + 1]["t"] > f["t"] else f["t"] + 600
            lines.append(f"file '{fp}'\nduration {max(nxt - f['t'], 34) / 1000:.3f}\n")
        lines.append(f"file '{os.path.join(tmp, f'{len(pairs) - 1:03d}.png')}'\n")
        listing = os.path.join(tmp, "list.txt")
        open(listing, "w").write("".join(lines))
        mp4 = os.path.join(out, f"{spec['scene']}.mp4")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listing,
                        "-vf", "fps=30,pad=ceil(iw/2)*2:ceil(ih/2)*2", "-pix_fmt", "yuv420p", mp4], check=True)
    print(f"{spec['scene']}: {png} {mp4}")


main()
