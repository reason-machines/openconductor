#!/usr/bin/env python3
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = ROOT / "evidence/terminal/alternate-clear"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def baseline(path, commit):
    return subprocess.check_output(["git", "show", f"{commit}:{path}"], cwd=ROOT)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--originals", type=Path)
    args = parser.parse_args()
    source = json.loads((EVIDENCE / "source.json").read_text())
    old = ROOT / "evidence/terminal/clear-redraw-1f/source"
    reference = json.loads((old / "reference.json").read_text())
    assets = {}
    if args.originals:
        for asset in reference["artifacts"]:
            raw = (args.originals / asset["name"]).read_bytes()
            assert len(raw) == asset["bytes"]
            assert digest(raw) == asset["sha256"]
            assets[asset["artifact"]] = raw
    for span in reference["spans"]:
        raw = (old / span["file"]).read_bytes()
        assert digest(raw) == span["sha256"]
        if args.originals:
            start, end = span["utf8_half_open"]
            assert raw == assets[span["artifact"]][start:end]
    handler = (old / "spans/renderer-$wa.txt").read_text()
    assert handler.index("terminal.insertNewline") < handler.index("u.buffer.active!==u.buffer.normal")
    assert handler.index("u.buffer.active!==u.buffer.normal") < handler.index("terminal.clearScrollback")
    assert "n?n():" in handler
    surface = (old / "spans/renderer-eSa.txt").read_text()
    assert "qc.clearScrollback(Q).fireAndForget()" in surface
    registry = (old / "spans/index-$kt.txt").read_text()
    assert "clearScrollback" in registry
    session = "src/features/terminal/session.ts"
    old_session = baseline(session, source["main_checked"])
    anchor = b"    if (command === undefined) return true;\n"
    guard = b'    if (command === "terminal.clearScrollback" && term.buffer.active !== term.buffer.normal) return true;\n'
    assert old_session.count(anchor) == 1
    assert (ROOT / session).read_bytes() == old_session.replace(anchor, anchor + guard)
    mock_anchor = b'  class Screen {\n    unicode = { activeVersion: "6" };'
    mock_replacement = b'  class Screen {\n    readonly normalBuffer = {};\n    readonly buffer = { active: this.normalBuffer, normal: this.normalBuffer };\n    unicode = { activeVersion: "6" };'
    for path in source["mock_boundary_only"]:
        old_test = baseline(path, source["main_checked"])
        assert old_test.count(mock_anchor) == 1
        assert (ROOT / path).read_bytes() == old_test.replace(mock_anchor, mock_replacement)
    for path in source["preserved_files"]:
        assert (ROOT / path).read_bytes() == baseline(path, source["main_checked"])
    frozen_hash, frozen_path = (EVIDENCE / "fixture.sha256").read_text().split()
    assert digest((ROOT / frozen_path).read_bytes()) == frozen_hash
    print(f"PASS: {len(reference['spans'])} retained spans, caller/guard order, exact one-line product diff, mock-only additions, frozen fixture, and preserved files")
    print("PASS: both original asset hashes and exact span byte ranges" if args.originals else "Original asset revalidation not requested")


if __name__ == "__main__":
    main()
