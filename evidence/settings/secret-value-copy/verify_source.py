"""Verify retained shipped bytes and their fresh-main caller join without executing them."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tarfile

parser = argparse.ArgumentParser()
parser.add_argument("archive", type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parent
receipt = json.loads((root / "source.json").read_text())
digest = lambda data: hashlib.sha256(data).hexdigest()
assert digest(args.archive.read_bytes()) == receipt["archive_sha256"]
assets = {}
with tarfile.open(args.archive) as handle:
    for name, expected in receipt["assets"].items():
        matches = [member for member in handle.getmembers() if member.isfile() and member.name.endswith("/" + name)]
        assert len(matches) == 1, name
        assets[name] = handle.extractfile(matches[0]).read()
        assert digest(assets[name]) == expected, name
for span in receipt["spans"]:
    start, end = span["utf8_half_open"]
    literal = assets[span["asset"]][start:end]
    assert digest(literal) == span["sha256"], span["name"]
    assert literal == (root / "reference" / span["file"]).read_bytes(), span["name"]
for pin in receipt["current_main_sources"]:
    source = subprocess.check_output(["git", "show", f'{receipt["checked_main"]}:{pin["path"]}'])
    assert digest(source) == pin["sha256"], pin["path"]
for pin in receipt["frozen_tests"]:
    assert digest(Path(pin["path"]).read_bytes()) == pin["sha256"], pin["path"]
print(f'PASS: original archive, {len(assets)} assets, {len(receipt["spans"])} exact spans, {len(receipt["current_main_sources"])} main source pins, and frozen fixtures')
print("Static source evidence only; no reference JavaScript, provider, credential, clipboard, app or native execution.")
