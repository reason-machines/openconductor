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


def require_filesystem_isolation(receipt):
    """Gate: unconditionally fail-closed; always raises ValueError.

    The parent-process lstat snapshot observer (``filesystem_observer_delta`` in the receipt)
    is a useful diagnostic but cannot establish genuine isolation coverage:

    * It cannot detect atomic write-delete within subprocess lifetime.
    * It cannot detect writes outside the snapshot root (helper processes, /tmp, etc.).
    * A caller-supplied dict carries no provenance; ``sandbox_policy_applied`` is an
      asserted field, not a trusted kernel attestation.
    * The ``sandbox-exec (deny default)`` enforcement layer is absent on Linux CI.

    Defense-in-depth checks below give specific error messages for known bypass cases
    before the unconditional final raise.

    Admission requires Endpoint Security / BSM kernel-level audit with a trusted
    privileged observer, or E1 native validation on a physical Mac host.
    ``filesystem_coverage_verified`` remains ``False``.
    """
    delta = receipt.get("filesystem_observer_delta")
    if delta is None:
        raise ValueError(
            "filesystem observer delta absent from receipt; ordinary admission denied"
        )
    if not isinstance(delta, dict):
        raise ValueError(
            "filesystem observer delta is not a dict; ordinary admission denied"
        )
    if delta.get("status") == "not_run":
        raise ValueError(
            "filesystem observer did not run; ordinary admission denied"
        )
    unauthorized = delta.get("unauthorized_writes")
    if not isinstance(unauthorized, list):
        raise ValueError(
            "filesystem observer unauthorized_writes is absent or not a list; "
            "ordinary admission denied"
        )
    if unauthorized:
        raise ValueError(
            f"filesystem observer detected {len(unauthorized)} unauthorized write(s) "
            f"{unauthorized!r}; ordinary admission denied"
        )
    if delta.get("status") != "clean":
        raise ValueError(
            f"filesystem observer non-clean status ({delta.get('status')!r}); "
            f"ordinary admission denied"
        )
    if not delta.get("sandbox_policy_applied"):
        raise ValueError(
            "sandbox_policy_applied is false or absent; portable transport cannot "
            "establish confinement; ordinary admission denied"
        )
    # Unconditional: lstat snapshot cannot prove absence of transient write-delete,
    # writes outside root, or helper-process activity; caller-supplied fields have
    # no provenance.  Admission requires ES/BSM kernel-level audit or E1 native
    # validation on a physical Mac host.
    raise ValueError(
        "filesystem_coverage_verified is False; lstat snapshot is not kernel-level "
        "audit; ordinary admission denied"
    )


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


def _merge_observer_deltas(write_stage: dict, read_stage: dict) -> dict:
    """Combine per-stage observer receipts into one lifecycle delta.

    If either stage did not run its observer (status 'not_run'), the merged result
    is 'not_run'.  Otherwise the unauthorized_writes lists are unioned and
    permitted_changed lists are kept per-stage.
    """
    write_obs = write_stage.get("filesystem_observer", {})
    read_obs  = read_stage.get("filesystem_observer", {})
    if write_obs.get("status") == "not_run" or read_obs.get("status") == "not_run":
        return {"status": "not_run",
                "scope": "filesystem observer did not run for one or both stages"}
    combined_unauthorized = sorted(
        set(write_obs.get("unauthorized_writes", [])) |
        set(read_obs.get("unauthorized_writes", []))
    )
    return {
        "scope": write_obs.get("scope", ""),
        "write_permitted_changed": write_obs.get("permitted_changed", []),
        "read_permitted_changed":  read_obs.get("permitted_changed", []),
        "unauthorized_writes":     combined_unauthorized,
        "status": "clean" if not combined_unauthorized else "unauthorized_writes_detected",
    }


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
    return dict(receipt, confinement_policy=result.policy_receipt,
                filesystem_observer=result.observer_receipt)


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
    filesystem_observer_delta = _merge_observer_deltas(write, read)
    receipt = {
        "probe_version": LIFECYCLE_VERSION, "prepared_source_sha": manifest["source_sha"],
        "binary_sha256": binary_hash, "config_sha256": config_hash, "token": token,
        "write": write, "read": read, "storage_lifecycle_verified": True,
        "filesystem_observer_delta": filesystem_observer_delta,
        "filesystem_coverage_verified": False, "ordinary_app_content_admitted": False,
        "scope": "parent-process lstat snapshot observer integrated (not kernel-level audit / "
                 "ES/BSM); filesystem_coverage_verified remains false; "
                 "synthetic localStorage, IndexedDB and CacheStorage write/read-back, then absence "
                 "after exact-binary relaunch only; not ordinary app admission or native visual parity",
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
