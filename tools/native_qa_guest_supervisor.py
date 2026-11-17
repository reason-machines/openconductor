"""Finite, foreground command automation for a separately admitted guest.

This is a guest-local source prerequisite, NOT a VM launcher or admission path.
No provisioning, transport, native API, credentials, shell or persistent handle
is supplied. The caller must independently establish guest location/authority
and approve every argv before using this in a real guest. Current Runner.m still
exits 78; its closed profile has no guest-agent/result channel.

One awaited call executes at most 16 ordered steps under a shared 30s maximum
execution deadline, followed by at most 1.2s of teardown for the active step.
I/O is drained concurrently with live per-stream byte caps. Failure, deadline,
SIGINT/SIGTERM (CLI) or cancellation stops the sequence. Each step gets a fresh
POSIX process group, closed inherited FDs, empty stdin and a minimal environment.
TERM then KILL targets only that owned group; the direct child is reaped before
success is reported. Missing group/pipe/reap confirmation fails closed.

Process groups are NOT a security boundary: setsid/double-fork descendants can
escape, SIGKILL of this supervisor cannot emit a receipt, and OS process creation
or uninterruptible I/O cannot be given a Python-enforced hard wall bound. Receipts
record observed command/group state only, never VM shutdown, complete process
ancestry, authenticated acceptance, native isolation or host write prevention.
Output hashes cover only bytes observed (at most cap+1), not a full stream after
interruption/overflow; raw output and argv are not logged. No guest-generated
receipt can unlock the existing fail-closed native gates.

CLI (only inside a separately admitted guest, or with synthetic test commands):
  python3 -B -m tools.native_qa_guest_supervisor --plan <reviewed-plan.json>
The strict schema-1 document has cwd, steps [{name, argv}], max_wall_seconds and
output_limit_bytes. It returns one JSON terminal receipt, exit 0 only for command
completion, 1 for other terminal outcomes, 2 for an invalid plan. Expected OS
observation/cleanup errors emit supervision_failed with step_receipts_complete
false and no inferred step/cleanup facts; the library still raises those errors.
An unavailable receipt stdout, SIGKILL or unknown programming error cannot promise
a JSON receipt. This is not an acceptance certificate. No ownership survives the
foreground invocation.
"""
from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass, field
import hashlib
import json
import math
import os
import re
import selectors
import signal
import subprocess
import threading
import time

MAX_PLAN_BYTES = 65536
MAX_OUTPUT_BYTES = 65536
MAX_STEPS = 16
MAX_WALL_SECONDS = 30
_TERM_GRACE = .2
_REAP_GRACE = 1.0
_POLL = .02


@dataclass(frozen=True)
class GuestStep:
    name: str
    argv: tuple[str, ...]

    def __post_init__(self):
        if not isinstance(self.name, str) or not re.fullmatch(r"[a-z][a-z0-9_-]{0,63}", self.name):
            raise ValueError("invalid step name")
        if (type(self.argv) is not tuple or not 1 <= len(self.argv) <= 64
                or any(not isinstance(a, str) or not a or len(a) > 4096 or "\0" in a for a in self.argv)
                or not os.path.isabs(self.argv[0])):
            raise ValueError("argv requires a bounded tuple and absolute executable")


@dataclass(frozen=True)
class GuestPlan:
    steps: tuple[GuestStep, ...]
    cwd: str
    max_wall_seconds: float = MAX_WALL_SECONDS
    output_limit_bytes: int = MAX_OUTPUT_BYTES

    def __post_init__(self):
        if (type(self.steps) is not tuple or not 1 <= len(self.steps) <= MAX_STEPS
                or any(type(s) is not GuestStep for s in self.steps)
                or len({s.name for s in self.steps}) != len(self.steps)):
            raise ValueError("one to sixteen uniquely named steps required")
        if (not isinstance(self.cwd, str) or not os.path.isabs(self.cwd)
                or "\0" in self.cwd or len(self.cwd) > 4096):
            raise ValueError("absolute working directory required")
        if (type(self.max_wall_seconds) not in (int, float)
                or not math.isfinite(self.max_wall_seconds)
                or not 0 < self.max_wall_seconds <= MAX_WALL_SECONDS):
            raise ValueError("execution deadline must be finite and in (0, 30]")
        if type(self.output_limit_bytes) is not int or not 0 < self.output_limit_bytes <= MAX_OUTPUT_BYTES:
            raise ValueError("invalid output cap")


@dataclass(frozen=True)
class StepReceipt:
    name: str
    outcome: str
    exit_code: int | None
    stdout_bytes: int
    stderr_bytes: int
    stdout_sha256: str
    stderr_sha256: str
    signals_sent: tuple[str, ...]
    leader_reaped: bool
    process_group_absent: bool
    streams_eof: bool


@dataclass(frozen=True)
class SupervisorReceipt:
    outcome: str
    plan_sha256: str
    steps: tuple[StepReceipt, ...]
    wall_seconds: float
    commands_passed: bool
    step_receipts_complete: bool = True
    native_admission: bool = field(default=False, init=False)
    host_filesystem_coverage_verified: bool = field(default=False, init=False)
    guest_location_verified: bool = field(default=False, init=False)
    vm_stopped_verified: bool = field(default=False, init=False)
    process_tree_verified: bool = field(default=False, init=False)


def _group_exists(pid):
    try:
        os.killpg(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


def _signal_group(pid, sig, sent):
    try:
        os.killpg(pid, sig)
        sent.append(sig.name)
    except ProcessLookupError:
        pass


class _Output:
    def __init__(self, process, limit):
        self.selector = selectors.DefaultSelector()
        self.limit = limit
        self.counts = [0, 0]
        self.digests = [hashlib.sha256(), hashlib.sha256()]
        self.overflow = False
        for index, stream in enumerate((process.stdout, process.stderr)):
            os.set_blocking(stream.fileno(), False)
            self.selector.register(stream, selectors.EVENT_READ, index)

    def drain(self, timeout):
        for key, _ in self.selector.select(timeout):
            index = key.data
            # After overflow, continue draining/discarding without retaining or
            # hashing more bytes, so teardown cannot deadlock on a full pipe.
            remaining = self.limit + 1 - self.counts[index]
            size = min(8192, remaining) if remaining > 0 else 8192
            try:
                data = os.read(key.fd, size)
            except BlockingIOError:
                continue
            if not data:
                self.selector.unregister(key.fileobj)
                key.fileobj.close()
                continue
            remaining = self.limit + 1 - self.counts[index]
            observed = data[:max(0, remaining)]
            self.counts[index] += len(observed)
            self.digests[index].update(observed)
            self.overflow |= self.counts[index] > self.limit

    @property
    def eof(self):
        return not self.selector.get_map()

    def close(self):
        for key in list(self.selector.get_map().values()):
            key.fileobj.close()
        self.selector.close()


def _teardown(process, output, sent):
    """Bounded best effort, including on ordinary exit (background children)."""
    process.poll()  # Reap an already exited leader before checking the group.
    if _group_exists(process.pid):
        _signal_group(process.pid, signal.SIGTERM, sent)
    start = time.monotonic()
    kill_at, end = start + _TERM_GRACE, start + _TERM_GRACE + _REAP_GRACE
    killed = False
    while True:
        process.poll()
        absent = not _group_exists(process.pid)
        if process.returncode is not None and absent and output.eof:
            return True
        now = time.monotonic()
        if now >= kill_at and not killed:
            if not absent:
                _signal_group(process.pid, signal.SIGKILL, sent)
            killed = True
        if now >= end:
            return False
        output.drain(min(_POLL, end - now))


def _run_step(step, plan, deadline, cancel):
    empty = hashlib.sha256(b"").hexdigest()
    try:
        process = subprocess.Popen(
            step.argv, cwd=plan.cwd, env={"LANG": "C", "LC_ALL": "C"},
            stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            close_fds=True, start_new_session=True, shell=False,
        )
    except OSError:
        return StepReceipt(step.name, "start_failed", None, 0, 0, empty, empty, (), False, True, True)

    output = None
    sent = []
    teardown_attempted = False
    teardown_finished = False
    try:
        output = _Output(process, plan.output_limit_bytes)
        while True:
            if cancel.is_set():
                outcome = "cancelled"
                break
            if time.monotonic() >= deadline:
                outcome = "timed_out"
                break
            output.drain(min(_POLL, max(0, deadline - time.monotonic())))
            if output.overflow:
                outcome = "output_overflow"
                break
            if process.poll() is not None:
                outcome = "completed" if process.returncode == 0 else "failed"
                # Background group members are not an accepted completed step.
                if _group_exists(process.pid):
                    outcome = "lingering_process_group"
                break
        teardown_attempted = True
        cleaned = _teardown(process, output, sent)
        teardown_finished = True
        if not cleaned:
            outcome = "cleanup_incomplete"
        elif output.overflow:
            outcome = "output_overflow"
        return StepReceipt(
            step.name, outcome, process.returncode, *output.counts,
            *(d.hexdigest() for d in output.digests), tuple(sent),
            process.returncode is not None, not _group_exists(process.pid), output.eof,
        )
    finally:
        # Unexpected Python errors must not intentionally leave the owned group.
        try:
            if output is not None and not teardown_attempted:
                try:
                    _teardown(process, output, sent)
                    teardown_finished = True
                except BaseException:
                    # Broken output observation must not prevent forced stop.
                    _signal_group(process.pid, signal.SIGKILL, sent)
                    process.wait(timeout=_REAP_GRACE)
                    raise
            elif not teardown_finished:
                _signal_group(process.pid, signal.SIGKILL, sent)
                process.wait(timeout=_REAP_GRACE)
        finally:
            if output is not None:
                output.close()
            process.stdout.close()
            process.stderr.close()


def _plan_sha256(plan):
    # Self-consistency only, not guest identity, authority or acceptance.
    plan_bytes = json.dumps(asdict(plan), sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(plan_bytes).hexdigest()


def supervise(plan: GuestPlan, *, cancel: threading.Event | None = None) -> SupervisorReceipt:
    """Await the entire finite sequence and teardown; return no live handle.

    POSIX only. The library caller owns cancellation; the CLI maps SIGINT/TERM
    to it. No production/native caller is wired to this source prerequisite.
    """
    if type(plan) is not GuestPlan:
        raise TypeError("GuestPlan required")
    if cancel is not None and not isinstance(cancel, threading.Event):
        raise TypeError("threading.Event required")
    cancel = cancel if cancel is not None else threading.Event()
    start = time.monotonic()
    deadline = start + plan.max_wall_seconds
    steps = []
    outcome = "completed"
    for step in plan.steps:
        if cancel.is_set() or time.monotonic() >= deadline:
            outcome = "cancelled" if cancel.is_set() else "timed_out"
            break
        receipt = _run_step(step, plan, deadline, cancel)
        steps.append(receipt)
        outcome = receipt.outcome
        if outcome != "completed":
            break
    # Cancellation/deadline during the last teardown must not become success.
    if outcome == "completed":
        if cancel.is_set():
            outcome = "cancelled"
        elif time.monotonic() >= deadline:
            outcome = "timed_out"
    return SupervisorReceipt(
        outcome, _plan_sha256(plan), tuple(steps),
        time.monotonic() - start, outcome == "completed",
    )


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate JSON key")
        result[key] = value
    return result


def parse_plan(raw: bytes) -> GuestPlan:
    """Reject extra/duplicate keys, unbounded inputs and authority claims."""
    if not isinstance(raw, bytes) or not 0 < len(raw) <= MAX_PLAN_BYTES:
        raise ValueError("invalid plan size")
    try:
        doc = json.loads(raw, object_pairs_hook=_unique_object)
        if (type(doc) is not dict or set(doc) != {
                "schema", "cwd", "steps", "max_wall_seconds", "output_limit_bytes"}
                or type(doc["schema"]) is not int or doc["schema"] != 1
                or type(doc["steps"]) is not list):
            raise ValueError("invalid schema")
        steps = []
        for item in doc["steps"]:
            if type(item) is not dict or set(item) != {"name", "argv"} or type(item["argv"]) is not list:
                raise ValueError("invalid step")
            steps.append(GuestStep(item["name"], tuple(item["argv"])))
        return GuestPlan(tuple(steps), doc["cwd"], doc["max_wall_seconds"], doc["output_limit_bytes"])
    except (ValueError, TypeError, RecursionError, KeyError):
        raise ValueError("invalid guest command plan") from None


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", required=True)
    args = parser.parse_args(argv)
    try:
        with open(args.plan, "rb") as source:
            plan = parse_plan(source.read(MAX_PLAN_BYTES + 1))
    except (OSError, ValueError):
        parser.exit(2, "invalid guest command plan\n")
    cancel = threading.Event()
    previous = {}
    try:
        for sig in (signal.SIGINT, signal.SIGTERM):
            previous[sig] = signal.signal(sig, lambda _sig, _frame: cancel.set())
        start = time.monotonic()
        try:
            receipt = supervise(plan, cancel=cancel)
        except (OSError, subprocess.TimeoutExpired):
            # _run_step has attempted cleanup, not necessarily confirmed it.
            # No exception text/argv or invented start/reap/EOF facts escape.
            receipt = SupervisorReceipt(
                "supervision_failed", _plan_sha256(plan), (),
                time.monotonic() - start, False, step_receipts_complete=False,
            )
        print(json.dumps(asdict(receipt), sort_keys=True), flush=True)
        return 0 if receipt.commands_passed else 1
    finally:
        for sig, handler in previous.items():
            signal.signal(sig, handler)


if __name__ == "__main__":
    raise SystemExit(main())
