"""Verify retained shipped bytes and the frozen post-exit component regression."""
from pathlib import Path
import hashlib
import json
import subprocess
import sys
import tarfile

root = Path(__file__).resolve().parent
repo = Path(subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip())
receipt = json.loads((root / "reference-source.json").read_text())
sha = lambda value: hashlib.sha256(value).hexdigest()
archive = Path(sys.argv[1])
assert sha(archive.read_bytes()) == receipt["archive_sha256"]
assets = {}
with tarfile.open(archive) as source:
    for name, expected in receipt["assets"].items():
        matches = [m for m in source.getmembers() if m.name.endswith("/" + name)]
        assert len(matches) == 1, name
        assets[name] = source.extractfile(matches[0]).read()
        assert sha(assets[name]) == expected, name
for span in receipt["reference_spans"]:
    value = (root / span["path"]).read_bytes()
    start, end = span["utf8_half_open"]
    assert value == assets[span["asset"]][start:end], span["path"]
    assert sha(value) == span["sha256"], span["path"]
for commit in (receipt["main_sha"], receipt["verified_current_main_sha"]):
    for pin in receipt["main_source_pins"]:
        value = subprocess.check_output(["git", "show", f"{commit}:{pin['path']}"])
        assert sha(value) == pin["sha256"], (commit, pin["path"])
for pin in receipt["protected_files"]:
    assert sha((repo / pin["path"]).read_bytes()) == pin["sha256"], pin["path"]
fixture = repo / "src/settings/agents/loginTerminalInputAfterExit.test.ts"
assert sha(fixture.read_bytes()) == receipt["fixture_sha256"]
assert fixture.read_text().count('\ntest(') == 6
factory = repo / "src/settings/agents/loginTerminal.test.ts"
assert sha(factory.read_bytes()) == receipt["factory_sha256"]
baseline = (root / "baseline-parts.tsx.txt").read_bytes()
assert sha(baseline) == receipt["baseline_sha256"]
before = b"const input = term.onData((d) => id && void ptyWrite(id, d));"
after = b"const input = term.onData((d) => id && !exited && void ptyWrite(id, d));"
assert baseline.count(before) == 1
candidate = (repo / "src/settings/agents/parts.tsx").read_bytes()
assert candidate in (baseline, baseline.replace(before, after))
controller = (root / "reference/controller.write.txt").read_text()
assert 'this.snapshot.connectionState!=="running"||!this.snapshot.isInputEnabled' in controller
exit_join = (root / "reference/controller.spawn-and-exit.txt").read_text()
assert 'this.snapshot.connectionState="exited"' in exit_join
assert 'this.snapshot.isInputEnabled=!1' in exit_join
print(json.dumps({
    "source_main": receipt["main_sha"], "source_checks": "PASS",
    "verified_current_main": receipt["verified_current_main_sha"],
    "reference_spans": len(receipt["reference_spans"]), "main_pins": len(receipt["main_source_pins"]),
    "fixture_sha256": receipt["fixture_sha256"], "protected_files": "UNCHANGED",
    "product_stage": "BASELINE" if candidate == baseline else "SINGLE_ONDATA_GUARD",
    "behavior": "NOT_RUN", "native_provider_realIPC": "NOT_RUN"
}))
