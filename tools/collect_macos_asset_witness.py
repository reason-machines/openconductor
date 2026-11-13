#!/usr/bin/env python3
"""Retain original package-build assets. Never build, sign, decode or launch."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import plistlib
import re
import stat
import subprocess
import zipfile

MAX_FILE = 128 * 1024 * 1024
MAX_TOTAL = 1024 * 1024 * 1024
SOURCE_INPUTS = (
    "src", "crates", "src-tauri/src", "public", "index.html", "package.json",
    "package-lock.json", "vite.config.ts", "tsconfig.json", "src-tauri/Cargo.toml",
    "src-tauri/Cargo.lock", "src-tauri/build.rs", "src-tauri/tauri.conf.json",
    "src-tauri/tauri.bundle.conf.json", "src-tauri/Entitlements.plist",
    "scripts/package-macos.sh", "scripts/fetch-bundled-tools.sh",
    "tools/collect_macos_asset_witness.py", ".github/workflows/package-macos.yml",
)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(stream, algorithm="sha256", prefix=b""):
    h = hashlib.new(algorithm)
    h.update(prefix)
    while chunk := stream.read(1024 * 1024):
        h.update(chunk)
    return h.hexdigest()


def regular(root, path):
    path = Path(os.path.abspath(path))
    require(path.is_relative_to(root), f"path outside source root: {path}")
    relative = path.relative_to(root)
    require(all(not p.is_symlink() for p in (path, *path.parents) if p != root.parent),
            f"symlink in input path: {relative}")
    require(stat.S_ISREG(path.stat().st_mode), f"regular file required: {relative}")
    return path


def file_record(root, path):
    path = regular(root, path)
    size = path.stat().st_size
    with path.open("rb") as stream:
        checksum = digest(stream)
    require(path.stat().st_size == size, f"file changed while hashing: {path}")
    return {"path": path.relative_to(root).as_posix(), "bytes": size, "sha256": checksum}


def git(root, *args):
    return subprocess.check_output(["git", "-C", str(root), *args])


def source_records(root, source_commit):
    require(re.fullmatch(r"[0-9a-f]{40}", source_commit), "full source commit required")
    require(git(root, "rev-parse", "HEAD").decode().strip() == source_commit,
            "checkout HEAD differs from source commit")
    entries = git(root, "ls-tree", "-rz", source_commit, "--", *SOURCE_INPUTS)
    rows = []
    for entry in entries.split(b"\0"):
        if not entry:
            continue
        metadata, name = entry.split(b"\t", 1)
        mode, kind, blob = metadata.decode().split()
        require(mode in ("100644", "100755") and kind == "blob", "regular source blob required")
        row = file_record(root, root / name.decode())
        with (root / row["path"]).open("rb") as stream:
            actual = digest(stream, "sha1", f"blob {row['bytes']}\0".encode())
        require(actual == blob, f"source bytes differ from commit: {row['path']}")
        row.update(git_blob=blob, git_mode=mode)
        rows.append(row)
    require(any(row["path"].startswith("src/") for row in rows), "product source required")
    return rows


def asset_records(root, profile):
    selected = []
    directories = [root / "dist"]
    directories += sorted((root / f"src-tauri/target/{profile}/build").glob("*/out/tauri-codegen-assets"))
    require(len(directories) > 1, "original tauri-codegen-assets required")
    origins = []
    for index, directory in enumerate(directories):
        require(directory.is_dir() and not directory.is_symlink(), f"asset directory missing: {directory}")
        prefix = "dist" if index == 0 else f"generated/{index - 1}"
        files = []
        for path in sorted(directory.rglob("*")):
            require(not path.is_symlink(), f"symlink asset: {path}")
            if path.is_dir():
                continue
            row = file_record(root, path)
            require(row["bytes"] <= MAX_FILE, "asset exceeds file limit")
            row["archive_path"] = prefix + "/" + path.relative_to(directory).as_posix()
            selected.append(row)
            files.append(path)
        require(any(p.suffix == ".js" for p in files) and any(p.suffix == ".map" for p in files),
                f"original JavaScript and source maps required: {directory}")
        origins.append({"archive_prefix": prefix, "source_directory": directory.relative_to(root).as_posix()})
    require(sum(row["bytes"] for row in selected) <= MAX_TOTAL, "assets exceed total limit")
    return selected, origins


def bundle_record(root, profile, archive, contract):
    app = root / f"src-tauri/target/{profile}/bundle/macos/OpenConductor.app"
    info_path = regular(root, app / "Contents/Info.plist")
    require(info_path.stat().st_size <= 1024 * 1024, "oversized Info.plist")
    info = plistlib.loads(info_path.read_bytes())
    require(info.get("CFBundleIdentifier") == "com.reasonmachines.openconductor", "bundle identifier differs")
    executable = info.get("CFBundleExecutable")
    require(isinstance(executable, str) and executable not in ("", ".", "..")
            and PurePosixPath(executable).name == executable and "\\" not in executable,
            "invalid bundle executable name")
    exe = file_record(root, app / "Contents/MacOS" / executable)
    plist = file_record(root, info_path)
    report = file_record(root, contract)
    require(report["bytes"] <= 1024 * 1024, "oversized bundle check")
    checks = json.loads(contract.read_text())
    require(checks.get("ok") is True and checks.get("checks")
            and all(row.get("ok") is True for row in checks["checks"])
            and any(row.get("check") == "codesign-verify" for row in checks["checks"]),
            "passing bundle check with codesign-verify required")
    archive_info = file_record(root, archive)
    with zipfile.ZipFile(archive) as z:
        names = z.namelist()
        require(len(names) == len(set(names)), "duplicate bundle ZIP members")
        require(all(not PurePosixPath(n).is_absolute() and ".." not in PurePosixPath(n).parts
                    and "\\" not in n for n in names), "unsafe bundle ZIP member")
        require(sum(i.file_size for i in z.infolist()) <= MAX_TOTAL, "bundle ZIP exceeds total limit")
        require(z.testzip() is None, "bundle ZIP CRC failed")
        for row in (exe, plist):
            member = "OpenConductor.app/" + str((root / row["path"]).relative_to(app))
            require(z.getinfo(member).file_size == row["bytes"], "bundle ZIP member size differs")
            with z.open(member) as stream:
                require(digest(stream) == row["sha256"], "bundle ZIP bytes differ from checked app")
    return {"identifier": info["CFBundleIdentifier"], "executable": exe, "info_plist": plist,
            "archive": archive_info, "bundle_check": report, "zip_crc_and_app_binding": "PASS"}


def collect(root, source_commit, profile, archive, contract, output):
    root = root.resolve(strict=True)
    sources = source_records(root, source_commit)
    assets, origins = asset_records(root, profile)
    bundle = bundle_record(root, profile, archive, contract)
    manifest = {
        "schema_version": 1, "kind": "ORIGINAL_FRONTEND_AND_CODEGEN_WITNESS_NOT_APP_ARTIFACT",
        "source_commit": source_commit, "profile": profile, "source_files": sources,
        "original_directories": origins, "files": assets, "bundle": bundle,
        "github_run": {key: os.environ.get(key) for key in ("GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT", "GITHUB_SHA")},
        "limits": ["Retains original bytes without decoding or recompression as build witnesses",
                   "Does not prove asset embedding, runtime lookup, build hermeticity or native acceptance",
                   "Bundle-check result is retained evidence, not independent signature verification"],
    }
    with output.open("xb") as stream:
        try:
            with zipfile.ZipFile(stream, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
                for row in assets:
                    z.write(root / row["path"], row["archive_path"])
                z.writestr("witness-manifest.json", json.dumps(manifest, indent=2) + "\n")
            stream.flush()
            with zipfile.ZipFile(output) as z:
                require(z.testzip() is None, "witness ZIP CRC failed")
                for row in assets:
                    with z.open(row["archive_path"]) as retained:
                        require(digest(retained) == row["sha256"], "asset changed during retention")
            require(source_records(root, source_commit) == sources, "source changed during retention")
        except BaseException:
            output.unlink()
            raise
    with output.open("rb") as stream:
        checksum = digest(stream)
    return {"witness": output.name, "bytes": output.stat().st_size, "sha256": checksum,
            "source_commit": source_commit, "original_files": len(assets),
            "executable_sha256": bundle["executable"]["sha256"], "native_acceptance": "NOT_RUN"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--source-commit", required=True)
    parser.add_argument("--profile", choices=("debug", "release"), default="debug")
    parser.add_argument("--archive", type=Path, default=Path("OpenConductor-debug.zip"))
    parser.add_argument("--contract", type=Path, default=Path("bundle-check.json"))
    parser.add_argument("--output", type=Path, default=Path("frontend-codegen-witness.zip"))
    args = parser.parse_args()
    root = args.root.resolve(strict=True)
    result = collect(root, args.source_commit, args.profile, root / args.archive,
                     root / args.contract, root / args.output)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
