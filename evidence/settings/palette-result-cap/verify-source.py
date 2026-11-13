"""Check retained source identities and the Settings-only delta without running JS."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--reference-renderer", required=True, type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[3]
here = Path(__file__).resolve().parent
proof = json.loads((here / "source-reachability.json").read_text())
rows = json.loads((here / "rows.json").read_text())


def digest(data):
    return hashlib.sha256(data).hexdigest()


def git(*args):
    return subprocess.check_output(["git", *args], cwd=root)


base = proof["checked_main"]
model_path = "src/palette/search/model.ts"
for path, pin in proof["source_pins"].items():
    data = git("show", f"{base}:{path}")
    assert digest(data) == pin["sha256"], path
    assert git("rev-parse", f"{base}:{path}").decode().strip() == pin["git_blob"], path
    if path != model_path:
        assert (root / path).read_bytes() == data, path

baseline = git("show", f"{base}:{model_path}")
old = b'return ranked(listed, query, (s) => s.title, (s) => [...(s.section ? [s.section] : []), ...(s.keywords ?? [])])\n    .slice(0, RESULT_CAP)\n'
assert baseline.count(old) == 1
expected = baseline.replace(old, old.replace(b"    .slice(0, RESULT_CAP)\n", b""))
assert (root / model_path).read_bytes() == expected
fixture = (root / "src/palette/settingsResultCap.test.ts").read_bytes()
assert digest(fixture) == "ac6d63126ba8577af1875d6eb26719c767105a4e0cb6267253119ea210265f1e"
assert digest((here / "rows.json").read_bytes()) == "bab8459ab464fca522c273c8f5ba787dfc90b231771d0a4baf4eb5b0f0f861e3"
assert rows == proof["rows"]
assert len(rows) == len({r["current_id"] for r in rows}) == 62

raw = args.reference_renderer.read_bytes()
assert len(raw) == proof["reference_asset"]["bytes"]
assert digest(raw) == proof["reference_asset"]["sha256"]
source = raw.decode("utf8")
for name, span in proof["reference_spans"].items():
    assert digest(source[span["start_chars"]:span["end_chars"]].encode()) == span["sha256"], name
for row in rows:
    call = row["registration_utf8_start"]
    assert raw[call:call + 3] == b"ir("
    start = call + 3
    assert digest(raw[start:start + row["registration_utf8_size"]]) == row["registration_sha256"], row["current_id"]

print(json.dumps({
    "result": "PASS: static source identity and sole Settings-cap deletion",
    "baseline": base,
    "source_pins": len(proof["source_pins"]),
    "reference_spans": len(proof["reference_spans"]),
    "real_rows": len(rows),
    "test_sha256": digest(fixture),
    "candidate_model_sha256": digest(expected),
    "runtime": "NOT RUN; the original serialized before/after unit remains queued with E1",
}, indent=2))
