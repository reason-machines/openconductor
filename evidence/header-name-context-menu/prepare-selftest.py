#!/usr/bin/env python3
"""Prepare and run only the frozen packet's Python staging self-test."""
import argparse
import hashlib
import io
import json
import subprocess
import sys
import tarfile
from pathlib import Path

ARCHIVE_SHA256 = "6879abcc815533bfde3bfd4562d9d2b82f6e7f86b357ef3a1ee52060eb83aa88"
VERIFIER_SHA256 = "2ae64b02b599f4a3a018be9fd1c35971dd7f104a814000ddd2ed266d34505627"
PREFIX_SHA256 = "894e0f32379cf3bade2d18f7b04b373ff62eab3a002dbeec8f05be1dff8bc3ce"
PREFIX_ARCHIVE_SHA256 = "67499667ce63369a620478514a15dae13bfd4a18da29c251f725b0072ded7265"
PREFIX_MEMBER = ".ara-state/header-prefix-next/workspaceBranchPrefix.test.ts"
MEMBERS = {
    "README.md", "baseline-frontend.tar", "freeze.py", "manifest.json",
    "source-only-checks.json", "stage.py", "verify_stage.py",
    "workspace-header-menu-cases.mjs",
}


def digest(blob):
    return hashlib.sha256(blob).hexdigest()


def require(condition, message):
    if not condition:
        raise SystemExit("STOP " + message)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--prefix-archive", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    repo, out = args.repo.resolve(), args.out.resolve()
    require(args.prefix_archive.is_file(), "original Prefix9 archive is missing; obtain retained bytes from E1")
    prefix_archive = args.prefix_archive.read_bytes()
    require(digest(prefix_archive) == PREFIX_ARCHIVE_SHA256, "original Prefix9 archive hash mismatch")
    with tarfile.open(fileobj=io.BytesIO(prefix_archive), mode="r:") as archive:
        matches = [member for member in archive if member.name == PREFIX_MEMBER]
        require(len(matches) == 1 and matches[0].isfile(), "original Prefix9 fixture member missing or not regular")
        prefix_bytes = archive.extractfile(matches[0]).read()
    require(digest(prefix_bytes) == PREFIX_SHA256, "original Prefix9 fixture hash mismatch")
    prefix = out / "prefix9" / "workspaceBranchPrefix.test.ts"
    require(not out.exists(), "output exists; retain it")
    require(out != repo and (repo not in out.parents or ".ara-state" in out.relative_to(repo).parts), "output must be separate scratch")
    raw = args.archive.read_bytes()
    require(digest(raw) == ARCHIVE_SHA256, "original header8 archive hash mismatch")
    blobs = {}
    with tarfile.open(fileobj=io.BytesIO(raw), mode="r:gz") as archive:
        for member in archive:
            require(member.isfile() and member.name in MEMBERS and member.name not in blobs, "unexpected archive member")
            blobs[member.name] = archive.extractfile(member).read()
    require(set(blobs) == MEMBERS, "original header8 packet is incomplete")
    require(digest(blobs["verify_stage.py"]) == VERIFIER_SHA256, "original verifier hash mismatch")
    original = blobs["verify_stage.py"].decode()
    prefix_setup = "prefix = ROOT / '.ara-state/header-prefix-next/workspaceBranchPrefix.test.ts'"
    report_setup = "(HERE / 'source-only-checks.json').write_text"
    require(original.count(prefix_setup) == 1 and original.count(report_setup) == 1, "verifier setup changed")
    report = out / "actual-selftest.json"
    prepared = original.replace(prefix_setup, f"prefix = Path({str(prefix)!r})").replace(
        report_setup, f"Path({str(report)!r}).write_text",
    )
    require(prepared.replace(f"prefix = Path({str(prefix)!r})", prefix_setup).replace(
        f"Path({str(report)!r}).write_text", report_setup,
    ) == original, "self-test assertions changed")
    packet = out / "original"
    packet.mkdir(parents=True)
    for name, blob in blobs.items():
        (packet / name).write_bytes(blob)
    prefix.parent.mkdir()
    prefix.write_bytes(prefix_bytes)
    script = packet / "verify-prepared.py"
    script.write_text(prepared)
    command = [sys.executable, str(script)]
    result = subprocess.run(command, cwd=repo, capture_output=True, text=True)
    (out / "stdout.txt").write_text(result.stdout)
    (out / "stderr.txt").write_text(result.stderr)
    require(all((packet / name).read_bytes() == blob for name, blob in blobs.items()), "original packet changed")
    require(digest(prefix.read_bytes()) == PREFIX_SHA256, "Prefix9 fixture changed")
    require(args.archive.read_bytes() == raw, "original header8 archive changed")
    require(args.prefix_archive.read_bytes() == prefix_archive, "original Prefix9 archive changed")
    receipt = {
        "producer": "Conductor Rebuild",
        "scope": "source-only Python staging self-test; no app execution or admission",
        "archive_sha256": ARCHIVE_SHA256,
        "prefix9_archive_sha256": PREFIX_ARCHIVE_SHA256,
        "prefix9_fixture_sha256": PREFIX_SHA256,
        "original_verifier_sha256": VERIFIER_SHA256,
        "prepared_verifier_sha256": digest(prepared.encode()),
        "setup_changes": ["explicit verified Prefix9 input", "separate actual report output"],
        "frozen_packet_members_unchanged": len(blobs),
        "original_assertions_unchanged": True,
        "command": command,
        "returncode": result.returncode,
        "actual_report": str(report) if report.exists() else None,
        "behavioral_red_green": "NOT RUN",
        "runtime_admission": "NOT GRANTED; existing E1 queue unchanged",
    }
    (out / "preparation-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps(receipt, indent=2))
    if result.returncode:
        print(result.stderr, file=sys.stderr)
    raise SystemExit(result.returncode)


if __name__ == "__main__":
    main()
