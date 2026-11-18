#!/usr/bin/env python3
"""SAMEDE6 private dependency prerequisite. Requires a separate ledger reservation.

No import-time work. No fixture, build, browser or native command is run here.
Success retains only this checkout's node_modules for a separately admitted RED.
Failure/signal removes only directories created under this helper's ownership.
"""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[3]
STATE = ROOT / ".oc-tmp/uncommitted-discard-runtime"
MODULES = ROOT / "node_modules"
CACHE = STATE / "npm-cache"
INPUTS = {
    "package.json": "4bb4f30b331c3dcb97902768e412fd0a75a79420438795c11f4b8d6aaa422e91",
    "package-lock.json": "2203faf80f07760a020cb1c4aa3ef55e2c25db72a887c5c02808b0d2c2621992",
    "tests/diff/uncommittedDiscardAffordance.mounted.test.mjs": "356522ce6cc1a129b4e3536346e5c45e217d1cf6e6860cfef09cbe840e97f506",
}
EXPECTED = {"react": "18.3.1", "react-test-renderer": "18.3.1", "typescript": "5.9.3", "@pierre/diffs": "1.6.4", "fuzzysort": "3.1.0"}
GIB = 1024 ** 3
STOP = None


def interrupted(signum, _frame):
    global STOP
    STOP = signal.Signals(signum).name


def limits():
    os.sched_setaffinity(0, {0})
    os.setpriority(os.PRIO_PROCESS, 0, 10)


def group_members(pgid):
    """Read only the spawned process group's live pids and aggregate RSS."""
    members = []
    for path in Path("/proc").glob("[0-9]*/stat"):
        try:
            value = path.read_text()
            fields = value[value.rfind(")") + 2:].split()
            if int(fields[2]) == pgid and fields[0] != "Z":
                members.append((int(path.parent.name), int(fields[21]) * os.sysconf("SC_PAGE_SIZE")))
        except (OSError, ValueError, IndexError):
            continue  # A process may exit between directory scan and stat read.
    return members


def send_group(pgid, sig):
    try:
        os.killpg(pgid, sig)
    except ProcessLookupError:
        pass


def stop_group(child, deadline):
    send_group(child.pid, signal.SIGTERM)
    grace = min(time.monotonic() + 5, deadline)
    while time.monotonic() < grace and group_members(child.pid):
        time.sleep(0.1)
    send_group(child.pid, signal.SIGKILL)
    try:
        child.wait(timeout=max(0.01, deadline - time.monotonic()))
    except subprocess.TimeoutExpired:
        return False
    return not group_members(child.pid)


def cleanup(paths, deadline):
    # Fixed helper-owned paths only; never traverse a symlink or another checkout.
    for path in paths:
        if path not in (MODULES, CACHE) or path.is_symlink():
            raise RuntimeError("Refusing unsafe cleanup target")
    child = subprocess.Popen(
        [sys.executable, "-c", "import pathlib,shutil,sys; [shutil.rmtree(p) for p in map(pathlib.Path,sys.argv[1:]) if p.exists()]", *map(str, paths)],
        cwd=ROOT, start_new_session=True, preexec_fn=limits,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        status = child.wait(timeout=max(0.01, deadline - time.monotonic()))
    except subprocess.TimeoutExpired:
        send_group(child.pid, signal.SIGKILL)
        child.wait(timeout=1)
        return False
    return status == 0 and all(not path.exists() for path in paths)


def verify_inputs():
    for name, digest in INPUTS.items():
        if hashlib.sha256((ROOT / name).read_bytes()).hexdigest() != digest:
            raise RuntimeError(f"Pinned input changed: {name}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--execute-deps-only", action="store_true")
    mode.add_argument("--cleanup-owned-deps", action="store_true")
    args = parser.parse_args()
    if 0 not in os.sched_getaffinity(0):
        raise RuntimeError("Reserved CPU 0 is unavailable; no fallback CPU")
    if STATE.is_symlink() or MODULES.is_symlink():
        raise RuntimeError("Owned state/modules must not be symlinks")
    STATE.mkdir(parents=True, exist_ok=True)
    marker = STATE / "owns-node-modules.json"
    with (STATE / "lease.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if args.cleanup_owned_deps:
            if not marker.is_file() or json.loads(marker.read_text())["root"] != str(ROOT):
                raise RuntimeError("No matching SAMEDE6 ownership marker")
            ok = cleanup([MODULES, CACHE], time.monotonic() + 30)
            if ok:
                marker.unlink()
            print(json.dumps({"phase": "CLEANUP_ONLY", "passed": ok}))
            return 0 if ok else 1
        verify_inputs()
        if MODULES.exists() or CACHE.exists() or marker.exists():
            raise RuntimeError("Existing dependencies/cache/ownership: no overwrite or implicit retry")
        if shutil.disk_usage(ROOT).free < 4 * GIB:
            raise RuntimeError("Free disk is below reserved 4 GiB floor")
        npm = shutil.which("npm")
        if npm is None:
            raise RuntimeError("npm unavailable; no install attempted")
        started = time.monotonic()
        outer_deadline = started + 335
        marker.write_text(json.dumps({"owner": "SAMEDE6", "root": str(ROOT), "inputs": INPUTS}) + "\n")
        for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
            signal.signal(sig, interrupted)
        env = dict(os.environ, UV_THREADPOOL_SIZE="1", NODE_OPTIONS="--max-old-space-size=768", npm_config_jobs="1")
        command = [npm, "ci", "--ignore-scripts", "--no-audit", "--no-fund", "--cache", str(CACHE)]
        child = None
        passed = False
        reason = "setup"
        peak_rss = 0
        minimum_free = shutil.disk_usage(ROOT).free
        versions = {}
        released = True
        try:
            with (STATE / "npm-ci.log").open("xb") as output:
                child = subprocess.Popen(command, cwd=ROOT, env=env, stdout=output, stderr=subprocess.STDOUT,
                                         start_new_session=True, preexec_fn=limits)
                while True:
                    rss = sum(size for _pid, size in group_members(child.pid))
                    free = shutil.disk_usage(ROOT).free
                    peak_rss = max(peak_rss, rss)
                    minimum_free = min(minimum_free, free)
                    if STOP or rss > 2 * GIB or free < 4 * GIB or time.monotonic() - started >= 300:
                        reason = STOP or ("rss-limit" if rss > 2 * GIB else "disk-floor" if free < 4 * GIB else "timeout-300s")
                        break
                    if child.poll() is not None:
                        reason = f"npm-exit-{child.returncode}"
                        if child.returncode == 0:
                            verify_inputs()
                            versions = {name: json.loads((MODULES / name / "package.json").read_text())["version"] for name in EXPECTED}
                            passed = versions == EXPECTED
                            reason = "installed-identity-passed" if passed else "installed-identity-mismatch"
                        break
                    time.sleep(0.1)
        except Exception as error:
            reason = f"{type(error).__name__}: {error}"
        finally:
            if child is not None:
                released = stop_group(child, min(time.monotonic() + 5, outer_deadline - 30))
            passed = passed and released and STOP is None
            removed = cleanup([CACHE] if passed else [MODULES, CACHE], min(time.monotonic() + 30, outer_deadline))
            if not passed and removed:
                marker.unlink()
            receipt = {"phase": "DEPS_ONLY", "passed": passed and removed, "reason": reason,
                       "npm_returncode": child.returncode if child else None, "child_group_released": released,
                       "cleanup_passed": removed, "modules_retained": passed, "installed_versions": versions,
                       "elapsed_s": round(time.monotonic() - started, 3), "peak_group_rss_bytes": peak_rss,
                       "minimum_free_bytes": minimum_free, "inputs": INPUTS,
                       "limits": {"cpu": 0, "nice": 10, "uv_threads": 1, "heap_mib": 768, "npm_s": 300,
                                  "term_grace_s": 5, "cleanup_s": 30, "outer_s": 335,
                                  "rss_bytes": 2 * GIB, "free_floor_bytes": 4 * GIB}}
            (STATE / "deps-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
            print(json.dumps(receipt))
        return 0 if receipt["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
