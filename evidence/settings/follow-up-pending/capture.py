"""Retain historical shipped spans for the USER follow-up pending-control inquiry.

This only reads original bytes. It does not execute reference JavaScript.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tarfile

ROOT = Path(__file__).parent
EXPECTED = {
    "renderer": (11600457, "5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde"),
    "index": (3493297, "b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3"),
}


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def capture():
    parser = argparse.ArgumentParser()
    parser.add_argument("--renderer", type=Path, required=True)
    parser.add_argument("--closure", type=Path, required=True)
    parser.add_argument("--main", required=True)
    args = parser.parse_args()
    assert sha(args.closure.read_bytes()) == "f3ef2620ab60b431a02b3b92c78b7d349fb311af77d532d6012c8d9ed3986084"
    with tarfile.open(args.closure) as archive:
        blobs = {
            "renderer": args.renderer.read_bytes(),
            "index": archive.extractfile(".rea-work/retained-reference/index-BGEQ8YjU.js").read(),
        }
        provenance = json.load(archive.extractfile(".rea-work/dxe-source-closure/packet.json"))
    for name, raw in blobs.items():
        assert (len(raw), sha(raw)) == EXPECTED[name], name
    records = []

    def span(name, asset, start, end):
        raw = blobs[asset][start:end]
        target = ROOT / "reference" / (name + ".txt")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(raw)
        records.append({"path": str(target.relative_to(ROOT)), "asset": asset,
                        "utf8_half_open": [start, end], "bytes": len(raw), "sha256": sha(raw)})

    def function(name, asset):
        raw = blobs[asset]
        match = re.search(rb"(?:async )?function " + name.encode() + rb"\(", raw)
        assert match, name
        following = re.search(rb"(?:async )?function \w+\(", raw[match.end():])
        assert following, name
        span(name, asset, match.start(), match.end() + following.start())

    for name, asset in [("ir", "renderer"), ("Z5e", "renderer"), ("bho", "renderer"),
                        ("ah", "renderer"), ("Al", "renderer"), ("qQt", "index"),
                        ("zQt", "index"), ("JUt", "index"), ("Be", "index"), ("P5t", "index")]:
        function(name, asset)
    raw = blobs["renderer"]
    start = raw.index(b'ir({tab:"general",settingKey:"default_message_send_mode"')
    end = raw.index(b'ir({tab:"general",settingKey:', start + 5)
    span("registration", "renderer", start, end - 1)
    for name, asset, token in [
        ("import-value", "renderer", b"lc as Iri"),
        ("export-value", "index", b"qQt as lc"),
        ("import-mutation", "renderer", b"qG as W9r"),
        ("export-mutation", "index", b"zQt as qG"),
        ("import-availability", "renderer", b"lT as HDt"),
        ("export-availability", "index", b"P5t as lT"),
        ("key", "index", b'iU="default_message_send_mode"'),
    ]:
        start = blobs[asset].index(token)
        span(name, asset, start, start + len(token))
    source_path = "src/settings/GeneralPage.tsx"
    baseline = subprocess.check_output(["git", "show", args.main + ":" + source_path])
    (ROOT / "baseline").mkdir(exist_ok=True)
    (ROOT / "baseline/GeneralPage.tsx.txt").write_bytes(baseline)
    protected_paths = [
        "src/settings/GeneralPage.tsx", "src/settings/rows/AppPrefRows.tsx",
        "src/settings/ExperimentalPage.tsx", "src/settings/EnvironmentPage.tsx",
        "src/settings/sendKeySaveFeedback.test.ts", "src/settings/graphiteLoadingHint.test.ts",
        "src/settings/autoRunAvailability.test.ts", "src/settings/userEnvFileEditor.test.ts",
        "src/settings/controls.tsx",
    ]
    protected_paths += ["evidence/settings/" + name + "/frozen.sha256" for name in [
        "send-key-save-feedback", "graphite-loading-hint", "auto-run-availability", "user-env-file-editor",
    ]]
    protected = {path: sha(subprocess.check_output(["git", "show", "a0bde8e4:" + path])) for path in protected_paths}
    record = {
        "owner": "Conductor Rebuild / SAME49",
        "checked_main": args.main,
        "source_path": source_path,
        "baseline_sha256": sha(baseline),
        "scope": "USER Follow-up behavior select pending disabled state only; no availability, defaults, value filtering, shared Select, persistence or chat-submit change.",
        "reference_observation": "Historical registry passes W9r().isPending to Z5e.disabled. Z5e forwards disabled to ah; ah forwards remaining props to Hos. W9r imports zQt, whose mutationFn is JUt. JUt awaits the existing preference writer gee.",
        "current_source_observation": "The checked GeneralPage Select has no pending state or disabled prop around the existing save promise.",
        "retained_reference": {
            "application": "Conductor 0.87.6",
            "rea_receipt": provenance["rea_receipt"],
            "assets": {name: {"bytes": value[0], "sha256": value[1]} for name, value in EXPECTED.items()},
            "limits": provenance["rea_limit"] + " Historical extraction only. No current installed-asset comparison, reference execution, native check or behavior observation.",
        },
        "reference_spans": records,
        "protected_checkpoint": "a0bde8e4",
        "protected_product": protected,
        "ledger_inquiry_message": "cbc82d69-b534-45b3-b8ba-19eae606fc13",
        "ledger_disposition": "PENDING",
        "preservation": "Existing a0bde8e4 product files and frozen packets are not modified. Source inquiry only until exact-consumer ledger disposition; no runtime/intake request.",
        "status": "SOURCE_INQUIRY. No candidate edit, behavioral tests or typecheck run.",
    }
    (ROOT / "source.json").write_text(json.dumps(record, indent=2) + "\n")
    files = sorted(path for path in ROOT.rglob("*") if path.is_file() and path.name != "frozen.sha256")
    (ROOT / "frozen.sha256").write_text("".join(sha(path.read_bytes()) + "  " + str(path.relative_to(ROOT)) + "\n" for path in files))
    print(json.dumps({"asset_integrity": "PASS", "spans": len(records), "checked_main": args.main,
                      "product_edits": "NONE", "reference_execution": "NOT_RUN"}))


if __name__ == "__main__":
    capture()
