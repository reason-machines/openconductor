import argparse
import hashlib
import json
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--renderer", required=True)
args = parser.parse_args()
root = Path(__file__).parent
record = json.loads((root / "reference.json").read_text())
asset = Path(args.renderer).read_bytes()
sha = lambda data: hashlib.sha256(data).hexdigest()
assert len(asset) == record["reference"]["asset_bytes"]
assert sha(asset) == record["reference"]["asset_sha256"]
for span in record["spans"]:
    start, end = span["utf8_half_open"]
    data = asset[start:end]
    assert data == span["source"].encode(), span["name"]
    assert len(data) == span["bytes"], span["name"]
    assert sha(data) == span["sha256"], span["name"]
    for anchor in record["anchor_checks"].get(span["name"], []):
        assert span["source"].count(anchor) == 1, (span["name"], anchor)
for pin in record["current_pins"]:
    data = subprocess.check_output(["git", "show", f'{record["main"]}:{pin["path"]}'])
    assert len(data) == pin["bytes"], pin["path"]
    assert sha(data) == pin["sha256"], pin["path"]
fixture = Path("src/components/homeRowLabels.test.ts").read_bytes()
assert fixture == (root / "fixture-v1.ts.txt").read_bytes()
print(json.dumps({"result": "PASS", "baseline_main": record["main"], "original_asset": sha(asset), "complete_spans": len(record["spans"]), "baseline_pins": len(record["current_pins"]), "fixture_sha256": sha(fixture), "execution": "NOT_RUN"}))
