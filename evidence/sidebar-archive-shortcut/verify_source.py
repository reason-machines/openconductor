import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--renderer", type=Path, required=True)
parser.add_argument("--index", type=Path, required=True)
parser.add_argument("--fixture", type=Path, default=Path("src/components/sidebarArchiveShortcut.test.ts"))
parser.add_argument("--baseline", action="store_true")
args = parser.parse_args()
folder = Path(__file__).resolve().parent
source = json.loads((folder / "source.json").read_text())
assets = {"renderer": args.renderer.read_bytes(), "index": args.index.read_bytes()}
sha256 = lambda data: hashlib.sha256(data).hexdigest()
for asset, data in assets.items():
    assert sha256(data) == source["reference_assets"][asset], asset
for span in source["spans"]:
    data = assets[span["asset"]][span["start"]:span["end"]]
    assert data == (folder / span["retained"]).read_bytes(), span["symbol"]
    assert sha256(data) == span["sha256"], span["symbol"]
assert sha256(args.fixture.read_bytes()) == source["fixture_sha256"], "frozen regression"
if args.baseline:
    for path, digest in source["baseline_pins"].items():
        assert sha256(Path(path).read_bytes()) == digest, path
print(f"PASS: two original assets, {len(source['spans'])} exact spans, frozen seven-case fixture" + (", six baseline pins" if args.baseline else ""))
