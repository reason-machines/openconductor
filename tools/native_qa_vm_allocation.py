"""Authenticated allocation producer and broker composition.

An AllocationToken is an authenticated, time-bounded proof that a specific
StagedBundle has been approved for a single DispatchPlan composition cycle.
It is produced by ``request_allocation_slot`` and consumed exactly once by
``compose_allocated_plan``, which calls the existing capability broker.

Design boundary
---------------
* No subprocess, network I/O, native framework call, or OS admission.
* Allocation is a source-level contract.  E1 must still satisfy all
  additional native admission requirements before invoking the plan's argv.
* Token expiry is enforced structurally (seconds since epoch); callers
  supply ``now_seconds`` in tests for determinism.

Token lifetime
--------------
Tokens are single-use: ``compose_allocated_plan`` marks each token used
via a flag on the token object.  Attempting to compose a second plan from
the same token raises ``AllocationConsumedError``.

Issuer hash
-----------
The issuer_hash field binds the token to the allocating context without
encoding any secret.  It is ``sha256(source_commit + "\\n" + build_id)``,
re-verified in ``compose_allocated_plan``.  Its purpose is to detect
accidental token reuse across different bundle identities, not to provide
cryptographic secrecy.
"""
from __future__ import annotations

import hashlib
import time
from dataclasses import dataclass, field

from tools import native_qa_vm_broker as broker
from tools import native_qa_vm_staging as staging

# ---------------------------------------------------------------------------
# Bounded lifetime constants.

MAX_ALLOCATION_SECONDS: float = 300.0   # 5 minutes; callers may use less
MIN_ALLOCATION_SECONDS: float = 1.0     # sanity floor
DEFAULT_ALLOCATION_SECONDS: float = 60.0

# ---------------------------------------------------------------------------
# Exceptions.


class AllocationRefusal(ValueError):
    """The bundle or parameters do not satisfy the allocation contract."""


class AllocationExpiredError(ValueError):
    """The AllocationToken's lifetime has elapsed."""


class AllocationConsumedError(ValueError):
    """The AllocationToken has already been used to compose a plan."""


# ---------------------------------------------------------------------------
# AllocationToken.


def _issuer_hash(source_commit: str, build_id: str) -> str:
    """Deterministic binding of token to bundle identity."""
    return hashlib.sha256(
        f"{source_commit}\n{build_id}".encode()
    ).hexdigest()


@dataclass
class AllocationToken:
    """Authenticated, single-use, time-bounded allocation proof.

    Fields
    ------
    source_commit       : 40-hex source identity from the staged bundle.
    build_id            : build identity from the staged bundle.
    executable_sha256   : SHA-256 of the staged executable.
    issued_at           : epoch seconds at which the slot was allocated.
    expires_at          : epoch seconds after which the token is invalid.
    issuer_hash         : sha256(source_commit + "\\n" + build_id) binding.
    _consumed           : internal flag; True after compose_allocated_plan.

    This token does not constitute execution authority.  E1 must still
    satisfy any additional native admission requirements before running.
    """
    source_commit: str
    build_id: str
    executable_sha256: str
    issued_at: float
    expires_at: float
    issuer_hash: str
    _consumed: bool = field(default=False, repr=False)

    def is_expired(self, now_seconds: float | None = None) -> bool:
        """Return True if the token's lifetime has elapsed."""
        t = now_seconds if now_seconds is not None else time.monotonic()
        return t >= self.expires_at

    def is_consumed(self) -> bool:
        """Return True if compose_allocated_plan has already used this token."""
        return self._consumed


# ---------------------------------------------------------------------------
# Public API.


def request_allocation_slot(
    bundle: staging.StagedBundle,
    *,
    lifetime_seconds: float = DEFAULT_ALLOCATION_SECONDS,
    now_seconds: float | None = None,
) -> AllocationToken:
    """Produce an AllocationToken for one allowed plan composition.

    Validates *bundle* is an authenticated StagedBundle and that
    *lifetime_seconds* is in [MIN_ALLOCATION_SECONDS, MAX_ALLOCATION_SECONDS].

    Parameters
    ----------
    bundle          : authenticated staged bundle (from stage_retained_bundle).
    lifetime_seconds: token lifetime in seconds; defaults to 60.
    now_seconds     : epoch reference for tests; uses ``time.monotonic()`` by
                      default (monotonic clock, not wall time — suitable for
                      lifetime arithmetic within a single process run).

    Raises
    ------
    TypeError
        If *bundle* is not a StagedBundle.
    AllocationRefusal
        If *lifetime_seconds* is out of bounds or bundle fields are malformed.
    """
    if not isinstance(bundle, staging.StagedBundle):
        raise TypeError("bundle must be a StagedBundle")
    if not (
        isinstance(lifetime_seconds, (int, float))
        and MIN_ALLOCATION_SECONDS <= lifetime_seconds <= MAX_ALLOCATION_SECONDS
    ):
        raise AllocationRefusal(
            f"lifetime_seconds must be in [{MIN_ALLOCATION_SECONDS}, "
            f"{MAX_ALLOCATION_SECONDS}], got {lifetime_seconds!r}"
        )
    # Validate bundle fields carry well-formed identities.
    if not (isinstance(bundle.source_commit, str) and len(bundle.source_commit) == 40):
        raise AllocationRefusal("bundle.source_commit must be a 40-character hex string")
    if not (isinstance(bundle.build_id, str) and bundle.build_id):
        raise AllocationRefusal("bundle.build_id must be a non-empty string")
    if not (isinstance(bundle.executable_sha256, str) and len(bundle.executable_sha256) == 64):
        raise AllocationRefusal("bundle.executable_sha256 must be a 64-character hex string")

    t0 = now_seconds if now_seconds is not None else time.monotonic()
    return AllocationToken(
        source_commit=bundle.source_commit,
        build_id=bundle.build_id,
        executable_sha256=bundle.executable_sha256,
        issued_at=t0,
        expires_at=t0 + float(lifetime_seconds),
        issuer_hash=_issuer_hash(bundle.source_commit, bundle.build_id),
    )


def compose_allocated_plan(
    token: AllocationToken,
    bundle: staging.StagedBundle,
    capability: broker.CapabilitySpec = broker.CapabilitySpec.PROBE,
    *,
    max_wall_seconds: float = broker.MAX_WALL_SECONDS,
    stdout_limit: int = broker.MAX_STDOUT_BYTES,
    stderr_limit: int = broker.MAX_STDERR_BYTES,
    now_seconds: float | None = None,
) -> broker.DispatchPlan:
    """Consume *token* and return a DispatchPlan via the capability broker.

    Verifies:
    1. *token* is an AllocationToken and has not been consumed.
    2. *token* has not expired.
    3. *bundle* is a StagedBundle whose identity matches *token*.
    4. *token*'s issuer_hash matches the expected binding.

    Marks *token* consumed before calling the broker; any subsequent call
    with the same token raises AllocationConsumedError even if the broker
    call fails.

    Raises
    ------
    TypeError
        If *token* or *bundle* have the wrong type.
    AllocationConsumedError
        If the token has already been used.
    AllocationExpiredError
        If the token's lifetime has elapsed.
    AllocationRefusal
        If the token–bundle identity binding fails.
    broker.CapabilityRefusal / ValueError
        Propagated from ``plan_capability_dispatch``.
    """
    if not isinstance(token, AllocationToken):
        raise TypeError("token must be an AllocationToken")
    if not isinstance(bundle, staging.StagedBundle):
        raise TypeError("bundle must be a StagedBundle")

    if token.is_consumed():
        raise AllocationConsumedError("AllocationToken has already been used")

    t = now_seconds if now_seconds is not None else time.monotonic()
    if token.is_expired(t):
        raise AllocationExpiredError(
            f"AllocationToken expired at {token.expires_at:.3f} (now {t:.3f})"
        )

    # Verify token–bundle identity binding.
    if token.source_commit != bundle.source_commit:
        raise AllocationRefusal(
            f"token source_commit {token.source_commit!r} does not match "
            f"bundle source_commit {bundle.source_commit!r}"
        )
    if token.build_id != bundle.build_id:
        raise AllocationRefusal(
            f"token build_id {token.build_id!r} does not match "
            f"bundle build_id {bundle.build_id!r}"
        )
    if token.executable_sha256 != bundle.executable_sha256:
        raise AllocationRefusal(
            f"token executable_sha256 does not match bundle executable_sha256"
        )
    expected_hash = _issuer_hash(bundle.source_commit, bundle.build_id)
    if token.issuer_hash != expected_hash:
        raise AllocationRefusal(
            f"token issuer_hash does not match expected binding for this bundle"
        )

    # Consume the token before calling the broker (atomic under single-threaded use).
    token._consumed = True

    return broker.plan_capability_dispatch(
        bundle,
        capability,
        max_wall_seconds=max_wall_seconds,
        stdout_limit=stdout_limit,
        stderr_limit=stderr_limit,
    )
