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
source = json.loads((root / "source.json").read_text())
sha256 = lambda value: hashlib.sha256(value).hexdigest()
assert sha256(args.archive.read_bytes()) == source["archive_sha256"]
with tarfile.open(args.archive) as archive:
    renderer = archive.extractfile(source["renderer_member"]).read()
assert sha256(renderer) == source["renderer_sha256"]
for span in source["spans"]:
    start, end = span["utf8_half_open"]
    value = renderer[start:end]
    assert sha256(value) == span["sha256"]
    assert value.decode() == span["literal"]
url = next(span["literal"] for span in source["spans"] if span["name"] == "url-input-call")
assert 'autoCorrect:"off",autoCapitalize:"off"' in url
baseline = subprocess.check_output(["git", "show", source["main_compared"] + ":" + source["counterpart"]["path"]])
assert sha256(baseline) == source["counterpart"]["sha256"]
assert b'autoCorrect=' not in baseline and b'autoCapitalize=' not in baseline
print("PASS: exact archive, renderer, full retained declarations and fresh-main baseline identities")
print("Source identity only. Browser, native and physical text correction are not exercised.")
