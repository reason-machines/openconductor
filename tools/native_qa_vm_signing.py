"""Read VM-runner metadata or compare a caller-trusted build receipt, never execute."""
import argparse
from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import plistlib
import re
import stat
import subprocess

BUNDLE_ID = "com.reasonmachines.openconductor.qa-vm-runner"
EXECUTABLE = "OpenConductorQAVMRunner"
ENTITLEMENTS = {
    "com.apple.security.app-sandbox": True,
    "com.apple.security.virtualization": True,
}


def verify_entitlements(data):
    values = plistlib.loads(data)
    if (not isinstance(values, dict) or values.keys() != ENTITLEMENTS.keys()
            or any(type(values[key]) is not bool or values[key] is not True
                   for key in ENTITLEMENTS)):
        raise ValueError("signed runner must have exactly sandbox and virtualization entitlements")


def _bundle_paths(bundle):
    if bundle.suffix != ".app" or not bundle.is_dir() or bundle.is_symlink():
        raise ValueError("expected a standalone VM runner app bundle")
    directories = {"Contents", "Contents/MacOS", "Contents/_CodeSignature"}
    files = {"Contents/Info.plist", f"Contents/MacOS/{EXECUTABLE}",
             "Contents/_CodeSignature/CodeResources"}
    paths = [bundle, *bundle.rglob("*")]
    for path in paths[1:]:
        relative = str(path.relative_to(bundle))
        if (path.is_symlink()
                or not (relative in directories and path.is_dir()
                        or relative in files and path.is_file())):
            raise ValueError("unexpected runner bundle content")
    return paths


def verify_bundle(bundle):
    """Inspect signed metadata only. This does not establish executable identity."""
    bundle = Path(bundle)
    _bundle_paths(bundle)
    info = plistlib.loads((bundle / "Contents/Info.plist").read_bytes())
    if (not isinstance(info, dict) or info.get("CFBundleIdentifier") != BUNDLE_ID
            or info.get("CFBundleExecutable") != EXECUTABLE
            or not (bundle / "Contents/MacOS" / EXECUTABLE).is_file()):
        raise ValueError("runner bundle identity mismatch")
    subprocess.run(["/usr/bin/codesign", "--verify", "--strict", str(bundle)],
                   check=True, capture_output=True)
    result = subprocess.run(
        ["/usr/bin/codesign", "--display", "--entitlements", "-", "--xml", str(bundle)],
        check=True, capture_output=True)
    verify_entitlements(result.stdout)


@dataclass(frozen=True)
class BuildIdentity:
    source_commit: str
    build_id: str
    executable_sha256: str


def _stat_identity(value):
    return (value.st_dev, value.st_ino, value.st_mode, value.st_nlink,
            value.st_size, value.st_mtime_ns, value.st_ctime_ns)


def _without_symlinks(path):
    path = Path(os.path.abspath(path))
    if any(parent.is_symlink() for parent in (path, *path.parents)):
        raise ValueError("identity inputs must not traverse symlinks")
    return path


def _read_regular(path):
    path = _without_symlinks(path)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, "rb") as stream:
        before = os.fstat(stream.fileno())
        if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1:
            raise ValueError("identity inputs must be standalone regular files")
        data = stream.read()
        after = os.fstat(stream.fileno())
    identity = _stat_identity(before)
    if identity != _stat_identity(after) or identity != _stat_identity(path.lstat()):
        raise ValueError("identity input changed while reading")
    return data, (*identity, hashlib.sha256(data).hexdigest())


def _snapshot_bundle(bundle):
    bundle = _without_symlinks(bundle)
    return {str(path.relative_to(bundle)):
            _stat_identity(path.lstat()) if path.is_dir() else _read_regular(path)[1]
            for path in _bundle_paths(bundle)}


def _unique_fields(pairs):
    values = {}
    for key, value in pairs:
        if key in values:
            raise ValueError("duplicate build receipt field")
        values[key] = value
    return values


def verify_build_identity(bundle, *, build_receipt=None, expected_source=None):
    """Compare with a caller-trusted receipt and separately pinned source commit.

    Receipt schema 1 has exactly repository, source_commit, build_id and
    executable_sha256 alongside schema. The repository is fixed; source and
    SHA-256 are full lowercase hex. build_id identifies the separately kept job.
    The caller must obtain and authenticate that CI/build receipt independently.
    Being outside the bundle is not evidence that a receipt is trustworthy.
    This function neither creates a receipt nor authenticates its provenance.
    Snapshots detect observed changes, not every transient path or byte swap.
    The result is a readback, not a launch token or protection against later writes.
    """
    if (not isinstance(expected_source, str)
            or re.fullmatch(r"[0-9a-f]{40}", expected_source) is None
            or build_receipt is None):
        raise ValueError("independent build receipt and exact expected source are required")
    bundle = _without_symlinks(bundle)
    receipt = _without_symlinks(build_receipt)
    if receipt == bundle or bundle in receipt.parents:
        raise ValueError("build receipt must be supplied outside the candidate bundle")
    data, receipt_before = _read_regular(receipt)
    values = json.loads(data, object_pairs_hook=_unique_fields)
    fields = {"schema", "repository", "source_commit", "build_id", "executable_sha256"}
    if (not isinstance(values, dict) or values.keys() != fields
            or type(values["schema"]) is not int or values["schema"] != 1
            or values["repository"] != "reason-machines/openconductor"
            or values["source_commit"] != expected_source
            or not isinstance(values["build_id"], str) or not values["build_id"].strip()
            or not isinstance(values["executable_sha256"], str)
            or re.fullmatch(r"[0-9a-f]{64}", values["executable_sha256"]) is None):
        raise ValueError("invalid exact-source build receipt")
    identity = BuildIdentity(values["source_commit"], values["build_id"],
                             values["executable_sha256"])
    before = _snapshot_bundle(bundle)
    executable = f"Contents/MacOS/{EXECUTABLE}"
    if executable not in before or before[executable][-1] != identity.executable_sha256:
        raise ValueError("runner executable does not match independent build receipt")
    verify_bundle(bundle)
    if before != _snapshot_bundle(bundle) or receipt_before != _read_regular(receipt)[1]:
        raise ValueError("runner bundle or build receipt changed during signature inspection")
    return identity


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("bundle", type=Path)
    parser.add_argument("--build-receipt", type=Path,
                        help="caller-authenticated CI/build receipt, outside the candidate")
    parser.add_argument("--expected-source", help="independently pinned full source commit")
    args = parser.parse_args()
    try:
        if args.build_receipt is not None or args.expected_source is not None:
            verify_build_identity(args.bundle, build_receipt=args.build_receipt,
                                  expected_source=args.expected_source)
            print("PASS: executable matches caller-trusted exact-source build receipt; not native admission")
        else:
            verify_bundle(args.bundle)
            print("PASS: signed metadata only; executable identity UNVERIFIED; not native admission")
    except (ValueError, OSError, plistlib.InvalidFileException,
            subprocess.CalledProcessError) as error:
        parser.exit(1, f"REFUSED: {error}\n")


if __name__ == "__main__":
    main()
