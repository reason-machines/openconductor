"""Stack transition frames into one strip per step: a row per build, a column per time.

    python3 tools/transitions/stitch.py <out.png> <step-title> <t0,t1,...> <label>=<dir>/<prefix> ...

Each row reads <dir>/<prefix>-<t>.png for every t; rows of different window sizes are scaled to one width.
CROP=x,y,w,h (fractions of each frame) keeps only that region, e.g. the dialog.
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFont

out, title, times, *rows = sys.argv[1:]
times = times.split(",")
W, LABEL, HEAD = 360, 150, 62
crop = [float(v) for v in os.environ["CROP"].split(",")] if os.environ.get("CROP") else None
font = ImageFont.load_default(size=15)
loaded = []
for row in rows:
    label, spec = row.split("=", 1)
    frames = [Image.open(f"{spec}-{t}.png").convert("RGB") for t in times]
    if crop:
        frames = [f.crop((round(crop[0] * f.width), round(crop[1] * f.height), round((crop[0] + crop[2]) * f.width), round((crop[1] + crop[3]) * f.height))) for f in frames]
    h = round(frames[0].height * W / frames[0].width)
    loaded.append((label, [f.resize((W, h), Image.LANCZOS) for f in frames], h))
H = HEAD + sum(h + 6 for _, _, h in loaded)
sheet = Image.new("RGB", (LABEL + W * len(times) + 6 * (len(times) - 1), H), (24, 24, 24))
d = ImageDraw.Draw(sheet)
d.text((8, 9), title, fill=(235, 235, 235), font=font)
for i, t in enumerate(times):
    d.text((LABEL + i * (W + 6) + 4, 36), f"{t} ms", fill=(170, 170, 170), font=font)
y = HEAD
for label, frames, h in loaded:
    d.multiline_text((8, y + 8), label, fill=(235, 235, 235), font=font, spacing=4)
    for i, f in enumerate(frames):
        sheet.paste(f, (LABEL + i * (W + 6), y))
    y += h + 6
sheet.save(out)
