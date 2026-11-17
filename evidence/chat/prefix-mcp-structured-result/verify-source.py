#!/usr/bin/env python3
"""Verify retained original bytes and the frozen regression; never evaluate vendor code."""
import argparse
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--renderer", type=Path, help="Retained original renderApp-D_fmY7hW.js; optional full-parent verification")
    args = parser.parse_args()
    source = json.loads((HERE / "source.json").read_text())
    frozen = json.loads((HERE / "freeze.json").read_text())
    parent = args.renderer.read_bytes() if args.renderer else None
    if parent is not None:
        assert len(parent) == source["parent"]["bytes"], "parent size"
        assert digest(parent) == source["parent"]["sha256"], "parent digest"
    for record in source["spans"]:
        literal = record["text"].encode()
        assert len(literal) == record["end"] - record["start"], record["name"]
        assert digest(literal) == record["sha256"], record["name"]
        if parent is not None:
            assert parent[record["start"]:record["end"]] == literal, record["name"]
    fixture = frozen["fixture"]
    assert digest((ROOT / fixture["path"]).read_bytes()) == fixture["sha256"], "frozen fixture"
    for path, expected in frozen["generic16_preserved"].items():
        assert digest((ROOT / path).read_bytes()) == expected, path
    print(f"PASS: {len(source['spans'])} exact retained source records, frozen 18-case fixture and both unchanged generic16 files")
    print("Full retained renderer: " + ("PASS" if parent is not None else "NOT RUN (pass --renderer)"))


if __name__ == "__main__":
    main()
