import argparse
import hashlib
import json
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--original-dir", type=Path)
parser.add_argument("--baseline-ref")
args = parser.parse_args()
root = Path(__file__).resolve().parent
checkout = root.parents[2]
proof = json.loads((root / "source.json").read_text())
if args.original_dir:
    for name, expected in proof["asset_sha256"].items():
        assert hashlib.sha256((args.original_dir / name).read_bytes()).hexdigest() == expected, name
for span in proof["spans"]:
    data = (root / "reference" / span["path"]).read_bytes()
    assert len(data) == span["bytes"], span["path"]
    assert hashlib.sha256(data).hexdigest() == span["sha256"], span["path"]
    if args.original_dir:
        start, end = span["utf8_half_open"]
        assert data == (args.original_dir / span["asset"]).read_bytes()[start:end], span["path"]
for baseline in proof["baseline_sources"]:
    data = (root / baseline["path"]).read_bytes()
    assert len(data) == baseline["bytes"], baseline["path"]
    assert hashlib.sha256(data).hexdigest() == baseline["sha256"], baseline["path"]
    if args.baseline_ref:
        assert args.baseline_ref == proof["qualified_main"]
        original = subprocess.check_output(
            ["git", "show", f"{args.baseline_ref}:{baseline['source']}"], cwd=checkout
        )
        assert original == data, baseline["source"]
fixture = proof["fixture"]
data = (checkout / fixture["path"]).read_bytes()
assert hashlib.sha256(data).hexdigest() == fixture["sha256"], fixture["path"]
assert data.count(b'\ntest("') == fixture["cases"]
print(json.dumps({"reference_spans": len(proof["spans"]), "fixture_cases": fixture["cases"], "full_asset_rebind": bool(args.original_dir), "baseline_sources": len(proof["baseline_sources"]), "baseline_ref_checked": args.baseline_ref, "identity": "PASS", "behavior": "NOT_RUN"}))
