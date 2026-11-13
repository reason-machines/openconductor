from pathlib import Path
import gzip
import hashlib
import json
import subprocess

root = Path(__file__).resolve().parent
sha = lambda value: hashlib.sha256(value).hexdigest()
source = json.loads((root / "source.json").read_text())
record = Path("evidence/frontend/rea-analyze-javascript-application.json.gz").read_bytes()
assert sha(record) == source["rea_record_sha256"]
assert json.loads(gzip.decompress(record))["evidence_id"] == source["rea_evidence_id"]
for span in source["spans"]:
    content = (root / span["path"]).read_bytes()
    assert len(content) == span["end"] - span["start"]
    assert sha(content) == span["sha256"]
for item in source["current_source"]:
    baseline = subprocess.check_output(["git", "show", f'{source["baseline"]}:{item["path"]}'])
    assert sha(baseline) == item["sha256"]
for line in (root / "fixture.sha256").read_text().splitlines():
    digest, path = line.split("  ", 1)
    assert sha(Path(path).read_bytes()) == digest
slots = (root / "reference-n7i.txt").read_text()
wrapper = (root / "reference-RNi.txt").read_text()
assert 'n[(i.slotNumber??r+1)-1]=()=>e(i)' in slots
assert 'n7i({favorites:it,onSelect:zt=>{d||(gt(zt),O(!1))}})' in wrapper
assert 'const ct=_t[zt];return ct===void 0?!1:(ct(),!0)' in wrapper
assert 'oi("chat.selectLoadout1",()=>Vt(0),Zoe)' in wrapper
assert 'oi("chat.selectLoadout5",()=>Vt(4),Zoe)' in wrapper
print("PASS: retained REA identity, source windows, baseline pins, shortcut joins and frozen fixture")
