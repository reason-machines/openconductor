"""Retain and verify existing REA bytes and an immutable main source baseline. No JS evaluation."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[4]
HERE = Path(__file__).resolve().parent
BASE = subprocess.check_output(["git", "rev-parse", "origin/main"], cwd=ROOT, text=True).strip()
sha = lambda data: hashlib.sha256(data).hexdigest()
originals = ROOT / ".oc-tmp/vio-received-72733982/originals"
assets = {
    "index": ("index-BGEQ8YjU.js", "b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3"),
    "renderer": ("renderApp-D_fmY7hW.js", "5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde"),
}
full = {}
for key, (name, digest) in assets.items():
    data = (originals / name).read_bytes()
    assert sha(data) == digest, name
    full[key] = data

want = {"V9", "$kt", "export-gh", "ts", "DAt", "eSa", "import-qc", "import-aVe", "export-g$", "bI", "w9e", "$At", "dno", "uno", "cno", "lno", "FAt", "_St", "ySt"}
spans = []
seen = set()
for relative in ["evidence/terminal/nonrunning-input-1f/reference.json", "evidence/terminal/spawn-failure/reference.json"]:
    source = ROOT / relative
    manifest = json.loads(source.read_text())
    for item in manifest["spans"]:
        if item["name"] not in want or item["name"] in seen:
            continue
        data = (source.parent / item["file"]).read_bytes()
        start, end = item["utf8_half_open"]
        assert data == full[item["artifact"]][start:end]
        assert sha(data) == item["sha256"]
        dest = HERE / item["file"]
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        spans.append({**item, "retained_from": relative})
        seen.add(item["name"])
assert seen == want, want - seen

paths = [
    "src/features/terminal/session.ts", "src/features/terminal/pty.ts",
    "src/features/terminal/TerminalPanel.tsx", "src-tauri/src/terminal_commands.rs",
    "src-tauri/src/terminal/manager.rs", "src/components/PanelStrip.tsx",
    "src/components/WorkspaceView.tsx", "package.json", "package-lock.json",
]
main = []
for path in paths:
    data = subprocess.check_output(["git", "show", f"{BASE}:{path}"], cwd=ROOT)
    dest = HERE / "main" / path
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    main.append({"path": path, "file": "main/" + path, "sha256": sha(data), "bytes": len(data), "git_blob": subprocess.check_output(["git", "rev-parse", f"{BASE}:{path}"], cwd=ROOT, text=True).strip()})

out = {
    "unit": "terminal-post-spawn-resize-reconciliation-1f",
    "author": "Conductor Rebuild", "main_checked": BASE,
    "rea_evidence_id": "ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2",
    "original_attachment_id": "bfa06ee0-799f-47fe-9edc-73997c70a340",
    "original_attachment_sha256": "d0d8e4b9b20c5150f30f5edff149bfc25f3074da5a1a66357b1caaf1ef0033ab",
    "offset_units": "Zero-based UTF-8 byte half-open ranges [start,end)",
    "artifacts": [{"artifact": k, "name": name, "sha256": digest, "bytes": len(full[k])} for k, (name, digest) in assets.items()],
    "spans": spans, "main_sources": main,
    "product_runtime_executed": False, "reference_evaluated": False,
    "new_acquisition": False, "native_behavior_observed": False,
    "gap": "Frontend post-spawn resize request reconciliation missing; no native/PTY/kernel/visual claim",
    "analysis_limits": ["Existing AST spans revalidated; no new whole-module parse", "Source request trace is not reproduction; new regression remains unexecuted", "Native allocation, kernel dimensions and actual xterm rendering not observed"],
}
(HERE / "reference.json").write_text(json.dumps(out, indent=2) + "\n")
print(json.dumps({"main": BASE, "assets_verified": len(full), "spans_verified": len(spans), "main_pins": len(main), "product_execution": False}))
