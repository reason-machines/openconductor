"""Check retained source bytes without executing reference or product code."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).parent
record = json.loads((ROOT / "source.json").read_text())


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


for span in record["reference_spans"]:
    raw = (ROOT / span["path"]).read_bytes()
    assert (len(raw), sha(raw)) == (span["bytes"], span["sha256"]), span["path"]
baseline = (ROOT / "baseline/GeneralPage.tsx.txt").read_bytes()
assert sha(baseline) == record["baseline_sha256"]
assert baseline == subprocess.check_output(["git", "show", record["checked_main"] + ":" + record["source_path"]])
registration = (ROOT / "reference/registration.txt").read_text()
assert 'scopes:["user"]' in registration
assert 'a=W9r()' in registration and 'disabled:a.isPending' in registration
assert 'disabled:c' in (ROOT / "reference/Z5e.txt").read_text()
assert 'p.jsx(Hos,{...c,' in (ROOT / "reference/ah.txt").read_text()
assert 'mutationFn:JUt' in (ROOT / "reference/zQt.txt").read_text()
assert 'await gee({key:iU,value:t})' in (ROOT / "reference/JUt.txt").read_text()
for name, token in [
    ("import-mutation", "qG as W9r"), ("export-mutation", "zQt as qG"),
    ("import-value", "lc as Iri"), ("export-value", "qQt as lc"),
    ("import-availability", "lT as HDt"), ("export-availability", "P5t as lT"),
]:
    assert (ROOT / ("reference/" + name + ".txt")).read_text() == token
pending_row = baseline[baseline.index(b'label="Follow-up behavior"'):baseline.index(b'<Row label="Agent notifications"')]
assert b"disabled=" not in pending_row
for path, expected in record["protected_product"].items():
    assert sha(Path(path).read_bytes()) == expected, path
for line in (ROOT / "frozen.sha256").read_text().splitlines():
    expected, path = line.split("  ", 1)
    assert sha((ROOT / path).read_bytes()) == expected, path
print(json.dumps({"reference_spans": len(record["reference_spans"]), "source_chain": "PASS",
                  "baseline": "PASS", "protected_product": "UNCHANGED", "frozen_evidence": "PASS",
                  "candidate": "NONE", "behavioral_tests": "NOT_RUN", "typecheck": "NOT_RUN"}))
