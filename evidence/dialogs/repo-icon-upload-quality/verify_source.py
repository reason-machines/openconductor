"""Verify retained Conductor source as data, without executing it."""

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tarfile


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[3]
    reference = json.loads(Path(__file__).with_name("reference.json").read_text())
    assert sha256(args.archive.read_bytes()) == reference["original_upload"]["sha256"]
    with tarfile.open(args.archive) as archive:
        member = archive.getmember(".rea-work/retained-reference/" + reference["renderer"]["filename"])
        renderer = archive.extractfile(member).read()
    assert len(renderer) == reference["renderer"]["bytes"]
    assert sha256(renderer) == reference["renderer"]["sha256"]
    for span in reference["spans"]:
        start, end = span["utf8_half_open"]
        data = renderer[start:end]
        assert len(data) == span["bytes"]
        assert sha256(data) == span["sha256"]
        assert data.decode("utf-8") == span["text"]
        print(f"PASS retained {span['name']} [{start},{end})")
    yba, xba, dui = [span["text"] for span in reference["spans"]]
    assert 'g.imageSmoothingQuality="high",g.drawImage(' in yba
    assert 'await yba({bytes:m,mimeType:d})' in xba
    assert 'p.jsx(xba,{repository:n,onClose:i})' in dui
    baseline = subprocess.check_output(
        ["git", "show", reference["checked_main"] + ":" + reference["baseline_component"]["path"]],
        cwd=root,
    )
    assert sha256(baseline) == reference["baseline_component"]["sha256"]
    fixture = reference["fixture"]
    assert sha256((root / fixture["path"]).read_bytes()) == fixture["sha256"]
    workflow = (root / ".github/workflows/ci.yml").read_text()
    assert 'node --test "src/**/*.test.ts"' in workflow
    print("PASS archive, renderer, Upload call chain, baseline component, sealed fixture, workflow inclusion")


if __name__ == "__main__":
    main()
