#!/usr/bin/env python3
"""Prepared source only. Execute once only after a separate ddfc runtime admission.
Reuses the existing SAMEDE6 process-group/resource helper; never calls its installer
or cleanup functions. Product/reference code runs only in the single Node child.
"""
import argparse
import datetime
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import time

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
OWNER_ROOT = ROOT.parent.parent
OLD_STATE = OWNER_ROOT / ".oc-tmp/uncommitted-discard-runtime"
STATE = ROOT / ".oc-tmp/readonly-edit-red21-runtime"
GIB = 1024 ** 3
COMMAND = ["node", "--experimental-strip-types", "--test", "src/features/diff/readOnlyEditAffordance.test.ts"]
EXPECTED = {"react": "18.3.1", "react-test-renderer": "18.3.1", "typescript": "5.9.3", "@pierre/diffs": "1.6.4", "fuzzysort": "3.1.0"}


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def visible_node():
    found = []
    for path in Path("/proc").glob("[0-9]*/comm"):
        try:
            command = path.read_text().strip()
            if command in ("node", "nodejs", "npm", "npm exec", "npm run"):
                found.append({"pid": int(path.parent.name), "command": command})
        except OSError:
            pass
    return found


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execute-readonly-red21", action="store_true", required=True)
    args = parser.parse_args()
    admission = os.environ.get("READONLY_EDIT_ADMISSION")
    assert admission, "separate runtime admission identity is required"
    assert not STATE.is_symlink(), "phase state is a link"
    STATE.mkdir(parents=True, exist_ok=True)
    log = STATE / "red21.log"
    receipt = STATE / "red21-receipt.json"
    assert not log.exists() and not receipt.exists(), "no overwrite or automatic retry"
    result = {"author": "Conductor Rebuild", "phase": "READONLY_EDIT_RED21", "admission": admission, "actual_start_utc": now(), "node_started": False, "child_command": COMMAND}
    pinned = {}
    child = None
    helper = None
    child_started = None
    released = True
    peak = 0
    minimum = shutil.disk_usage(ROOT).free
    reason = "preflight"
    exit_code = 2
    with (OLD_STATE / "lease.lock").open("a") as lease:
        fcntl.flock(lease, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            assert 0 in os.sched_getaffinity(0), "CPU0 unavailable"
            assert minimum >= 4 * GIB, "free-disk floor"
            result["visible_own_node_before"] = visible_node()
            assert not result["visible_own_node_before"], "own Node/npm already running"
            assert os.environ.get("DIFF_READONLY_EDIT_REF") is None, "historical source override is forbidden"
            assert not subprocess.check_output(["git", "status", "--porcelain", "--untracked-files=no"], cwd=ROOT), "tracked tree is dirty"
            verified = subprocess.check_output([sys.executable, str(HERE / "verify-source-plan.py")], cwd=ROOT)
            result["source_preflight"] = json.loads(verified)
            assert result["source_preflight"]["static_checks"] == 65
            for name in result["source_preflight"]["source_pins"]:
                pinned[str(ROOT / name)] = (ROOT / name).read_bytes()
            for path in HERE.rglob("*"):
                if path.is_file():
                    pinned[str(path)] = path.read_bytes()
            fixture = ROOT / "src/features/diff/readOnlyEditAffordance.test.ts"
            pinned[str(fixture)] = fixture.read_bytes()
            assert sha(pinned[str(fixture)]) == "30d82d680f50250682ce5769e5047495417e95d5ce52ac15eacecbdc728c20a7"
            marker = OLD_STATE / "owns-node-modules.json"
            ownership = json.loads(marker.read_text())
            assert ownership["owner"] == "SAMEDE6" and ownership["root"] == str(OWNER_ROOT), "wrong dependency owner"
            modules = OWNER_ROOT / "node_modules"
            assert modules.is_dir() and not modules.is_symlink() and modules.resolve() == modules
            assert not os.path.lexists(ROOT / "node_modules"), "unexpected worktree dependencies override retained owner"
            assert not os.path.lexists(OLD_STATE / "npm-cache"), "owner cache unexpectedly present"
            pinned[str(marker)] = marker.read_bytes()
            lock = json.loads((ROOT / "package-lock.json").read_text())["packages"]
            installed_path = modules / ".package-lock.json"
            installed = json.loads(installed_path.read_text())["packages"]
            pinned[str(installed_path)] = installed_path.read_bytes()
            identities = []
            for name, version in EXPECTED.items():
                placement = modules / name
                assert placement.is_dir() and not placement.is_symlink() and placement.resolve() == placement
                manifest = placement / "package.json"
                actual = json.loads(manifest.read_text())
                key = "node_modules/" + name
                assert actual["version"] == lock[key]["version"] == installed[key]["version"] == version
                for field in ("resolved", "integrity"):
                    assert installed[key][field] == lock[key][field]
                pinned[str(manifest)] = manifest.read_bytes()
                identities.append({"name": name, "version": version, "version_resolution_sri_match": True, "placement": str(placement)})
            result["installed_identities"] = identities
            treatment = json.loads((OWNER_ROOT / "evidence/diff/uncommitted-discard-affordance/source-treatment.json").read_text())
            preserved = treatment["complete_red_input_comparison"]["records"]
            assert len(preserved) == 41
            for name, record in preserved.items():
                path = OWNER_ROOT / name
                data = path.read_bytes()
                assert sha(data) == record["after_sha256"] and len(data) == record["bytes"], "protected discard input drift: " + name
                pinned[str(path)] = data
            for path in (OWNER_ROOT / "evidence/diff/uncommitted-discard-affordance/runtime").rglob("*"):
                if path.is_file():
                    pinned[str(path)] = path.read_bytes()
            helper_path = OWNER_ROOT / ".oc-tmp/uncommitted-discard-provisioner/v3/deps-only.py"
            helper_bytes = helper_path.read_bytes()
            assert sha(helper_bytes) == "78861d873063538e9099e6a9c99bab9ea12fb90ba6d40e4b07c43443a5c8cb82" and len(helper_bytes) == 9232
            pinned[str(helper_path)] = helper_bytes
            spec = importlib.util.spec_from_file_location("same_de6_process_helpers", helper_path)
            helper = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(helper)
            assert helper.ROOT == OWNER_ROOT
            for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
                signal.signal(sig, helper.interrupted)
            node = shutil.which("node")
            assert node is not None and os.access(node, os.X_OK) and Path(node).read_bytes()[:4] == b"\x7fELF", "Node executable unavailable"
            result["node_executable"] = node
            result["baseline_head"] = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
            result["pre_input_hashes"] = {path: {"sha256": sha(data), "bytes": len(data)} for path, data in pinned.items()}
            env = dict(os.environ, UV_THREADPOOL_SIZE="1", NODE_OPTIONS="--max-old-space-size=768")
            child_started = time.monotonic()
            result["child_start_utc"] = now()
            with log.open("xb") as output:
                child = subprocess.Popen(COMMAND, cwd=ROOT, env=env, stdout=output, stderr=subprocess.STDOUT, start_new_session=True, preexec_fn=helper.limits)
                result["node_started"] = True
                result["child_pgid"] = child.pid
                while True:
                    rss = sum(size for _, size in helper.group_members(child.pid))
                    free = shutil.disk_usage(ROOT).free
                    peak = max(peak, rss)
                    minimum = min(minimum, free)
                    if helper.STOP or rss > 2 * GIB or free < 4 * GIB or log.stat().st_size > 1024 ** 2 or time.monotonic() - child_started >= 120:
                        reason = helper.STOP or ("rss-guard" if rss > 2 * GIB else "disk-floor" if free < 4 * GIB else "output-guard" if log.stat().st_size > 1024 ** 2 else "timeout-120s")
                        break
                    if child.poll() is not None:
                        reason = "child-exit"
                        break
                    time.sleep(0.1)
            result["child_end_utc"] = now()
        except Exception as error:
            reason = f"{type(error).__name__}: {error}"
            result["error"] = reason
        finally:
            if child is not None:
                try:
                    released = helper.stop_group(child, min(time.monotonic() + 5, child_started + 125))
                except Exception as error:
                    released = False
                    result["release_error"] = str(error)
                result["child_exit"] = child.returncode
                result["group_survivors"] = helper.group_members(child.pid)
                if reason == "child-exit" and released:
                    exit_code = child.returncode
            result["actual_release_utc"] = now()
            result["reason"] = reason
            result["released"] = released
            result["peak_sampled_group_rss_bytes"] = peak
            result["minimum_free_bytes"] = minimum
            result["post_input_drift"] = [path for path, data in pinned.items() if not Path(path).is_file() or Path(path).read_bytes() != data]
            result["visible_own_node_after"] = visible_node()
            result["limits"] = {"cpu": 0, "nice": 10, "UV_THREADPOOL_SIZE": 1, "heap_MiB_per_Node": 768, "child_s": 120, "release_grace_s": 5, "foreground_s": 130, "sample_s": 0.1, "sampled_group_rss_bytes": 2 * GIB, "free_floor_bytes": 4 * GIB, "sampled_output_bytes": 1024 ** 2, "not_kernel_quotas": True}
            result["classification"] = "NO_RUN" if not result["node_started"] else "UNCLASSIFIED_TAP_REQUIRED"
            result["cleanup_attempted"] = False
            result["modules_and_marker_retained"] = (OWNER_ROOT / "node_modules").is_dir() and (OLD_STATE / "owns-node-modules.json").is_file()
            result["cache_absent"] = not os.path.lexists(OLD_STATE / "npm-cache")
            if log.exists():
                data = log.read_bytes()
                result["raw_output"] = {"bytes": len(data), "sha256": sha(data), "path": str(log)}
            if result["post_input_drift"] or result["visible_own_node_after"] or not released:
                exit_code = 2
            receipt.write_text(json.dumps(result, indent=2) + "\n")
            print(json.dumps({key: value for key, value in result.items() if key not in ("pre_input_hashes", "source_preflight")}, indent=2))
            if log.exists():
                print(log.read_text())
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
