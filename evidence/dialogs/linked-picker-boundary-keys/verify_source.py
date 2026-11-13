"""Verify retained Conductor declarations without executing target JavaScript."""
import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--assets", type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parent
receipt = json.loads((root / "source.json").read_text())
asset = (args.assets / receipt["asset"]).read_bytes() if args.assets else None
if asset is not None:
    assert len(asset) == receipt["bytes"]
    assert hashlib.sha256(asset).hexdigest() == receipt["sha256"]
for span in receipt["spans"]:
    retained = (root / span["file"]).read_bytes()
    assert len(retained) == span["end"] - span["start"], span["name"]
    assert hashlib.sha256(retained).hexdigest() == span["sha256"], span["name"]
    if asset is not None:
        assert asset[span["start"]:span["end"]] == retained, span["name"]
command = (root / "reference/Xyi.txt").read_text()
assert 'case"Home":{ce.preventDefault(),X(0);break}' in command
assert 'case"End":{ce.preventDefault(),te();break}' in command
assert 'let te=()=>X(K().length-1)' in command
assert 'ue.dispatchEvent(pe)' in command
assert 'loop:!0' in (root / "reference/Y5s.txt").read_text()
linked = (root / "reference/Auo.txt").read_text()
assert '{shouldFilter:!1,value:o,onValueChange:a}' in linked
assert 'onToggle:()=>U(Le)' in linked
assert 'targetWorkspaceId:De.localId' in linked
print(f"PASS {len(receipt['spans'])} retained declarations" + (" and complete shipped asset" if asset else " (original asset not supplied)"))
