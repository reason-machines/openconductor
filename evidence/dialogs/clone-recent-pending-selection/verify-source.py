import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tarfile

root = Path(__file__).parent
source = json.loads((root / "source.json").read_text())
sha256 = lambda value: hashlib.sha256(value).hexdigest()
archive_path = Path(sys.argv[1])
assert sha256(archive_path.read_bytes()) == source["archive_sha256"]
with tarfile.open(archive_path) as archive:
    assets = {a["key"]: archive.extractfile(a["path"]).read() for a in source["assets"]}
for asset in source["assets"]:
    assert sha256(assets[asset["key"]]) == asset["sha256"]
for span in source["spans"]:
    start, end = span["utf8_half_open"]
    data = assets[span["asset"]][start:end]
    assert sha256(data) == span["sha256"]
    assert data.decode() == span["literal"]
for path, expected in source["counterparts"].items():
    data = subprocess.check_output(["git", "show", source["main_compared"] + ":" + path])
    assert sha256(data) == expected["sha256"]
old = (root / "baseline-clonePendingInputs.test.ts.txt").read_bytes()
assert sha256(old) == source["counterparts"]["src/components/clonePendingInputs.test.ts"]["sha256"]
expected, path = (root / "fixture.sha256").read_text().split()
assert sha256(Path(path).read_bytes()) == expected
print("PASS: archive, both retained assets, seven complete spans, current-main counterparts, original neighbor fixture and frozen new regression identity")
print("Static source identity only. No component, browser, native app or reference JavaScript executed.")
