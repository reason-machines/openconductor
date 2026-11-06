#!/usr/bin/env python3
"""Samples pixels of the workspace view and checks that Neutral is achromatic.

    python3 tools/palette/check-neutral-pixels.py [dir]

Reads <dir>/rects.json and the <palette>-<mode>.png screenshots written by
tools/palette/shoot.mjs. For the Neutral palette, in light and dark, every
sampled point (active tab underline, Run and Create PR buttons, user bubble,
panel, sidebar and composer backgrounds) must have equal red, green and blue. Stone is
sampled too, to show the check does detect a hue. Exit status 1 on failure.
"""
import json
import sys
from pathlib import Path

from PIL import Image

ACHROMATIC_POINTS = ["tabUnderline", "runButton", "createPrButton", "userBubble", "panel", "sidebar", "composer"]

# Achromatic is not enough: a mid-grey block is achromatic too. The composer
# background must be exactly the Neutral `muted` token (palettes.ts).
EXPECTED_NEUTRAL = {
    "neutral-light": {"composer": (245, 245, 245)},
    "neutral-dark": {"composer": (23, 23, 23)},
}


def sample(img, x, y):
    r, g, b = img.getpixel((int(x), int(y)))[:3]
    return (r, g, b)


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else ".oc-tmp/palette")
    rects = json.loads((root / "rects.json").read_text())
    failures = []
    rows = []
    for key in sorted(rects):
        palette, mode = key.split("-")
        if palette not in ("neutral", "stone"):
            continue
        img = Image.open(root / f"{key}.png").convert("RGB")
        pts = rects[key]
        for name in ACHROMATIC_POINTS:
            if name not in pts:
                failures.append(f"{key}: no sample point for {name}")
                continue
            p = pts[name]
            rgb = sample(img, p["x"], p["y"])
            achromatic = rgb[0] == rgb[1] == rgb[2]
            rows.append((key, name, rgb, achromatic))
            if palette == "neutral" and not achromatic:
                failures.append(f"{key}: {name} at ({p['x']},{p['y']}) is {rgb}, not achromatic")
            want = EXPECTED_NEUTRAL.get(key, {}).get(name)
            if want is not None and rgb != want:
                failures.append(f"{key}: {name} is {rgb}, expected muted {want}")
    for key, name, rgb, ok in rows:
        print(f"{key:14} {name:14} rgb{rgb}  {'achromatic' if ok else 'chromatic'}")
    stone_hued = sum(1 for k, _, _, ok in rows if k.startswith("stone") and not ok)
    print(f"stone samples with a hue: {stone_hued} (the check is discriminative when this is above 0)")
    if failures:
        print("\nFAIL")
        print("\n".join(failures))
        return 1
    print("\nPASS: every Neutral sample is achromatic")
    return 0


if __name__ == "__main__":
    sys.exit(main())
