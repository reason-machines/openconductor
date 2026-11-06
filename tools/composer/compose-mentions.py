from pathlib import Path
from PIL import Image

root = Path("evidence/chat/composer/mentions")
box = (256, 700, 1046, 900)
for name, left, right in [
    ("before-after", "before/ours-chip.png", "ours-chip.png"),
    ("reference-after", "reference-chip.png", "ours-chip.png"),
]:
    pair = Image.new("RGB", (1588, 200), "white")
    pair.paste(Image.open(root / left).convert("RGB").crop(box), (0, 0))
    pair.paste(Image.open(root / right).convert("RGB").crop(box), (798, 0))
    pair.save(root / f"{name}.png")
