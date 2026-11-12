#!/usr/bin/env python3
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[3]
HERE = ROOT / "evidence/terminal/alternate-line-edit"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def baseline(path, commit):
    return subprocess.check_output(["git", "show", f"{commit}:{path}"], cwd=ROOT)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--originals", type=Path)
    args = parser.parse_args()
    source = json.loads((HERE / "source.json").read_text())
    reference_path = ROOT / source["reference_manifest"]
    reference = json.loads(reference_path.read_text())
    assets = {}
    if args.originals:
        for artifact in reference["artifacts"]:
            raw = (args.originals / artifact["name"]).read_bytes()
            assert len(raw) == artifact["bytes"]
            assert sha(raw) == artifact["sha256"]
            assets[artifact["artifact"]] = raw
    for span in reference["spans"]:
        raw = (reference_path.parent / span["file"]).read_bytes()
        assert sha(raw) == span["sha256"]
        if args.originals:
            start, end = span["utf8_half_open"]
            assert raw == assets[span["artifact"]][start:end]
    handler = (reference_path.parent / "spans/renderer-$wa.txt").read_text()
    guard = handler.index("u.buffer.active!==u.buffer.normal")
    assert handler.index("terminal.insertNewline") < guard
    for command in ("terminal.deleteLine", "terminal.moveLineStart", "terminal.moveLineEnd", "terminal.moveWordLeft", "terminal.moveWordRight"):
        assert handler.index(command) > guard
    path = "src/features/terminal/session.ts"
    before = b'    if (command === "terminal.clearScrollback" && term.buffer.active !== term.buffer.normal) return true;'
    after = b'    if (\n      term.buffer.active !== term.buffer.normal &&\n      (command === "terminal.clearScrollback" || (command !== "terminal.insertNewline" && LINE_EDIT_BYTES[command] !== undefined))\n    ) return true;'
    old = baseline(path, source["main_checked"])
    assert old.count(before) == 1
    assert (ROOT / path).read_bytes() == old.replace(before, after)
    paths = subprocess.check_output(["git", "ls-tree", "-r", "--name-only", source["main_checked"], "--", "src/features/terminal", "src/keybindings"], cwd=ROOT).decode().splitlines()
    for preserved in paths:
        if preserved != path:
            assert (ROOT / preserved).read_bytes() == baseline(preserved, source["main_checked"]), preserved
    digest, fixture = (HERE / "fixture.sha256").read_text().split()
    assert sha((ROOT / fixture).read_bytes()) == digest
    print(f"PASS: {len(reference['spans'])} retained spans, newline/guard/motion order, exact callback-only diff, frozen fixture and preserved terminal/keybinding files")
    print("PASS: both complete original asset hashes and exact span byte ranges" if args.originals else "Original assets not revalidated")


if __name__ == "__main__":
    main()
