"""Verify retained shipped bytes and the frozen real-entrypoint fixture. No app execution."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--renderer", type=Path)
    parser.add_argument("--baseline", action="store_true")
    args = parser.parse_args()
    receipt = json.loads((HERE / "source-receipt.json").read_text())
    renderer = args.renderer.read_bytes() if args.renderer else None
    if renderer is not None:
        assert digest(renderer) == receipt["retained_renderer_sha256"], "renderer identity changed"
    for row in receipt["source_spans"]:
        literal = (HERE / "reference" / f"original-{row['role']}.txt").read_bytes()
        assert len(literal) == row["bytes"]
        assert digest(literal) == row["sha256"], row["role"]
        if renderer is not None:
            start, end = row["byte_range"]
            assert renderer[start:end] == literal, row["role"]
    ud = (HERE / "reference/original-uD.txt").read_bytes()
    branch = b'else if(r==="wezterm")' + ud.split(b'else if(r==="wezterm")', 1)[1].split(b'else if(r==="alacritty")', 1)[0]
    assert digest(branch) == receipt["branch_sha256"]
    assert (HERE / "reference/original-wezterm-branch.txt").read_bytes() == branch
    assert b'await I8(`open -a WezTerm --args start --cwd ${P}`,D,o)' in branch
    assert b'await o4e(e,n)' in (HERE / "reference/original-I8.txt").read_bytes()
    assert b'n.stderr||n.stdout||`exit code ${n.code}`' in (HERE / "reference/original-wBt.txt").read_bytes()
    fixture = ROOT / "src-tauri/src/open_in/wezterm_folder_tests.rs"
    assert digest(fixture.read_bytes()) == receipt["prepared_fixture_sha256"], "fixture changed"
    assert fixture.read_text().count("fn w0") == 9
    for row in receipt["preserved_files"]:
        assert digest((ROOT / row["path"]).read_bytes()) == row["sha256"], row["path"]
    if args.baseline:
        for row in receipt["checked_main_sources"]:
            actual = subprocess.check_output(["git", "show", f"{receipt['checked_main']}:{row['path']}"], cwd=ROOT)
            assert digest(actual) == row["sha256"], row["path"]
        legacy = subprocess.check_output(["git", "show", f"{receipt['checked_main']}:src-tauri/src/open_in/mod.rs"], cwd=ROOT)
        block = legacy.split(b'if app.id == "wezterm" {', 1)[1].split(b'    result.or_else', 1)[0]
        assert block.count(b'run(') == 2
    print(json.dumps({
        "result": "PASS", "spans": len(receipt["source_spans"]),
        "frozen_behavioral_tests": 9, "preserved_files": len(receipt["preserved_files"]),
        "checked_main": receipt["checked_main"],
        "renderer_byte_joins": "PASS" if renderer is not None else "NOT RUN",
        "baseline_git_objects": "PASS" if args.baseline else "NOT RUN",
        "behavior": "NOT RUN by source verifier",
    }))


if __name__ == "__main__":
    main()
