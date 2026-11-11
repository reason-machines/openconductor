"""Verify retained source/fixture bytes without evaluating reference JavaScript."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "source-v1"
manifest = json.loads((SOURCE / "manifest.json").read_text())
for row in manifest["files"]:
    data = (SOURCE / row["path"]).read_bytes()
    assert len(data) == row["bytes"], row["path"]
    assert hashlib.sha256(data).hexdigest() == row["sha256"], row["path"]
packet = json.loads((SOURCE / "source-packet.json").read_text())
for row in packet["reference_spans"]:
    data = (SOURCE / row["file"]).read_bytes()
    assert len(data) == row["bytes"], row["file"]
    assert hashlib.sha256(data).hexdigest() == row["sha256"], row["file"]
for row in packet["main_files"]:
    data = subprocess.check_output(["git", "show", f'{packet["checked_main"]}:{row["path"]}'])
    assert data == (SOURCE / row["file"]).read_bytes(), row["path"]
fixture = Path("src-tauri/src/open_in/alacritty_workspace_tests.rs").read_bytes()
assert fixture == (SOURCE / "alacritty_workspace_tests.rs").read_bytes()
print(json.dumps({
    "kind": "static integrity only",
    "checked_main": packet["checked_main"],
    "manifest_files": len(manifest["files"]),
    "reference_spans": len(packet["reference_spans"]),
    "baseline_files": len(packet["main_files"]),
    "fixture_sha256": hashlib.sha256(fixture).hexdigest(),
    "product_execution": "not run by this verifier",
}, indent=2))
