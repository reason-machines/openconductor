"""Static byte and scope checks only. Does not run project JavaScript."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = Path(__file__).resolve().parent
freeze = json.loads((EVIDENCE / "freeze.json").read_text())
for name, expected in freeze["files"].items():
    assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == expected, name

source = json.loads((EVIDENCE / "source-receipt.json").read_text())
assert source["checked_main"] == "508a1726dea81a508a853d2172ec5b1922803f2c"
assert len(json.loads((EVIDENCE / "contract.json").read_text())["cases"]) == 6
assert len(json.loads((EVIDENCE / "boundary-cases.json").read_text())["cases"]) == 9
manifest = json.loads((EVIDENCE / "archive-manifest.json").read_text())
for name in ["contract.json", "receipt.json"] + [name for name in manifest if name.startswith("reference/")]:
    path = EVIDENCE / ("source-receipt.json" if name == "receipt.json" else name)
    assert hashlib.sha256(path.read_bytes()).hexdigest() == manifest[name], name

main = json.loads((EVIDENCE / "fresh-main.json").read_text())["main"]
assert subprocess.check_output(["git", "branch", "--show-current"], text=True).strip() == "reason/openconductor-omit-nonco-8e693aec"
subprocess.run(["git", "merge-base", "--is-ancestor", main, "HEAD"], check=True)
changes = subprocess.check_output(["git", "diff", "--name-only", main], text=True).splitlines()
for name in changes:
    assert name == "src/features/chat/grepResourceLabel.test.ts" or name == "src/features/chat/ToolRows.tsx" or name.startswith("evidence/chat/grep-resource-label/"), name
baseline = subprocess.check_output(["git", "show", main + ":src/features/chat/ToolRows.tsx"], text=True)
current = (ROOT / "src/features/chat/ToolRows.tsx").read_text()
expected = baseline.replace("  shortPath,\n", "").replace("{shortPath(path, workspacePath)}", "{lastTwoSegments(path)}")
assert current in (baseline, expected), "only Grep label and dedicated shortPath binding can differ"
assert baseline.count("{shortPath(path, workspacePath)}") == 1
for name, expected_hash in freeze["preserved"].items():
    assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == expected_hash, name
print("PASS: frozen test, six original cases, nine path edges, retained REA bytes, preserved fixtures and exact production scope")
print("Mode:", "REGRESSION_ONLY" if current == baseline else "SCOPED_CANDIDATE")
print("Behavior: NOT_RUN by this static check")
