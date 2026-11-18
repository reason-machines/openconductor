#!/usr/bin/env python3
"""Inert explicit-href GREEN20-only supervisor. A separate serialized ledger grant is required."""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import signal
import socket
import subprocess
import time

ROOT = Path(__file__).resolve().parent
PRIMARY = ROOT.parent / "plan-result-links"
RUNTIME = PRIMARY / "runtime"
CHECKOUT = ROOT.parents[2]
PRODUCT = ROOT / "product"
REQUEST_SHA256 = "53b34e11c09c9296d236565b24252d0a66f78a6e1fe158a1003fc6e0ccf29bd3"
GIB = 2**30
WORKLOADS = {"node", "npm", "tsc", "vite", "rustc", "cargo", "chrome", "chromium"}

def utc():
    return dt.datetime.now(dt.timezone.utc)

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def processes(group=None):
    found = []
    for proc in Path("/proc").iterdir():
        if not proc.name.isdigit():
            continue
        try:
            name = (proc / "comm").read_text().strip()
            fields = (proc / "stat").read_text().rsplit(")", 1)[1].split()
            pgid = int(fields[2])
            if (group is None and name in WORKLOADS) or pgid == group:
                found.append({"pid": int(proc.name), "name": name, "pgrp": pgid})
        except (FileNotFoundError, ProcessLookupError, PermissionError):
            continue
    return found

def pins(request, deps, treated):
    assert digest(ROOT / "green-request.json") == REQUEST_SHA256
    assert digest(ROOT / "frozen-red-request.json") == request["original_request_sha256"]
    for item in request["protected_original_files"]:
        path = ROOT / item["path"]
        assert path.stat().st_size == item["bytes"] and digest(path) == item["sha256"], "Original evidence drift: " + item["path"]
    for item in request["reference_assets"]:
        path = Path(item["path"])
        assert path.stat().st_size == item["bytes"] and digest(path) == item["sha256"], "Reference asset drift: " + item["name"]
    for key in ("binding", "treatment_source_receipt"):
        item = request[key]
        assert digest(ROOT / item["path"]) == item["sha256"], "Source binding drift: " + key
    assert digest(PRIMARY / "deps-result.json") == request["dependency_receipt_sha256"]
    runtime_pins = request["pins"] if treated else request["baseline_runtime_pins"]
    for item in runtime_pins:
        path = RUNTIME / item["path"]
        assert path.stat().st_size == item["bytes"] and digest(path) == item["sha256"], "Runtime drift: " + item["path"]
    for item in request["current_context_pins"]:
        data = subprocess.check_output(["git", "-c", "gc.auto=0", "show", "origin/main:" + item["path"]], cwd=CHECKOUT)
        assert len(data) == item["bytes"] and hashlib.sha256(data).hexdigest() == item["sha256"], "Main source drift: " + item["path"]
    head = subprocess.check_output(["git", "-c", "gc.auto=0", "rev-parse", "HEAD"], cwd=PRODUCT).decode().strip()
    assert head == request["committed_source"], "Product commit drift"
    assert not subprocess.check_output(["git", "-c", "gc.auto=0", "status", "--porcelain"], cwd=PRODUCT).strip(), "Product worktree drift"
    for item in request["committed_context_pins"] + [request["fixture"]]:
        path = PRODUCT / item["path"]
        assert path.stat().st_size == item["bytes"] and digest(path) == item["sha256"], "Product context drift: " + item["path"]
        data = subprocess.check_output(["git", "-c", "gc.auto=0", "show", request["committed_source"] + ":" + item["path"]], cwd=CHECKOUT)
        assert len(data) == item["bytes"] and hashlib.sha256(data).hexdigest() == item["sha256"], "Committed source drift: " + item["path"]
    for name, item in deps["installed"].items():
        path = RUNTIME / "node_modules" / name / "package.json"
        assert digest(path) == item["manifest_sha256"], "Dependency drift: " + name
        identity = json.loads(path.read_text())
        assert identity["name"] == name and identity["version"] == item["expected"]

def stop(proc):
    if proc is None:
        return
    try:
        os.killpg(proc.pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline and processes(proc.pid):
        time.sleep(0.1)
    if processes(proc.pid):
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    proc.wait(timeout=5)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--admission-id", required=True)
    parser.add_argument("--request-sha256", required=True)
    parser.add_argument("--created", required=True)
    parser.add_argument("--expires", required=True)
    args = parser.parse_args()
    assert args.request_sha256 == REQUEST_SHA256, "Frozen GREEN request required"
    created = dt.datetime.fromisoformat(args.created.replace("Z", "+00:00"))
    expires = dt.datetime.fromisoformat(args.expires.replace("Z", "+00:00"))
    assert args.admission_id.startswith("EXPLICIT-WORKSPACE-HREF-BE7-GREEN-")
    assert created.tzinfo is not None and expires.tzinfo is not None
    assert created <= utc() < created + dt.timedelta(minutes=2)
    assert utc() + dt.timedelta(seconds=95) <= expires
    assert not (ROOT / "green-result.json").exists() and not (ROOT / "green-output.tap").exists(), "No retry/self-extension"
    assert expires == created + dt.timedelta(seconds=125), "No grant extension"
    assert os.getpriority(os.PRIO_PROCESS, 0) == 10 and os.environ.get("UV_THREADPOOL_SIZE") == "1", "Outer nice10/UV1 required"
    assert not processes(), "Own runtime workload already active"
    assert 0 in os.sched_getaffinity(0), "CPU0 unavailable"
    assert shutil.disk_usage(ROOT).free >= 4 * GIB
    request = json.loads((ROOT / "green-request.json").read_text())
    deps = json.loads((PRIMARY / "deps-result.json").read_text())
    assert deps["exit_code"] == 0 and deps["no_survivors"] and deps["retained_pinned_deps"]
    pins(request, deps, treated=False)
    # Only these two already-reviewed committed candidates, after every gate.
    for item in request["candidates"]:
        target = RUNTIME / item["product_path"]
        target.write_bytes((PRODUCT / item["product_path"]).read_bytes())
    pins(request, deps, treated=True)
    command = shlex.split(request["command"])
    report = dict(admission_id=args.admission_id, created=args.created, expires=args.expires,
        start_gate_utc=utc().isoformat(), host=socket.gethostname(), command=command,
        frozen_request_sha256=REQUEST_SHA256, fixture_sha256=request["fixture"]["sha256"],
        original_red_request_sha256=request["original_request_sha256"], committed_source=request["committed_source"],
        actual_current_main=subprocess.check_output(["git", "-c", "gc.auto=0", "rev-parse", "origin/main"], cwd=CHECKOUT).decode().strip(),
        frozen_pins_before=len(request["pins"]), dependency_manifest_pins_before=len(deps["installed"]),
        free_bytes_before=shutil.disk_usage(ROOT).free, processes_before=processes(), rss_measured=False,
        RSS="Not measured; 768MiB per-Node heap is not an aggregate RSS ceiling",
        capability_gate="Only frozen fixture built-in TS transpile diagnostics; no separate probe")
    proc = None
    interrupted = []
    handlers = {}
    for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
        handlers[sig] = signal.signal(sig, lambda number, frame: interrupted.append(number))
    stop_reason = None
    minimum_free = report["free_bytes_before"]
    started = time.monotonic()
    try:
        output = ROOT / "green-output.tap"
        with output.open("xb") as log:
            proc = subprocess.Popen(command, cwd=RUNTIME, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
            report["owned_pgid"] = proc.pid
            report["test_start_utc"] = utc().isoformat()
            while proc.poll() is None:
                free = shutil.disk_usage(ROOT).free
                minimum_free = min(minimum_free, free)
                if interrupted:
                    stop_reason = "signal " + str(interrupted[0])
                elif free < 4 * GIB:
                    stop_reason = "free disk below 4GiB"
                elif output.stat().st_size > 16 * 2**20:
                    stop_reason = "output exceeded 16MiB"
                elif time.monotonic() - started >= 65:
                    stop_reason = "foreground cleanup boundary"
                elif utc() >= expires - dt.timedelta(seconds=30):
                    stop_reason = "grant cleanup deadline"
                if stop_reason:
                    stop(proc)
                    break
                time.sleep(0.1)
            report["exit_code"] = proc.wait(timeout=5)
            report["child_reaped"] = proc.returncode is not None
        report["test_end_utc"] = utc().isoformat()
        report["stop_reason"] = stop_reason
        raw = output.read_text(errors="replace")
        report["tap_summary"] = {name: int(value) for name, value in re.findall(r"^# (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)\s*$", raw, re.MULTILINE)}
        report["semantic_marker_occurrences"] = raw.count("EXPLICIT_WORKSPACE_HREF_MUST_USE_FILE_NAVIGATION") + raw.count("EXPLICIT_FILE_HREF_MUST_NOT_FALL_BACK_TO_EXTERNAL")
        report["output_bytes"] = output.stat().st_size
        report["output_sha256"] = digest(output)
        counters = report["tap_summary"]
        report["green_pass_observed"] = (report["exit_code"] == 0 and not stop_reason
            and counters.get("tests") == 20 and counters.get("pass") == 20 and counters.get("fail") == 0
            and counters.get("cancelled") == 0 and counters.get("skipped") == 0 and counters.get("todo") == 0
)
        pins(request, deps, treated=True)
        report["frozen_inputs_after"] = True
    except BaseException as error:
        report["failure"] = type(error).__name__ + ": " + str(error)
        stop(proc)
    finally:
        if proc is not None and processes(proc.pid):
            stop(proc)
        report["processes_after"] = processes()
        report["owned_group_survivors"] = processes(proc.pid) if proc else []
        report["no_survivors"] = not report["processes_after"] and not report["owned_group_survivors"]
        report["minimum_observed_free_bytes"] = minimum_free
        report["free_bytes_after"] = shutil.disk_usage(ROOT).free
        report["private_deps_retained_for_separate_admission"] = (RUNTIME / "node_modules").is_dir()
        report["actual_release_utc"] = utc().isoformat()
        report["released_before_expiry"] = utc() < expires
        for sig, handler in handlers.items():
            signal.signal(sig, handler)
        (ROOT / "green-result.json").write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(report, indent=2))
        if (ROOT / "green-output.tap").is_file():
            print((ROOT / "green-output.tap").read_text(errors="replace"))
    return 0 if report.get("green_pass_observed") and report["no_survivors"] and report.get("frozen_inputs_after") and report["released_before_expiry"] else 1

if __name__ == "__main__":
    raise SystemExit(main())
