from pathlib import Path
from PIL import Image

output = Path("evidence/chat/linked-directory")
for name, reference, ours in [("picker", "reference-add.png", "ours-picker.png"), ("search", "reference-search.png", "ours-search.png")]:
    left = Image.open(output / reference).crop((420, 188, 1020, 554))
    right = Image.open(output / ours).crop((420, 188, 1020, 554))
    pair = Image.new("RGB", (1200, 366))
    pair.paste(left, (0, 0))
    pair.paste(right, (600, 0))
    pair.save(output / f"pair-{name}.png")
