"""
Cloud-safe subprocess executor for CapabilityDispatchPlans.

``execute_capability_plan`` is the composition seam between the cloud-safe
broker (plan construction and result consumption) and native execution.  It
calls ``subprocess.run`` with the plan's argv, respects the plan's stdout/
stderr byte limits, measures wall-clock time, and returns a
``RawCapabilityOutput`` ready for ``consume_capability_output``.

Design boundary
---------------
* In cloud/CI tests ``plan.argv[0]`` is a synthetic fake runner whose
  filesystem path is set up by the test; the real runner is never referenced.
* In native use (E1 only) ``plan.argv[0]`` is the authenticated staged runner
  produced by ``stage_retained_bundle``.  E1 is the sole caller in that case.
* This module performs real subprocess I/O; it is therefore **not** safe to
  import-time-execute in sandboxed environments where subprocess creation is
  blocked.  Import is safe; calling ``execute_capability_plan`` is not, in
  such environments.

Overflow policy
---------------
If the child writes more than ``plan.stdout_limit`` or ``plan.stderr_limit``
bytes, ``execute_capability_plan`` raises ``OutputOverflowError``.  Silently
truncating would let overflow go unreported to ``consume_capability_output``;
overflow is always the caller's error.

Timeout policy
--------------
If the child is still running after ``plan.max_wall_seconds`` seconds,
``execute_capability_plan`` raises ``RunnerTimeoutError`` (a subclass of
``OSError``) and kills the child with SIGKILL.
"""

from __future__ import annotations

import subprocess
import time

from tools import native_qa_vm_broker as broker


# ---------------------------------------------------------------------------
# Public exceptions.

class OutputOverflowError(ValueError):
    """Child wrote more bytes than the plan's stdout_limit or stderr_limit."""

    def __init__(self, stream: str, limit: int, actual: int) -> None:
        self.stream = stream
        self.limit = limit
        self.actual = actual
        super().__init__(
            f"{stream} exceeded limit ({actual} > {limit} bytes)"
        )


class RunnerTimeoutError(OSError):
    """Child did not exit within plan.max_wall_seconds."""

    def __init__(self, wall_seconds: float, limit: float) -> None:
        self.wall_seconds = wall_seconds
        self.limit = limit
        super().__init__(
            f"runner did not exit within {limit}s (elapsed {wall_seconds:.3f}s)"
        )


# ---------------------------------------------------------------------------
# Public function.

def execute_capability_plan(
    plan: broker.DispatchPlan,
) -> broker.RawCapabilityOutput:
    """Run the subprocess described by *plan* and return its raw output.

    The child is called with ``subprocess.run`` using its exact ``plan.argv``
    tuple.  stdout and stderr are captured in memory.  The call blocks until
    the child exits or ``plan.max_wall_seconds`` elapses.

    Raises
    ------
    TypeError
        If *plan* is not a ``DispatchPlan``.
    OutputOverflowError
        If the child writes more bytes than ``plan.stdout_limit`` or
        ``plan.stderr_limit``.
    RunnerTimeoutError
        If the child does not exit within ``plan.max_wall_seconds`` seconds.
    OSError
        On other OS-level failures (e.g. executable not found).
    """
    if not isinstance(plan, broker.DispatchPlan):
        raise TypeError("plan must be a DispatchPlan")

    t_start = time.monotonic()
    try:
        result = subprocess.run(
            list(plan.argv),
            capture_output=True,
            timeout=plan.max_wall_seconds,
        )
    except subprocess.TimeoutExpired as exc:
        wall = time.monotonic() - t_start
        raise RunnerTimeoutError(wall, plan.max_wall_seconds) from exc

    wall_seconds = time.monotonic() - t_start

    # Enforce byte limits after the fact: subprocess.run collects all output
    # before we can check; overflow raises rather than silently truncating.
    stdout = result.stdout
    stderr = result.stderr
    if len(stdout) > plan.stdout_limit:
        raise OutputOverflowError("stdout", plan.stdout_limit, len(stdout))
    if len(stderr) > plan.stderr_limit:
        raise OutputOverflowError("stderr", plan.stderr_limit, len(stderr))

    return broker.RawCapabilityOutput(
        exit_code=result.returncode,
        stdout=stdout,
        stderr=stderr,
        wall_seconds=wall_seconds,
    )
