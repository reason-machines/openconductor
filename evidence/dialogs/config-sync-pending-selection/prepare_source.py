#!/usr/bin/env python3
import argparse
import difflib
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
BASE = "492bc5c78f2e168924f9003bfb68c7023b4aa931"
RENDERER_SHA = "5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde"
ASSET = "renderApp-D_fmY7hW.js"
SCOPED = "src/settings/ConfigSyncDialog.tsx"
REGRESSION = "src/settings/configSyncPendingSelection.test.ts"
PROTECTED = [
    "src/settings/configSyncHarness.cjs",
    "src/settings/configSyncSuccessFeedback.test.ts",
    "src/settings/configSyncDialog.test.ts",
    "src/settings/configSyncApi.ts",
    "src/settings/configSync.ts",
    "src/components/Dialogs.tsx",
]
SPANS = [
    ("n6a", 10948507, 10953485, "25a11259c1ad67003f27a7ad58aec15540531fb329f03dea6b9a4befa8d5f87b"),
    ("a6a", 10953690, 10956803, "321cf8d967cb45b2147a3a519cf3f03211251f086454d1711ab31236618dcde5"),
    ("zei", 10956846, 10957876, "d3dda3dd8be727b34119197cd6b01652459570b8e40bd3d2d4e217cb5d76050d"),
    ("Yva", 10944354, 10944695, "0257e22ae8094dab3bab0836e1be3d9f53804e65b628113ccc28d81097c15f3a"),
    ("Bxa", 11099076, 11100569, "5c72d08c45f2bf94cdd85d4e573191e1cce39d0459165a1a39b30aae684adae0"),
]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def blob(path):
    return subprocess.check_output(["git", "show", f"{BASE}:{path}"], cwd=ROOT)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--renderer", type=Path, default=ROOT / ".ara-state/dialog-current-c2567050" / ASSET)
    args = parser.parse_args()
    renderer = args.renderer.read_bytes()
    assert len(renderer) == 11600457 and sha(renderer) == RENDERER_SHA
    source = blob(SCOPED)
    assert sha(source) == "08d6ac334235243eca181c34cba997052e51a8cf32d1c28441679e77684f6b8a"
    assert (ROOT / SCOPED).read_bytes() == source, "Baseline source must remain unapplied before RED"
    reference = OUT / "reference"
    reference.mkdir(exist_ok=True)
    spans = []
    for name, start, end, expected in SPANS:
        data = renderer[start:end]
        assert sha(data) == expected, name
        (reference / f"{name}.txt").write_bytes(data)
        spans.append({"name": name, "utf8_half_open": [start, end], "sha256": expected, "path": f"reference/{name}.txt"})
    for name in ["pv-checkbox", "nds-checkbox-root", "fieldset-default", "checkboxgroup-default", "field-defaults"]:
        data = (ROOT / "artifacts/dialog-next-census-6013/reference" / f"{name}.txt").read_bytes()
        start = renderer.index(data)
        assert renderer.find(data, start + 1) == -1, name
        (reference / f"{name}.txt").write_bytes(data)
        spans.append({"name": name, "utf8_half_open": [start, start + len(data)], "sha256": sha(data), "path": f"reference/{name}.txt"})
    candidate = source.decode()
    replacements = [
        ('disabled={state.kind !== "ready" || categoryItems.length === 0}', 'disabled={!diff || categoryItems.length === 0}'),
        ('disabled={state.kind !== "ready"} onChange={() => toggleItem(key)}', 'disabled={!diff} onChange={() => toggleItem(key)}'),
    ]
    for old, new in replacements:
        assert candidate.count(old) == 1, old
        candidate = candidate.replace(old, new)
    patch = "".join(difflib.unified_diff(source.decode().splitlines(keepends=True), candidate.splitlines(keepends=True), fromfile=f"a/{SCOPED}", tofile=f"b/{SCOPED}"))
    (OUT / "candidate.patch").write_text(patch)
    protected = []
    for path in PROTECTED:
        data = blob(path)
        assert (ROOT / path).read_bytes() == data, path
        protected.append({"path": path, "sha256": sha(data)})
    manifest = {
        "author": "Conductor Rebuild", "main": BASE, "kind": "source candidate, not runtime intake",
        "ownership_message": "19427ce2-2b1d-45fc-8388-7d5ac5aefc8b",
        "reference": {"asset": ASSET, "bytes": len(renderer), "sha256": RENDERER_SHA,
                      "archive_attachment_id": "9bba4171-4ff7-4ded-83e7-5a62a9f75350",
                      "archive_sha256": "c007a6ac77d57b56cdfe8158817ffbcffee6a8f5e7f4a63e2eaef65cbf21b30d",
                      "rea_evidence_id": "ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2"},
        "spans": spans,
        "baseline": {"path": SCOPED, "sha256": sha(source)},
        "candidate": {"path": "candidate.patch", "sha256": sha(patch.encode()), "result_sha256": sha(candidate.encode())},
        "regression": {"path": REGRESSION, "sha256": sha((ROOT / REGRESSION).read_bytes()), "cases": 2, "execution": "NOT_RUN"},
        "protected": protected,
        "limits": ["Retained shipped bytes were read as data, not executed.", "Historical renderer semantic analysis exhausted heap.", "Current installed app identity, native behavior, application RED/GREEN, typecheck and build are unverified.", "No new runtime row, admission, driver or provisioning is requested."]
    }
    (OUT / "source.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({"source_checks": "PASSED", "spans": len(spans), "protected": len(protected), "product_patch_applied": False, "application_execution": "NOT_RUN"}))


if __name__ == "__main__":
    main()
