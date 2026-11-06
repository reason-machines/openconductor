"""Compose unscaled reference/implementation screenshots with side labels."""
from pathlib import Path
from PIL import Image, ImageDraw

folder = Path("evidence/open-in/switcher/screens")
for state in ["first", "close", "palette-all", "palette-search", "palette-no-results"]:
    suffix = "" if state.startswith("palette") else "-crop"
    paths = [folder / f"{side}-{state}{suffix}.png" for side in ["reference", "ours"]]
    if not all(path.exists() for path in paths):
        continue
    reference, ours = [Image.open(path).convert("RGB") for path in paths]
    if state == "palette-all":
        reference = reference.crop((292, 148, 988, 672))
        ours = ours.crop((292, 148, 988, 672))
    canvas = Image.new("RGB", (reference.width + ours.width + 4, max(reference.height, ours.height) + 24), "#333333")
    draw = ImageDraw.Draw(canvas)
    draw.text((8, 5), "Conductor 0.87.6", fill="white")
    draw.text((reference.width + 12, 5), "OpenConductor", fill="white")
    canvas.paste(reference, (0, 24))
    canvas.paste(ours, (reference.width + 4, 24))
    canvas.save(folder / f"side-by-side-{state}.png")
