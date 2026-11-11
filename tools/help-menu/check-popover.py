"""Compare Help fill samples in unmodified 1280x820 screenshots."""
import argparse
import json
from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument("reference")
parser.add_argument("actual")
parser.add_argument("--reference-focus-y", type=int, default=445)
parser.add_argument("--actual-focus-y", type=int, default=480)
args = parser.parse_args()


def samples(filename, focus_y):
    with Image.open(filename) as image:
        assert image.size == (1280, 820), f"Unexpected viewport: {image.size}"
        image = image.convert("RGB")
        return {
            "background": image.getpixel((500, 700)),
            "focused_row": image.getpixel((400, focus_y)),
        }


reference = samples(args.reference, args.reference_focus_y)
actual = samples(args.actual, args.actual_focus_y)
print(json.dumps({"reference": reference, "actual": actual}))
assert actual == reference, "Help background or focused row differs from the reference"
print("PASS: both Help fill samples match; this does not establish whole-screen parity")
