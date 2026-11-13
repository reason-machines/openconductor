import argparse
import hashlib
import json
from pathlib import Path


def digest(data):
    return hashlib.sha256(data).hexdigest()


def verify(renderer):
    root = Path(__file__).resolve().parents[2]
    receipt = json.loads((Path(__file__).with_name("reference.json")).read_text())
    source = renderer.read_bytes()
    assert digest(source) == receipt["asset"]["sha256"], "renderer identity changed"
    assert len(source) == receipt["asset"]["bytes"], "renderer length changed"
    caller = json.loads((root / "evidence/home-sidebar-hint/reference-caller.json").read_text())
    for span in caller["spans"]:
        start, end = span["utf8"]
        assert digest(source[start:end]) == span["sha256"], span["label"]
    for span in receipt["spans"]:
        start, end = span["utf8"]
        assert digest(source[start:end]) == span["sha256"], span["label"]
    for path, sha256 in receipt["preserved"].items():
        assert digest((root / path).read_bytes()) == sha256, path
    print("PASS: retained renderer, caller/helper spans, and protected inputs match; no reference code executed")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("renderer", type=Path)
    verify(parser.parse_args().renderer)
