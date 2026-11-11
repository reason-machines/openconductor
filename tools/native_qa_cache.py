#!/usr/bin/env python3
"""Bounded synthetic storage write/relaunch stage; never filesystem isolation proof.

Requires separate native authorization for synthetic content, beyond an inert
prerequisite grant. Ordinary app admission remains unconditionally closed.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys

if __package__:
    from . import native_qa_ordinary as ordinary
else:
    import native_qa_ordinary as ordinary

VERSION = "OPENCONDUCTOR_NATIVE_QA_STORAGE_STAGE_V1"
LIFECYCLE_VERSION = "OPENCONDUCTOR_NATIVE_QA_STORAGE_LIFECYCLE_V1"
RECEIPT = "cache-storage-stage.json"
TIMEOUT_SECONDS = 16


def require_filesystem_isolation(_receipt):
    # No trusted process/helper filesystem observer is implemented in this stage.
    # A supplied JSON assertion, sandbox-exec presence, or snapshot cannot supply it.
    raise ValueError("process/helper filesystem coverage is unavailable; ordinary admission denied")


def validate_stage(receipt, phase, token, pid):
    if (phase not in ("write", "read") or not isinstance(receipt, dict)
            or receipt.get("probe_version") != VERSION or receipt.get("phase") != phase):
        raise ValueError("unsupported storage stage or wrong phase")
    if receipt.get("token") != token or type(receipt.get("pid")) is not int or receipt["pid"] != pid:
        raise ValueError("storage stage does not match its fixture/process")
    for key in ("webkit_data_store_persistent", "native_window_visible", "ordinary_app_content_admitted",
                "filesystem_coverage_verified"):
        if receipt.get(key) is not False:
            raise ValueError(f"storage stage requires {key}=false")
    for key in ("inspection_after_inert_bootstrap", "synthetic_content_only"):
        if receipt.get(key) is not True:
            raise ValueError(f"storage stage requires {key}=true")
    expected = "written-read-back" if phase == "write" else "absent"
    if any(receipt.get(key) != expected for key in ("local_storage", "indexed_db", "cache_storage")):
        raise ValueError("all three synthetic stores must satisfy the phase contract")


def run_stage(executable, root, phase, token):
    runner = ordinary.wk.qa.runner
    probes = {"write": runner.Probe.STORAGE_WRITE, "read": runner.Probe.STORAGE_READ}
    if phase not in probes:
        raise ValueError("unsupported synthetic storage phase")
    result = runner.run_probe(runner.LaunchSpec(
        root, executable, probes[phase], token=token, timeout_seconds=TIMEOUT_SECONDS,
    ))
    if result.returncode:
        raise ValueError(f"synthetic storage {phase} stage failed (exit {result.returncode})")
    receipt = json.loads(result.stdout)
    validate_stage(receipt, phase, token, result.pid)
    return dict(receipt, confinement_policy=result.policy_receipt)


def check_build_and_stores(root, executable, binary_hash, config_hash):
    if hashlib.sha256(executable.read_bytes()).hexdigest() != binary_hash:
        raise ValueError("binary changed during storage lifecycle")
    if hashlib.sha256((root / "tauri.qa.json").read_bytes()).hexdigest() != config_hash:
        raise ValueError("configuration changed during storage lifecycle")
    if any((root / "settings").iterdir()) or any(
        (root / "app-data" / name).exists() for name in ("conductor.db", "cache.db")
    ):
        raise ValueError("synthetic stage unexpectedly created ordinary app stores")


def probe(path, app):
    root, manifest, executable, binary_hash, config_hash = ordinary.wk.prerequisite(path, app)
    if VERSION.encode() not in executable.read_bytes():
        raise ValueError("binary lacks synthetic storage stage; refusing execution")
    previous = json.loads((root / ordinary.RECEIPT).read_text())
    ordinary.validate_receipt(root, previous, manifest, executable)
    if (previous.get("binary_sha256") != binary_hash or previous.get("config_sha256") != config_hash
            or previous.get("prepared_source_sha") != manifest["source_sha"]):
        raise ValueError("ordinary prerequisite does not match this exact source/binary/configuration")
    if any((root / name).exists() for name in (RECEIPT, "storage-write.json", "storage-read.json")):
        raise ValueError("synthetic storage stages require an unused fixture")
    token = secrets.token_hex(16)
    check_build_and_stores(root, executable, binary_hash, config_hash)
    write = run_stage(executable, root, "write", token)
    ordinary.wk.qa.write_json(root / "storage-write.json", write)
    check_build_and_stores(root, executable, binary_hash, config_hash)
    read = run_stage(executable, root, "read", token)
    ordinary.wk.qa.write_json(root / "storage-read.json", read)
    if write["pid"] == read["pid"]:
        raise ValueError("storage read stage must use a distinct relaunched process")
    check_build_and_stores(root, executable, binary_hash, config_hash)
    receipt = {
        "probe_version": LIFECYCLE_VERSION, "prepared_source_sha": manifest["source_sha"],
        "binary_sha256": binary_hash, "config_sha256": config_hash, "token": token,
        "write": write, "read": read, "storage_lifecycle_verified": True,
        "filesystem_coverage_verified": False, "ordinary_app_content_admitted": False,
        "scope": "synthetic localStorage, IndexedDB and CacheStorage write/read-back, then absence "
                 "after exact-binary relaunch only; no process/helper filesystem observer integrated; "
                 "not cache filesystem isolation, ordinary app admission or native visual parity",
    }
    ordinary.wk.qa.write_json(root / RECEIPT, receipt)
    return receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path)
    parser.add_argument("app", type=Path)
    parser.add_argument("--execute-synthetic-storage-stage", action="store_true")
    args = parser.parse_args()
    if sys.platform != "darwin":
        parser.error("the native synthetic storage stage runs on macOS only")
    if not args.execute_synthetic_storage_stage:
        parser.error("synthetic storage execution needs separate explicit authorization")
    print(json.dumps(probe(args.root, args.app), indent=2))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, KeyError, subprocess.SubprocessError) as error:
        print(f"native QA storage lifecycle refused: {error}", file=sys.stderr)
        sys.exit(1)
