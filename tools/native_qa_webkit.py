#!/usr/bin/env python3
"""Run the separately authorized, hidden macOS WebKit QA probe.

Unlike native_qa.py's path probe, this starts a WebKit instance. It must not be
used under a path-only grant. It never starts the ordinary application.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import plistlib
import subprocess
import sys

if __package__:
    from . import native_qa as qa
else:
    import native_qa as qa

VERSION = "OPENCONDUCTOR_NATIVE_QA_WEBKIT_V1"
TIMEOUT_SECONDS = 15


def prerequisite(root, app):
    root = qa.checked_root(root)
    manifest = json.loads((root / "manifest.json").read_text())
    config = (root / "tauri.qa.json").read_bytes()
    config_hash = hashlib.sha256(config).hexdigest()
    if config_hash != manifest["config_sha256"]:
        raise ValueError("prepared config changed; prepare a fresh root")
    app = Path(app).resolve(strict=True)
    info = plistlib.loads((app / "Contents/Info.plist").read_bytes())
    if info.get("CFBundleIdentifier") != manifest["identifier"]:
        raise ValueError("bundle identifier differs from the prepared QA build")
    name = info["CFBundleExecutable"]
    if Path(name).name != name or name in ("", ".", ".."):
        raise ValueError("invalid bundle executable name")
    executable = (app / "Contents/MacOS" / name).resolve(strict=True)
    binary = executable.read_bytes()
    if VERSION.encode() not in binary:
        raise ValueError("binary lacks the separate WebKit probe; refusing execution")
    binary_hash = hashlib.sha256(binary).hexdigest()
    previous = json.loads((root / "paths-receipt.json").read_text())
    qa.validate_receipt(root, previous, manifest, executable)
    if previous.get("binary_sha256") != binary_hash or previous.get("config_sha256") != config_hash:
        raise ValueError("path receipt does not describe this exact binary/configuration")
    if previous.get("prepared_source_sha") != manifest["source_sha"]:
        raise ValueError("path receipt source differs from the prepared source")
    if (root / "webkit-receipt.json").exists():
        raise ValueError("WebKit probe requires an unused runtime fixture")
    if (root / "app-data").exists() or any((root / "settings").iterdir()):
        raise ValueError("WebKit probe requires unused app-data and settings directories")
    return root, manifest, executable, binary_hash, config_hash


def validate_receipt(root, receipt, manifest, executable):
    if receipt.get("probe_version") != VERSION:
        raise ValueError("unsupported WebKit probe version")
    # Reuse path/identity validation, without accepting a path-only receipt as
    # an observation of the native datastore.
    qa.validate_receipt(root, dict(receipt, probe_version=qa.VERSION), manifest, executable)
    for key in ("webkit_data_store_persistent", "native_window_visible"):
        if receipt.get(key) is not False:
            raise ValueError(f"WebKit observation must report {key}=false")
    for key in ("javascript_disabled_requested", "navigation_policy_all_denied", "new_window_policy_all_denied",
                "inspection_after_bootstrap_construction"):
        if receipt.get(key) is not True:
            raise ValueError(f"WebKit probe requires {key}=true")
    if receipt.get("bootstrap_url") != "about:blank":
        raise ValueError("WebKit probe must use only the inert about:blank bootstrap")


def run_probe(executable, root):
    result = qa.runner.run_probe(qa.runner.LaunchSpec(
        root, executable, qa.runner.Probe.WEBKIT, timeout_seconds=TIMEOUT_SECONDS,
    ))
    if result.returncode:
        raise ValueError(f"WebKit probe failed (exit {result.returncode})")
    return dict(json.loads(result.stdout), confinement_policy=result.policy_receipt)


def probe(path, app):
    root, manifest, executable, binary_hash, config_hash = prerequisite(path, app)
    receipt = run_probe(executable, root)
    validate_receipt(root, receipt, manifest, executable)
    if any((root / "settings").iterdir()) or any(
        (root / "app-data" / name).exists() for name in ("conductor.db", "cache.db")
    ):
        raise ValueError("WebKit probe unexpectedly created ordinary app stores")
    receipt.update(prepared_source_sha=manifest["source_sha"], binary_sha256=binary_hash,
                   config_sha256=config_hash,
                   scope="observed WKWebsiteDataStore persistence after inert bootstrap only; "
                         "not full filesystem tracing, app-content isolation or visual parity")
    qa.write_json(root / "webkit-receipt.json", receipt)
    return receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path)
    parser.add_argument("app", type=Path)
    parser.add_argument("--execute-runtime-probe", action="store_true",
                        help="explicitly start the hidden WebKit probe (separate from path preflight)")
    args = parser.parse_args()
    if sys.platform != "darwin":
        parser.error("the real WebKit probe runs on macOS only")
    if not args.execute_runtime_probe:
        parser.error("runtime WebKit execution must be explicitly selected")
    print(json.dumps(probe(args.root, args.app), indent=2))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, KeyError, subprocess.SubprocessError) as error:
        print(f"native WebKit QA refused: {error}", file=sys.stderr)
        sys.exit(1)
