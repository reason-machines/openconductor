#!/usr/bin/env python3
"""Prepare an isolated native QA build and verify its headless path receipt.

This tool never starts a GUI. Native input still requires the coordinator's slot.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import plistlib
import stat
import subprocess
import sys
import uuid

if __package__:
    from . import native_qa_runner as runner
else:
    import native_qa_runner as runner

VERSION = "OPENCONDUCTOR_NATIVE_QA_PREFLIGHT_V1"
PREFIX = "com.reasonmachines.openconductor.qa."
PATH_FIELDS = (
    "app_data_dir", "app_config_dir", "app_cache_dir", "app_local_data_dir",
    "app_log_dir", "settings_file", "database", "cache_database", "workspace_root",
)
REPO = Path(__file__).resolve().parents[1]


def checked_root(path):
    path = Path(os.path.abspath(path))
    if path != path.resolve(strict=True):
        raise ValueError("QA root must be canonical, without symlinks")
    info = path.stat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid():
        raise ValueError("QA root must be an owned directory")
    if stat.S_IMODE(info.st_mode) != 0o700:
        raise ValueError("QA root must have mode 0700")
    return path


def inside(root, path):
    path = Path(path)
    if not path.is_absolute() or ".." in path.parts:
        raise ValueError("receipt paths must be absolute and cannot contain ..")
    resolved = path.resolve()
    if not resolved.is_relative_to(root) or resolved == root:
        raise ValueError("resolved path escapes the QA root")
    return resolved


def write_json(path, value):
    with path.open("x", encoding="utf-8") as stream:
        json.dump(value, stream, indent=2)
        stream.write("\n")
    path.chmod(0o600)


def prepare(path, repo=REPO):
    root = Path(os.path.abspath(path))
    if root.exists() or root.is_symlink():
        raise ValueError("prepare requires a new root; never reuse app data")
    if root.parent != root.parent.resolve(strict=True):
        raise ValueError("QA root parent must be canonical")
    source = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo, text=True).strip()
    if subprocess.check_output(["git", "status", "--porcelain", "--untracked-files=no"], cwd=repo):
        raise ValueError("commit tracked source changes before preparing a QA build")
    base = json.loads((repo / "src-tauri/tauri.conf.json").read_text())
    windows = base["app"]["windows"]
    for window in windows:
        window.update(create=False, incognito=True)
        window.pop("dataDirectory", None)
        window.pop("dataStoreIdentifier", None)
    identifier = PREFIX + uuid.uuid4().hex
    config = {
        "productName": "OpenConductor QA",
        "identifier": identifier,
        "app": {"appDirectoriesOverride": str(root / "app-data"), "windows": windows},
    }
    root.mkdir(mode=0o700)
    for name in ("home", "settings", "config", "cache", "data", "tmp", "e2e"):
        (root / name).mkdir(mode=0o700)
    write_json(root / "tauri.qa.json", config)
    manifest = {"identifier": identifier, "source_sha": source,
                "config_sha256": hashlib.sha256((root / "tauri.qa.json").read_bytes()).hexdigest()}
    write_json(root / "manifest.json", manifest)
    return manifest


def environment(root):
    # Keep the toolchain path, not ambient provider auth or sidecar overrides.
    env = {key: os.environ[key] for key in ("PATH", "LANG", "LC_ALL", "DISPLAY") if key in os.environ}
    env.update({
        "HOME": str(root / "home"), "CFFIXED_USER_HOME": str(root / "home"),
        "OPENCONDUCTOR_HOME": str(root / "settings"),
        "XDG_CONFIG_HOME": str(root / "config"), "XDG_CACHE_HOME": str(root / "cache"),
        "XDG_DATA_HOME": str(root / "data"), "TMPDIR": str(root / "tmp"),
        "OC_E2E_OUT": str(root / "e2e"), "OC_NATIVE_QA_ROOT": str(root),
    })
    return env


def validate_receipt(root, receipt, manifest, executable):
    if receipt.get("probe_version") != VERSION:
        raise ValueError("unsupported path probe version")
    if receipt.get("identifier") != manifest["identifier"]:
        raise ValueError("runtime identifier does not match the prepared build")
    if not receipt["identifier"].startswith(PREFIX):
        raise ValueError("normal installed bundle identity is forbidden")
    if Path(receipt.get("executable", "")).resolve() != executable.resolve():
        raise ValueError("runtime executable does not match the inspected bundle")
    for key in PATH_FIELDS:
        inside(root, receipt[key])
    if inside(root, receipt["app_data_dir"]) != root / "app-data":
        raise ValueError("runtime did not apply appDirectoriesOverride")
    expected = {"database": root / "app-data/conductor.db",
                "cache_database": root / "app-data/cache.db",
                "workspace_root": root / "app-data",
                "settings_file": root / "settings/settings.toml"}
    for key, path in expected.items():
        if inside(root, receipt[key]) != path:
            raise ValueError(f"unexpected resolved {key}")
    if receipt.get("webview_incognito") is not True:
        raise ValueError("QA config must request a nonpersistent webview")


def probe(path, app):
    root = checked_root(path)
    manifest = json.loads((root / "manifest.json").read_text())
    config = (root / "tauri.qa.json").read_bytes()
    if hashlib.sha256(config).hexdigest() != manifest["config_sha256"]:
        raise ValueError("prepared config changed; prepare a fresh root")
    app = Path(app).resolve(strict=True)
    info = plistlib.loads((app / "Contents/Info.plist").read_bytes())
    if info.get("CFBundleIdentifier") != manifest["identifier"]:
        raise ValueError("bundle identifier differs; rebuild with the prepared QA config")
    name = info["CFBundleExecutable"]
    if Path(name).name != name or name in ("", ".", ".."):
        raise ValueError("invalid bundle executable name")
    executable = (app / "Contents/MacOS" / name).resolve(strict=True)
    binary = executable.read_bytes()
    if VERSION.encode() not in binary:
        raise ValueError("binary lacks headless preflight; refusing to execute an old GUI")
    env = environment(root)
    for key, value in env.items():
        if key not in ("PATH", "LANG", "LC_ALL", "DISPLAY", "OC_NATIVE_QA_ROOT"):
            inside(root, value)
    # Even a buggy probe cannot reach pre-existing QA databases or settings.
    if (root / "app-data").exists() or any((root / "settings").iterdir()):
        raise ValueError("path probe requires unused app-data and settings directories")
    result = runner.run_probe(runner.LaunchSpec(root, executable, runner.Probe.PATHS))
    if result.returncode:
        raise ValueError(f"headless path probe failed (exit {result.returncode}); no GUI launch allowed")
    receipt = json.loads(result.stdout)
    validate_receipt(root, receipt, manifest, executable)
    if (root / "app-data").exists() or any((root / "settings").iterdir()):
        raise ValueError("headless probe unexpectedly created app stores; no GUI launch allowed")
    receipt.update(confinement_policy=result.policy_receipt, prepared_source_sha=manifest["source_sha"],
                   binary_sha256=hashlib.sha256(binary).hexdigest(),
                   config_sha256=manifest["config_sha256"],
                   scope="resolved native paths only; no GUI or WebKit runtime proof")
    write_json(root / "paths-receipt.json", receipt)
    return receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="action", required=True)
    prep = sub.add_parser("prepare")
    prep.add_argument("root", type=Path)
    check = sub.add_parser("probe")
    check.add_argument("root", type=Path)
    check.add_argument("app", type=Path)
    args = parser.parse_args()
    if args.action == "prepare":
        value = prepare(args.root)
    else:
        if sys.platform != "darwin":
            parser.error("the real bundle probe runs on macOS only")
        value = probe(args.root, args.app)
    print(json.dumps(value, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, KeyError, subprocess.SubprocessError) as error:
        print(f"native QA refused: {error}", file=sys.stderr)
        sys.exit(1)
