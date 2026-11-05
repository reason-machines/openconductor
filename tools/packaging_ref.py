"""Build evidence/packaging/conductor-reference.json from the Wave 0 REA bundle.

Reads the REA `inspect_plist` and `inspect_signature` records for Conductor.app
out of evidence/bundles/wave0-evidence-bundle.json.gz and keeps only what the
packaging check compares: Info.plist key names and value types, entitlements,
hardened runtime and signing shape. String values are reduced to their type and
length, so no Conductor prose is copied into this repository.

Usage: python3 tools/packaging_ref.py [bundle.json.gz] [out.json]
"""
import gzip
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
BUNDLE = ROOT / "evidence/bundles/wave0-evidence-bundle.json.gz"
OUT = ROOT / "evidence/packaging/conductor-reference.json"

# Identifiers that are facts about the shape, not prose; kept verbatim.
KEEP_VERBATIM = {
    "CFBundlePackageType",
    "CFBundleInfoDictionaryVersion",
    "LSMinimumSystemVersion",
    "CFBundleTypeRole",
}


def shape(key, value):
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value if key in KEEP_VERBATIM else {"type": "string", "length": len(value)}
    if isinstance(value, list):
        return [shape(key, v) for v in value]
    if isinstance(value, dict):
        return {k: shape(k, v) for k, v in sorted(value.items())}
    return {"type": type(value).__name__}


def main():
    bundle = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else BUNDLE
    out = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else OUT
    with gzip.open(bundle, "rt") as fh:
        records = json.load(fh)["records"]

    plist = None
    signatures = []
    for rec in records:
        op = rec.get("operation")
        name = (rec.get("subject") or {}).get("name")
        if op == "inspect_plist" and name == "Info.plist":
            plist = rec
        elif op == "inspect_signature":
            signatures.append(rec)
    if plist is None or not signatures:
        sys.exit("bundle has no inspect_plist/inspect_signature records")

    def sig(rec):
        n = rec["normalized_result"]
        return {
            "evidence_id": rec["evidence_id"],
            "subject": rec["subject"]["name"],
            "subject_sha256": rec["subject"]["digest"]["sha256"],
            "format": n["format"],
            "signed": n["signed"],
            "hardened_runtime": n["hardened_runtime"],
            "signing_kind": "developer-id" if any(
                a.startswith("Developer ID Application") for a in n["authorities"]) else "other",
            "entitlements": n["entitlements"],
        }

    value = plist["normalized_result"]["value"]
    ref = {
        "source": "REA inspect-plist / inspect-signature on Conductor.app 0.87.6 (sven m5 max)",
        "generated_by": "tools/packaging_ref.py",
        "info_plist": {
            "evidence_id": plist["evidence_id"],
            "subject_sha256": plist["subject"]["digest"]["sha256"],
            "keys": {k: shape(k, v) for k, v in sorted(value.items())},
        },
        "signatures": sorted((sig(r) for r in signatures), key=lambda s: s["subject"]),
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(ref, indent=2) + "\n")
    print("wrote", out.relative_to(ROOT))


if __name__ == "__main__":
    main()
