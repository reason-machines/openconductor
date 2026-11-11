"""Check retained source hashes and the unchanged behavioral fixture. No app execution."""
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--renderer", type=Path)
    args = parser.parse_args()
    receipt = json.loads((HERE / "source-receipt.json").read_text())
    renderer = args.renderer.read_bytes() if args.renderer else None
    if renderer is not None:
        assert digest(renderer) == receipt["renderer_sha256"], "renderer identity changed"
    for row in receipt["source_spans"]:
        literal = (HERE / row["path"]).read_bytes()
        assert len(literal) == row["bytes"]
        assert digest(literal) == row["sha256"], row["role"]
        if renderer is not None:
            start, end = row["byte_range"]
            assert renderer[start:end] == literal, row["role"]
    fixture = ROOT / "src-tauri/src/open_in/kaleidoscope_tests.rs"
    assert digest(fixture.read_bytes()) == receipt["fixture_sha256"], "fixture changed"
    original = (HERE / "../alacritty/source-v1/original-uD.txt").read_bytes()
    branch = b'else if(r==="kaleidoscope")' + original.split(
        b'else if(r==="kaleidoscope")', 1
    )[1].split(b'else if(o.iconType', 1)[0]
    assert (HERE / "reference/original-kaleidoscope-branch.txt").read_bytes() == branch
    print(json.dumps({
        "result": "PASS",
        "retained_spans": len(receipt["source_spans"]),
        "fixture_sha256": receipt["fixture_sha256"],
        "renderer_byte_joins": "PASS" if renderer is not None else "NOT RUN",
        "behavior": "NOT RUN by this source check",
    }))


if __name__ == "__main__":
    main()
