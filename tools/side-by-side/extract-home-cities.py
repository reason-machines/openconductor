"""Extract only city-name facts from the verified Conductor frontend, without executing it."""
import argparse
import hashlib
import json
import re
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("bundle", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
source = args.bundle.read_text()
match = re.search(r'\bUy=(\[\{name:.*?\]);function Hy\(', source)
if match is None:
    raise SystemExit("City data boundary was not found; inspect the new artifact before changing the extractor")
records = re.findall(r'\{name:("(?:[^"\\]|\\.)*"),coordinates:\[[^\]]+\],tier:"(?:legendary|rare|uncommon|common)"\}', match[1])
slugs = sorted(re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", re.sub(r"[.'’]", "", json.loads(name).lower()))) for name in records)
if len(slugs) != 385 or len(set(slugs)) != 385:
    raise SystemExit(f"Unexpected catalogue: {len(slugs)} names, {len(set(slugs))} unique; inspect before updating")
lines = ["// City-name facts from Conductor 0.87.6; reproduced by tools/side-by-side/extract-home-cities.py.", "// Provenance and extraction boundary: evidence/home-details/README.md.", "export const HOME_CITY_SLUGS: readonly string[] = ["]
lines.extend("  " + json.dumps(slug) + "," for slug in slugs)
lines.append("];")
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text("\n".join(lines) + "\n")
print(json.dumps({"bundle_sha256": hashlib.sha256(args.bundle.read_bytes()).hexdigest(), "data_offset": match.start(1), "data_length": len(match[1]), "unique_cities": len(slugs), "output_sha256": hashlib.sha256(args.output.read_bytes()).hexdigest()}))
