from pathlib import Path
import argparse
import hashlib
import json
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument("--original-dir", type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parent
receipt = json.loads((root / "receipt.json").read_text())
assets = {}
for name, expected in receipt["original_assets"].items():
    data = (args.original_dir / name).read_bytes()
    assert hashlib.sha256(data).hexdigest() == expected, name
    assets[name] = data
for span in receipt["spans"]:
    data = (root / span["path"]).read_bytes()
    start, end = span["utf8_half_open"]
    assert data == assets[span["asset"]][start:end], span["symbol"]
    assert len(data) == span["bytes"] and hashlib.sha256(data).hexdigest() == span["sha256"]
for source in receipt["current_sources"]:
    data = (root / source["file"]).read_bytes()
    assert len(data) == source["bytes"] and hashlib.sha256(data).hexdigest() == source["sha256"]
    assert data == subprocess.check_output(["git", "show", receipt["main_checked"] + ":" + source["path"]])
reference = lambda name: (root / "reference" / (name + ".txt")).read_text()
current = lambda name: (root / "current" / name).read_text()
assert 'disableStdin:_' in reference("rSa") and '_=!c' in reference("rSa")
assert 'disableInput:O' in reference("rSa") and 'O=!c' in reference("rSa")
assert 'this.terminal.onData' in reference("tIr-Loi")
assert 'i.onInput' in reference("MSt")
assert 'this.snapshot.isInputEnabled=!0' in reference("runtime-spawn")
assert 'this.snapshot.isInputEnabled=!1' in reference("runtime-spawn")
assert 'this.backendSession?.write(e)' in reference("runtime-write")
assert 'oe("pty_write"' in reference("local-backend")
output = current("src/components/ScriptOutput.tsx")
assert 'disableStdin: true' in output and '.onData(' not in output
assert 'output={runOut}' in current("src/components/ScriptsPanel.tsx")
api = current("src/scripts/api.ts")
assert '"run_script_start"' in api and '"run_script_output"' in api
assert '"run_script_write"' not in api and '"run_script_input"' not in api
launch = current("crates/scripts/src/launch.rs")
assert 'let (child, mut reader) = match spawn_pty(spec)' in launch
assert 'pub fn write(' not in launch and 'pub fn input(' not in launch
runner = current("crates/scripts/src/runner.rs")
assert 'processes: HashMap<Key, Arc<Mutex<Process>>>' in runner
assert 'pub fn write(' not in runner and 'pub fn input(' not in runner
print(json.dumps({"main": receipt["main_checked"], "full_original_assets": len(assets), "original_spans_rebound": len(receipt["spans"]), "current_files_rebound": len(receipt["current_sources"]), "source_checks": "PASS", "behavioral_regressions": "NOT_RUN", "native_acceptance": "NOT_RUN"}))
