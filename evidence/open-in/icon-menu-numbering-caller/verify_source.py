from pathlib import Path
import argparse
import hashlib
import json
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]


def sha(data):
    return hashlib.sha256(data).hexdigest()


parser = argparse.ArgumentParser(description="Verify inert Conductor excerpts and the frozen component regression")
parser.add_argument("--asset", type=Path)
args = parser.parse_args()
manifest = json.loads((HERE / "manifest.json").read_text())
asset = args.asset.read_bytes() if args.asset else None
if asset is not None:
    assert sha(asset) == manifest["reference_asset"]["sha256"]
for pin in manifest["reference_spans"]:
    data = (HERE / "source" / (pin["symbol"] + ".txt")).read_bytes()
    assert sha(data) == pin["sha256"], pin["symbol"]
    if asset is not None:
        assert asset[pin["utf8_byte_start"]:pin["utf8_byte_end"]] == data, pin["symbol"]
button_path = "src/features/openIn/OpenInButton.tsx"
for name, expected in manifest["baseline_files"].items():
    baseline = subprocess.check_output(["git", "show", manifest["baseline_main"] + ":" + name], cwd=ROOT)
    assert sha(baseline) == expected, name
    if name == button_path:
        original = baseline.decode()
    elif name == "src/features/diff/filePathChipAlacritty.test.ts":
        migration = ROOT / "evidence/open-in/vscode-workspace-context/fixture-migration-v2"
        assert sha((migration / "filePathChipAlacritty.v1.test.ts.txt").read_bytes()) == expected
        subprocess.run(["python3", str(migration / "verify.py")], check=True)
    else:
        assert sha((ROOT / name).read_bytes()) == expected, "Unleased neighbor changed: " + name
candidate = original
for old, new in manifest["replacements"]:
    assert candidate.count(old) == 1, old
    candidate = candidate.replace(old, new)
assert sha(candidate.encode()) == manifest["candidate_source_sha256"]
current = (ROOT / button_path).read_text()
assert current in [original, candidate], "Product diff exceeds the three split guards"
fixture = (ROOT / manifest["regression_file"]).read_bytes()
assert sha(fixture) == manifest["regression_sha256"], "Frozen caller regression changed"
print(json.dumps({
    "baseline_main": manifest["baseline_main"],
    "reference_spans_verified": len(manifest["reference_spans"]),
    "full_asset_compared": asset is not None,
    "baseline_files_verified": len(manifest["baseline_files"]),
    "regression_sha256": sha(fixture),
    "product_candidate_applied": current == candidate,
    "behavioral_red_green": "NOT_EVALUATED_BY_THIS_STATIC_CHECK",
}, indent=2))
