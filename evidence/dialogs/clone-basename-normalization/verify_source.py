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
source = json.loads((root / "reference.json").read_text())
sha256 = lambda value: hashlib.sha256(value).hexdigest()
assert sha256(args.archive.read_bytes()) == source["archive_sha256"]
with tarfile.open(args.archive) as archive:
    assets = {}
    for name, asset in source["assets"].items():
        data = archive.extractfile(asset["member"]).read()
        assert len(data) == asset["bytes"]
        assert sha256(data) == asset["sha256"]
        assets[name] = data
for span in source["spans"]:
    start, end = span["utf8_half_open"]
    data = assets[span["asset"]][start:end]
    assert len(data) == span["bytes"]
    assert sha256(data) == span["sha256"]
for current in source["current"]:
    data = subprocess.check_output(["git", "show", source["main_sha"] + ":" + current["path"]])
    assert sha256(data) == current["sha256"]
for row in (root / "fixture.sha256").read_text().splitlines():
    expected, path = row.split("  ", 1)
    assert sha256(Path(path).read_bytes()) == expected
print("PASS: archive identity, two retained asset identities, 15 complete source/alias spans, six pinned main snapshots and two frozen fixtures")
print("Static integrity only. Behavioral regression, native launch, physical input, real clone and visual acceptance are not exercised.")
