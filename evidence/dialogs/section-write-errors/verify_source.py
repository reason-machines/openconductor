from pathlib import Path
import hashlib
import json
import subprocess

root = Path(__file__).resolve().parent
repo = root.parents[2]
source = json.loads((root / "source.json").read_text())
sha = lambda data: hashlib.sha256(data).hexdigest()
for span in source["spans"]:
    data = (root / span["file"]).read_bytes()
    assert len(data) == span["bytes"], span["name"]
    assert sha(data) == span["sha256"], span["name"]
for item in source["current_sources"]:
    data = subprocess.check_output(["git", "show", source["requalified_main"] + ":" + item["repository_path"]], cwd=repo)
    assert sha(data) == item["sha256"], item["repository_path"]
for item in source["frozen_files"]:
    assert sha((repo / item["path"]).read_bytes()) == item["sha256"], item["path"]
fixture_sha, path = (root / "fixture.sha256").read_text().split()
assert sha((repo / path).read_bytes()) == fixture_sha, path
print("PASS: 30 retained span hashes, 5 pinned source snapshots, 8 frozen files, unchanged regression hash. No runtime verification.")
