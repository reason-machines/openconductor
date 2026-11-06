import json
import math
from pathlib import Path

from PIL import Image, ImageDraw

root = Path("evidence/chat/responsive")
for state in ["compact", "revealed"]:
    crops = []
    for app in ["reference", "openconductor"]:
        data = json.loads((root / f"{app}.json").read_text())
        footer = data["footer"]
        image = Image.open(root / f"{app}-{state}.png").convert("RGB")
        box = (
            math.floor(footer["x"]) - 8,
            math.floor(footer["y"]) - 8,
            math.ceil(footer["x"] + footer["width"]) + 8,
            math.ceil(footer["y"]) + 76,
        )
        crop = image.crop(box)
        crop.save(root / f"{app}-{state}-footer.png")
        crops.append(crop)
    width = max(c.width for c in crops)
    height = max(c.height for c in crops)
    pair = Image.new("RGB", (width * 2 + 8, height + 28), "white")
    draw = ImageDraw.Draw(pair)
    for i, (label, crop) in enumerate(zip(["Conductor 0.87.6", "OpenConductor"], crops)):
        x = i * (width + 8)
        draw.text((x + 8, 8), label, fill="black")
        pair.paste(crop, (x, 28))
    pair.save(root / f"side-by-side-{state}.png")
