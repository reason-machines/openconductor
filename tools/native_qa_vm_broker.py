"""Authenticated capability dispatch broker. Validates plans; never executes.

The broker sits between an authenticated StagedBundle and E1's native executor.
It accepts a CapabilitySpec (what to run), validates it is in scope, and returns
a DispatchPlan — a frozen, inspectable description of exactly what should be run,
with what deadline and under what constraints.

E1 runs the executable according to the plan and passes back a RawCapabilityOutput;
consume_capability_output in this module converts it to a structured CapabilityResult.

Cloud-safe: plan_capability_dispatch and consume_capability_output never execute
subprocesses, never access the network, and touch no native resources.
"""
import dataclasses
from dataclasses import dataclass, field
from enum import Enum
import hashlib
from typing import Optional

from tools import native_qa_vm_staging as staging
from tools import native_qa_vm_alloc as alloc

# ---------------------------------------------------------------------------
# Bounded I/O limits for the runner process.

MAX_STDOUT_BYTES = 256 * 1024          # 256 KiB — runner status output only
MAX_STDERR_BYTES = 256 * 1024          # 256 KiB — diagnostics
MAX_WALL_SECONDS = 30.0                # hard deadline; callers may use less
MIN_WALL_SECONDS = 0.0                 # sanity floor (> 0 required)

# Exit code emitted by the runner's current stub ("resource identity … not implemented").
EXIT_NOT_YET_IMPLEMENTED = 78

# Exact stderr prefix the runner stub emits.  Checked by the result consumer.
_NOT_YET_IMPL_MARKER = (
    b"VM execution is unavailable: resource identity, inherited-capability, "
    b"effective-profile and lifecycle acceptance are not implemented."
)


# ---------------------------------------------------------------------------
# Public API surface.

class CapabilitySpec(Enum):
    """The single admitted capability.

    PROBE — invoke the runner with no arguments to read its exit code and
    version-line or diagnostic output.  Corresponds to the current stub
    (exits 78) and to a future ``--probe`` or zero-argument health check.
    No flags, no extra arguments, no I/O redirection, no host-share paths.
    """
    PROBE = "probe"


@dataclass(frozen=True)
class DispatchPlan:
    """Validated, immutable description of one admitted runner invocation.

    Fields
    ------
    source_commit   : 40-hex source identity from the staged bundle.
    build_id        : build identity from the staged bundle.
    executable_sha256 : SHA-256 of the staged executable (rechecked at staging).
    argv            : exact tuple[str, ...] to pass to the OS, verbatim.
    capability      : the CapabilitySpec that produced this plan.
    max_wall_seconds: upper deadline for the caller (> 0, ≤ MAX_WALL_SECONDS).
    stdout_limit    : caller's byte cap for stdout (≤ MAX_STDOUT_BYTES).
    stderr_limit    : caller's byte cap for stderr (≤ MAX_STDERR_BYTES).

    This token does not constitute execution authority.  E1 must still satisfy
    any additional native admission requirements before invoking argv.
    """
    source_commit: str
    build_id: str
    executable_sha256: str
    argv: tuple
    capability: CapabilitySpec
    max_wall_seconds: float
    stdout_limit: int
    stderr_limit: int
    allocation: Optional[alloc.GuestAllocation] = field(default=None)

    def __post_init__(self):
        if not (isinstance(self.source_commit, str) and len(self.source_commit) == 40
                and all(c in "0123456789abcdef" for c in self.source_commit)):
            raise ValueError("source_commit must be a 40-hex string")
        if not (isinstance(self.build_id, str) and self.build_id):
            raise ValueError("build_id must be a non-empty string")
        if not (isinstance(self.executable_sha256, str) and len(self.executable_sha256) == 64
                and all(c in "0123456789abcdef" for c in self.executable_sha256)):
            raise ValueError("executable_sha256 must be a 64-hex string")
        if not (isinstance(self.argv, tuple) and len(self.argv) >= 1
                and all(isinstance(a, str) for a in self.argv)):
            raise ValueError("argv must be a non-empty tuple of strings")
        if not isinstance(self.capability, CapabilitySpec):
            raise ValueError("capability must be a CapabilitySpec")
        if not (isinstance(self.max_wall_seconds, (int, float))
                and MIN_WALL_SECONDS < self.max_wall_seconds <= MAX_WALL_SECONDS):
            raise ValueError(
                f"max_wall_seconds must be in ({MIN_WALL_SECONDS}, {MAX_WALL_SECONDS}]"
            )
        if not (isinstance(self.stdout_limit, int)
                and 0 < self.stdout_limit <= MAX_STDOUT_BYTES):
            raise ValueError(f"stdout_limit must be in (0, {MAX_STDOUT_BYTES}]")
        if not (isinstance(self.stderr_limit, int)
                and 0 < self.stderr_limit <= MAX_STDERR_BYTES):
            raise ValueError(f"stderr_limit must be in (0, {MAX_STDERR_BYTES}]")
        if self.allocation is not None and not isinstance(self.allocation, alloc.GuestAllocation):
            raise TypeError("allocation must be a GuestAllocation or None")


class CapabilityOutcome(Enum):
    """Classification of a runner invocation's outcome."""
    # Runner exited 0 — capability succeeded (future, once the stub is replaced).
    SUCCESS = "success"
    # Runner exited 78 with the expected stub diagnostic — admitted but not yet implemented.
    NOT_YET_IMPLEMENTED = "not_yet_implemented"
    # Runner exited non-zero for any other reason (native error, configuration fault, etc.).
    FAILURE = "failure"


@dataclass(frozen=True)
class CapabilityResult:
    """Structured, bounded record of one runner invocation's terminal state.

    E1 populates a RawCapabilityOutput and passes it to consume_capability_output;
    that function validates bounds and classifies the outcome, returning this token.

    Fields
    ------
    plan            : the DispatchPlan this result was consumed from.
    exit_code       : observed exit code (0–255).
    stdout          : bounded stdout bytes (≤ plan.stdout_limit).
    stderr          : bounded stderr bytes (≤ plan.stderr_limit).
    wall_seconds    : elapsed time reported by E1 (> 0, ≤ plan.max_wall_seconds).
    outcome         : classified CapabilityOutcome.
    stdout_sha256   : SHA-256 hex of stdout (for compact logging without storing the bytes).
    stderr_sha256   : SHA-256 hex of stderr.
    not_yet_impl_marker_present : True iff stderr starts with the stub diagnostic prefix.
    """
    plan: DispatchPlan
    exit_code: int
    stdout: bytes
    stderr: bytes
    wall_seconds: float
    outcome: CapabilityOutcome
    stdout_sha256: str
    stderr_sha256: str
    not_yet_impl_marker_present: bool


# ---------------------------------------------------------------------------
# Public functions.

def plan_capability_dispatch(
    bundle: staging.StagedBundle,
    capability: CapabilitySpec,
    *,
    max_wall_seconds: float = MAX_WALL_SECONDS,
    stdout_limit: int = MAX_STDOUT_BYTES,
    stderr_limit: int = MAX_STDERR_BYTES,
) -> DispatchPlan:
    """Validate a capability request against the authenticated bundle and return a plan.

    The bundle must be a StagedBundle (produced by stage_retained_bundle); no
    filesystem access is performed beyond reading the already-staged attributes.
    No subprocess is started.

    Raises TypeError for wrong argument types.
    Raises ValueError for out-of-range parameters.
    """
    if not isinstance(bundle, staging.StagedBundle):
        raise TypeError("bundle must be a StagedBundle")
    if not isinstance(capability, CapabilitySpec):
        raise TypeError("capability must be a CapabilitySpec")

    # Range-check caller-supplied limits before the plan is constructed.
    if not (isinstance(max_wall_seconds, (int, float))
            and MIN_WALL_SECONDS < max_wall_seconds <= MAX_WALL_SECONDS):
        raise ValueError(
            f"max_wall_seconds must be in ({MIN_WALL_SECONDS}, {MAX_WALL_SECONDS}]"
        )
    if not (isinstance(stdout_limit, int) and 0 < stdout_limit <= MAX_STDOUT_BYTES):
        raise ValueError(f"stdout_limit must be in (0, {MAX_STDOUT_BYTES}]")
    if not (isinstance(stderr_limit, int) and 0 < stderr_limit <= MAX_STDERR_BYTES):
        raise ValueError(f"stderr_limit must be in (0, {MAX_STDERR_BYTES}]")

    # PROBE: no extra arguments; the runner is invoked with its own path only.
    if capability is CapabilitySpec.PROBE:
        argv = staging.compose_invocation(bundle)
    else:
        raise ValueError(f"unrecognised capability: {capability!r}")

    return DispatchPlan(
        source_commit=bundle.source_commit,
        build_id=bundle.build_id,
        executable_sha256=bundle.executable_sha256,
        argv=argv,
        capability=capability,
        max_wall_seconds=float(max_wall_seconds),
        stdout_limit=stdout_limit,
        stderr_limit=stderr_limit,
    )


def plan_capability_dispatch_with_allocation(
    bundle: staging.StagedBundle,
    capability: CapabilitySpec,
    guest_allocation: alloc.GuestAllocation,
    *,
    max_wall_seconds: float = MAX_WALL_SECONDS,
    stdout_limit: int = MAX_STDOUT_BYTES,
    stderr_limit: int = MAX_STDERR_BYTES,
) -> DispatchPlan:
    """Like plan_capability_dispatch, but binds a GuestAllocation to the plan.

    Validates that the allocation's source_commit and build_id match the
    bundle's.  Extends argv with the allocation's CLI arguments so the runner
    receives ``--disk <path> --aux <path>``.

    The returned DispatchPlan carries the GuestAllocation.  The executor will
    call recheck_resource_identity() on both disk and aux before invoking the
    subprocess, implementing the identity-through-use contract.

    Raises TypeError for wrong argument types.
    Raises ValueError for mismatched bundle/allocation identity or bad limits.
    """
    if not isinstance(bundle, staging.StagedBundle):
        raise TypeError("bundle must be a StagedBundle")
    if not isinstance(capability, CapabilitySpec):
        raise TypeError("capability must be a CapabilitySpec")
    if not isinstance(guest_allocation, alloc.GuestAllocation):
        raise TypeError("guest_allocation must be a GuestAllocation")

    # Validate identity binding between bundle and allocation.
    if guest_allocation.source_commit != bundle.source_commit:
        raise ValueError(
            "allocation source_commit does not match bundle source_commit"
        )
    if guest_allocation.build_id != bundle.build_id:
        raise ValueError(
            "allocation build_id does not match bundle build_id"
        )

    # Range-check caller-supplied limits.
    if not (isinstance(max_wall_seconds, (int, float))
            and MIN_WALL_SECONDS < max_wall_seconds <= MAX_WALL_SECONDS):
        raise ValueError(
            f"max_wall_seconds must be in ({MIN_WALL_SECONDS}, {MAX_WALL_SECONDS}]"
        )
    if not (isinstance(stdout_limit, int) and 0 < stdout_limit <= MAX_STDOUT_BYTES):
        raise ValueError(f"stdout_limit must be in (0, {MAX_STDOUT_BYTES}]")
    if not (isinstance(stderr_limit, int) and 0 < stderr_limit <= MAX_STDERR_BYTES):
        raise ValueError(f"stderr_limit must be in (0, {MAX_STDERR_BYTES}]")

    # Build argv: executable path + allocation CLI args.
    if capability is CapabilitySpec.PROBE:
        base_argv = staging.compose_invocation(bundle)
    else:
        raise ValueError(f"unrecognised capability: {capability!r}")
    argv = base_argv + alloc.build_allocation_argv(guest_allocation)

    return DispatchPlan(
        source_commit=bundle.source_commit,
        build_id=bundle.build_id,
        executable_sha256=bundle.executable_sha256,
        argv=argv,
        capability=capability,
        max_wall_seconds=float(max_wall_seconds),
        stdout_limit=stdout_limit,
        stderr_limit=stderr_limit,
        allocation=guest_allocation,
    )


@dataclass(frozen=True)
class RawCapabilityOutput:
    """E1-supplied subprocess result.  All fields are set by the native executor.

    stdout and stderr must be the complete, unmodified byte strings up to the
    plan's limits (truncation must be reported as a separate error by the caller,
    not silently passed here — if the process emitted more bytes than the limit,
    E1 must refuse to call consume_capability_output and instead report overflow).

    wall_seconds is the elapsed wall-clock time measured by E1; it must be > 0.
    """
    exit_code: int
    stdout: bytes
    stderr: bytes
    wall_seconds: float


def consume_capability_output(
    plan: DispatchPlan,
    raw: RawCapabilityOutput,
) -> CapabilityResult:
    """Validate E1's raw subprocess result and return a structured CapabilityResult.

    Raises TypeError for wrong argument types.
    Raises ValueError for out-of-bounds or malformed raw output.

    This function never starts subprocesses or performs I/O.
    """
    if not isinstance(plan, DispatchPlan):
        raise TypeError("plan must be a DispatchPlan")
    if not isinstance(raw, RawCapabilityOutput):
        raise TypeError("raw must be a RawCapabilityOutput")

    # Validate exit code.
    if not (isinstance(raw.exit_code, int) and 0 <= raw.exit_code <= 255):
        raise ValueError("exit_code must be an integer in [0, 255]")

    # Validate stdout / stderr bytes and sizes.
    if not isinstance(raw.stdout, bytes):
        raise ValueError("stdout must be bytes")
    if not isinstance(raw.stderr, bytes):
        raise ValueError("stderr must be bytes")
    if len(raw.stdout) > plan.stdout_limit:
        raise ValueError(
            f"stdout length {len(raw.stdout)} exceeds plan stdout_limit {plan.stdout_limit}"
        )
    if len(raw.stderr) > plan.stderr_limit:
        raise ValueError(
            f"stderr length {len(raw.stderr)} exceeds plan stderr_limit {plan.stderr_limit}"
        )

    # Validate wall_seconds.
    if not (isinstance(raw.wall_seconds, (int, float))
            and raw.wall_seconds > MIN_WALL_SECONDS):
        raise ValueError("wall_seconds must be a positive number")
    if raw.wall_seconds > plan.max_wall_seconds:
        raise ValueError(
            f"wall_seconds {raw.wall_seconds} exceeds plan max_wall_seconds "
            f"{plan.max_wall_seconds}"
        )

    # Classify outcome.
    marker_present = raw.stderr.startswith(_NOT_YET_IMPL_MARKER)
    if raw.exit_code == 0:
        outcome = CapabilityOutcome.SUCCESS
    elif raw.exit_code == EXIT_NOT_YET_IMPLEMENTED and marker_present:
        outcome = CapabilityOutcome.NOT_YET_IMPLEMENTED
    else:
        outcome = CapabilityOutcome.FAILURE

    return CapabilityResult(
        plan=plan,
        exit_code=raw.exit_code,
        stdout=raw.stdout,
        stderr=raw.stderr,
        wall_seconds=float(raw.wall_seconds),
        outcome=outcome,
        stdout_sha256=hashlib.sha256(raw.stdout).hexdigest(),
        stderr_sha256=hashlib.sha256(raw.stderr).hexdigest(),
        not_yet_impl_marker_present=marker_present,
    )
