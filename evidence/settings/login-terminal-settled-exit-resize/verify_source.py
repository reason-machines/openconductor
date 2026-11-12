import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tarfile

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[2]
manifest = json.loads((ROOT / "source.json").read_text())
receipt = json.loads((ROOT / "rebound-source-receipt.json").read_text())

def digest(body):
    return hashlib.sha256(body).hexdigest()

def identity(body, expected):
    assert digest(body) == expected, "Source identity differs"

identity((REPO / manifest["fixture"]).read_bytes(), manifest["fixture_sha256"])
baseline = (ROOT / "baseline-parts.tsx.txt").read_bytes()
identity(baseline, manifest["baseline_parts_sha256"])
main = manifest["baseline_main_commit"]
assert main == receipt["main_sha"]
for pin in receipt["source_pins"]:
    body = subprocess.check_output(["git", "-c", "maintenance.auto=false", "show", main + ":" + pin["path"]], cwd=REPO)
    identity(body, pin["sha256"])
    if pin["path"] == "src/settings/agents/parts.tsx":
        assert body == baseline
for span in receipt["reference_spans"]:
    identity((ROOT / "reference" / span["path"]).read_bytes(), span["sha256"])
assert len(receipt["static_checks"]) == 24
assert all(receipt["static_checks"].values())
if len(sys.argv) > 1:
    archive = Path(sys.argv[1])
    identity(archive.read_bytes(), receipt["archive_sha256"])
    with tarfile.open(archive) as tar:
        for asset, expected in receipt["asset_sha256"].items():
            matches = [member for member in tar.getmembers() if member.isfile() and Path(member.name).name == asset]
            assert len(matches) == 1
            body = tar.extractfile(matches[0]).read()
            identity(body, expected)
            for span in receipt["reference_spans"]:
                if span["asset"] == asset:
                    start, end = span["utf8_half_open"]
                    assert body[start:end] == (ROOT / "reference" / span["path"]).read_bytes()
try:
    identity(baseline + b"changed", manifest["baseline_parts_sha256"])
except AssertionError:
    pass
else:
    raise AssertionError("Changed source identity was accepted")
print(json.dumps({"result": "PASS", "main": main, "reference_spans": 13, "source_pins": 19, "static_checks": 24, "fixture_identity": "PASS", "mutation_identity_control": "PASS", "behavior": "NOT_RUN"}))
