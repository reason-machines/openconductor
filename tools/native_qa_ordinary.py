#!/usr/bin/env python3
"""Observe the ordinary QA main-window prerequisite without admitting app content.

This launches a hidden WebKit instance only under separate native authorization.
It never unlocks ordinary app startup, even after a successful receipt.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

if __package__:
    from . import native_qa_webkit as wk
else:
    import native_qa_webkit as wk

VERSION = "OPENCONDUCTOR_NATIVE_QA_ORDINARY_PREREQUISITE_V1"
TIMEOUT_SECONDS = 15
RECEIPT = "ordinary-webkit-prerequisite.json"


def validate_receipt(root, receipt, manifest, executable):
    if receipt.get("probe_version") != VERSION:
        raise ValueError("unsupported ordinary QA prerequisite version")
    wk.validate_receipt(root, dict(receipt, probe_version=wk.VERSION), manifest, executable)
    if receipt.get("window_label") != "main":
        raise ValueError("ordinary QA prerequisite must inspect the main window")
    for key in ("app_content_admitted", "ordinary_setup_admitted", "cache_filesystem_verified"):
        if receipt.get(key) is not False:
            raise ValueError(f"ordinary QA prerequisite requires {key}=false")


def run_prerequisite(executable, root):
    result = wk.qa.runner.run_probe(wk.qa.runner.LaunchSpec(
        root, executable, wk.qa.runner.Probe.ORDINARY, timeout_seconds=TIMEOUT_SECONDS,
    ))
    if result.returncode:
        raise ValueError(f"ordinary QA prerequisite failed (exit {result.returncode})")
    return dict(json.loads(result.stdout), confinement_policy=result.policy_receipt)


def probe(path, app):
    root, manifest, executable, binary_hash, config_hash = wk.prerequisite(path, app)
    if VERSION.encode() not in executable.read_bytes():
        raise ValueError("binary lacks fail-closed ordinary QA prerequisite; refusing execution")
    if (root / RECEIPT).exists():
        raise ValueError("ordinary QA prerequisite requires an unused runtime fixture")
    receipt = run_prerequisite(executable, root)
    validate_receipt(root, receipt, manifest, executable)
    if any((root / "settings").iterdir()) or any(
        (root / "app-data" / name).exists() for name in ("conductor.db", "cache.db")
    ):
        raise ValueError("ordinary QA prerequisite unexpectedly created ordinary app stores")
    if hashlib.sha256(executable.read_bytes()).hexdigest() != binary_hash:
        raise ValueError("binary changed during ordinary QA prerequisite")
    if hashlib.sha256((root / "tauri.qa.json").read_bytes()).hexdigest() != config_hash:
        raise ValueError("config changed during ordinary QA prerequisite")
    receipt.update(prepared_source_sha=manifest["source_sha"], binary_sha256=binary_hash,
                   config_sha256=config_hash,
                   scope="observed hidden main-window datastore after inert bootstrap only; "
                         "ordinary setup and app content denied; cache filesystem/write+relaunch "
                         "isolation NOT verified; no admission capability")
    wk.qa.write_json(root / RECEIPT, receipt)
    return receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path)
    parser.add_argument("app", type=Path)
    parser.add_argument("--execute-prerequisite", action="store_true")
    args = parser.parse_args()
    if sys.platform != "darwin":
        parser.error("the real ordinary QA prerequisite runs on macOS only")
    if not args.execute_prerequisite:
        parser.error("hidden main-window execution must be explicitly selected")
    print(json.dumps(probe(args.root, args.app), indent=2))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, KeyError, subprocess.SubprocessError) as error:
        print(f"ordinary native QA refused: {error}", file=sys.stderr)
        sys.exit(1)
