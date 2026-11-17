import argparse
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent
BASELINE = "26f8345401efb021bef2f12b17815eba6c57170c"
ASSETS = {
    "renderer": ("renderApp-D_fmY7hW.js", "5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde"),
    "index": ("index-BGEQ8YjU.js", "b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3"),
}
SPANS = [
    ("renderer", "dialog", b"function Lya(){", b"function Mya("),
    ("renderer", "tabs", b"function dUi(t){", b"function "),
    ("renderer", "favicon", b"function pba(t){", b"function mba("),
    ("renderer", "learn-more", b"function mba(){", b"function Ize("),
    ("renderer", "urls-import", b"iF as l3", None),
    ("renderer", "opener-import", b"dG as vs", None),
    ("index", "urls-export", b"sSt as iF", None),
    ("index", "opener-export", b"Rue as dG", None),
    ("index", "urls", b"const sSt={", b"async function Rue("),
    ("index", "opener", b"async function Rue(t,e){", b"async function "),
]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def capture(directory):
    data = {}
    assets = {}
    for key, (name, expected) in ASSETS.items():
        data[key] = (directory / name).read_bytes()
        assert digest(data[key]) == expected, name
        assets[key] = {"file": name, "bytes": len(data[key]), "sha256": expected}
    spans = []
    (ROOT / "reference").mkdir(exist_ok=True)
    for asset, name, prefix, next_prefix in SPANS:
        source = data[asset]
        assert source.count(prefix) == 1, name
        start = source.index(prefix)
        end = start + len(prefix) if next_prefix is None else source.index(next_prefix, start + len(prefix))
        text = source[start:end].rstrip()
        end = start + len(text)
        file = f"reference/{name}.txt"
        (ROOT / file).write_bytes(text)
        spans.append({"asset": asset, "name": name, "utf8_half_open": [start, end], "bytes": len(text), "sha256": digest(text), "file": file})
    baseline = []
    for file in ["src/components/RepoIconDialog.tsx", "src/backend.ts", "src/state/repoIcon.ts", "src-tauri/src/sidebar_repo_commands.rs"]:
        source = subprocess.check_output(["git", "show", f"{BASELINE}:{file}"])
        baseline.append({"file": file, "sha256": digest(source)})
    receipt = {
        "author": "Conductor Rebuild",
        "rea_evidence_id": "ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2",
        "original_archive_sha256": "c007a6ac77d57b56cdfe8158817ffbcffee6a8f5e7f4a63e2eaef65cbf21b30d",
        "limits": "Retained shipped Conductor 0.87.6 bytes only. Historical renderer semantic analysis exhausted heap. No target code is evaluated. Static source does not prove runtime rendering or native URL launch.",
        "assets": assets, "spans": spans, "baseline_commit": BASELINE, "baseline": baseline,
        "destination_adaptation": "Preserve the declared Learn more action but open OpenConductor-owned repository-icon documentation, not the vendor FAQ. The document describes the current implementation.",
    }
    (ROOT / "source.json").write_text(json.dumps(receipt, indent=2) + "\n")


def verify(directory):
    receipt = json.loads((ROOT / "source.json").read_text())
    for span in receipt["spans"]:
        text = (ROOT / span["file"]).read_bytes()
        assert len(text) == span["bytes"] and digest(text) == span["sha256"], span["name"]
        if directory is not None:
            source = (directory / ASSETS[span["asset"]][0]).read_bytes()
            assert source[slice(*span["utf8_half_open"])] == text, span["name"]
    if directory is not None:
        for name, expected in ASSETS.values():
            assert digest((directory / name).read_bytes()) == expected, name
    for baseline in receipt["baseline"]:
        source = subprocess.check_output(["git", "show", f"{BASELINE}:{baseline['file']}"])
        assert digest(source) == baseline["sha256"], baseline["file"]
    fixture = Path("src/components/repoIconFaviconHelp.test.ts").read_bytes()
    expected = (ROOT / "fixture.sha256").read_text().split()[0]
    assert digest(fixture) == expected, "frozen component regression"
    print(f"PASS: {len(receipt['spans'])} retained spans, four baseline inputs and frozen regression" + (", both complete original assets" if directory is not None else ""))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--assets", type=Path)
    parser.add_argument("--capture", action="store_true")
    args = parser.parse_args()
    if args.capture:
        assert args.assets is not None
        capture(args.assets)
    verify(args.assets)
