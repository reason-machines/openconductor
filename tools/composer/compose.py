from pathlib import Path
from PIL import Image

root = Path('evidence/chat/composer/current')
for state in ['empty', 'focused', 'multiline', 'mention', 'plus', 'model']:
    reference = Image.open(root / f'reference-{state}.png').convert('RGB')
    ours = Image.open(root / f'ours-{state}.png').convert('RGB')
    top = 380 if state in ['plus', 'model'] else 700
    box = (256, top, 1046, 900)
    left, right = reference.crop(box), ours.crop(box)
    pair = Image.new('RGB', (1588, 900 - top), 'white')
    pair.paste(left, (0, 0))
    pair.paste(right, (798, 0))
    pair.save(root / f'pair-{state}.png')
    print(state, pair.size)
