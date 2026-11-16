"""Identity-through-use contract for native QA confinement.

A principal's identity is proven not by assertion alone but by evidence of
actually performing an expected sequence of resource operations.  This module
defines the contract and verifies evidence supplied by the authority-contract
document layer (native_qa_authority_contract).

Design boundary
---------------
* No subprocess, network I/O, OS probing, or native framework call.
* All verification is deterministic and purely document-based.
* Real principal identity (actual PID, boot session, etc.) is never read by
  this module; it verifies the evidence document that the native QA runner
  produces, not live system state.

Identity-through-use concept
-----------------------------
Two principals interact with shared resources in every inert-pair cycle:

  caller  — UID 501 (ordinary user); writes the resource, proves write access.
  consumer — UID 1 (daemon); reads and hard-links; proves read/hard-link access.

An identity claim for either principal is accepted only when the evidence
document records that the principal completed its full expected operation
sequence without error.  A principal whose operations were denied, partial,
or absent is classified as UNPROVEN, not PROVEN.

ThroughUseEvidence
------------------
``ThroughUseEvidence`` wraps a subset of the authority-contract document
produced by the inert-pair runner.  ``verify_identity_through_use`` checks:

1. The actor's declared role matches one of the two admitted principals.
2. The actor's UID matches the canonical UID for that role.
3. Every stage in the prescribed operation plan was recorded without denial.
4. The actor's identity fields (boot, pid, birth, image) are non-empty.

Callers supply the raw stage records as extracted from the authority-contract
document; this module re-checks the structural invariants independently.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


# ---------------------------------------------------------------------------
# Role constants.

CALLER_ROLE = "caller"       # UID 501 — writes the inert resource
CONSUMER_ROLE = "consumer"   # UID 1   — reads and hard-links the resource

CANONICAL_UID: dict[str, int] = {
    CALLER_ROLE: 501,
    CONSUMER_ROLE: 1,
}

ADMITTED_ROLES: frozenset[str] = frozenset(CANONICAL_UID)


# ---------------------------------------------------------------------------
# Outcome enum.


class IdentityVerdict(Enum):
    """Result of verify_identity_through_use."""

    PROVEN = "proven"
    """The actor completed its full operation sequence without denial."""

    UNPROVEN = "unproven"
    """The actor's operations were absent, denied, or incomplete."""

    ROLE_MISMATCH = "role_mismatch"
    """The declared role is not an admitted principal."""

    UID_MISMATCH = "uid_mismatch"
    """The actor's UID does not match the canonical UID for its role."""

    IDENTITY_INCOMPLETE = "identity_incomplete"
    """One or more identity fields (boot, pid, birth, image) are empty."""


# ---------------------------------------------------------------------------
# Evidence container.


@dataclass(frozen=True)
class ActorIdentityClaim:
    """Identity fields asserted by a principal in an authority-contract document.

    Fields correspond to the ``actor`` struct in native_qa_authority_contract.Actor
    but are carried here as plain strings/ints to avoid a hard dependency.
    """
    role: str
    uid: int
    pid: int
    boot: str
    birth: str
    image: str
    authority: str


@dataclass(frozen=True)
class StageRecord:
    """One stage entry from an authority-contract operation sequence.

    Fields
    ------
    stage   : stage name (e.g. "open", "pwrite", "pread").
    denied  : True if the stage was denied (errno 13 / EACCES).
    absent  : True if the stage was not recorded at all.
    """
    stage: str
    denied: bool
    absent: bool


@dataclass(frozen=True)
class ThroughUseEvidence:
    """Evidence of a principal performing a resource operation sequence.

    actor         : identity claim for the principal under review.
    stages        : ordered stage records from the authority-contract document.
    operation_name: the operation key (e.g. "write", "mmap") that produced
                    the stage sequence.
    """
    actor: ActorIdentityClaim
    stages: tuple[StageRecord, ...]
    operation_name: str


# ---------------------------------------------------------------------------
# Verification.


class ThroughUseContractError(ValueError):
    """Evidence structure violates the through-use contract."""


def verify_identity_through_use(
    evidence: ThroughUseEvidence,
    *,
    expected_role: str,
) -> IdentityVerdict:
    """Verify that *evidence* proves *expected_role*'s identity through use.

    Parameters
    ----------
    evidence      : ThroughUseEvidence from the authority-contract document.
    expected_role : CALLER_ROLE or CONSUMER_ROLE.

    Returns
    -------
    IdentityVerdict
        PROVEN if the actor's identity is established through its operations.
        Any other verdict indicates the identity is not proven.

    Raises
    ------
    TypeError
        If *evidence* is not a ThroughUseEvidence.
    ThroughUseContractError
        If the evidence structure is internally inconsistent.
    """
    if not isinstance(evidence, ThroughUseEvidence):
        raise TypeError("evidence must be a ThroughUseEvidence")
    if expected_role not in ADMITTED_ROLES:
        raise ThroughUseContractError(
            f"expected_role {expected_role!r} is not an admitted principal; "
            f"admitted: {sorted(ADMITTED_ROLES)}"
        )

    actor = evidence.actor

    # 1. Role check.
    if actor.role != expected_role:
        return IdentityVerdict.ROLE_MISMATCH

    # 2. UID check.
    canonical_uid = CANONICAL_UID[expected_role]
    if actor.uid != canonical_uid:
        return IdentityVerdict.UID_MISMATCH

    # 3. Identity completeness check.
    if not all([
        actor.boot and isinstance(actor.boot, str),
        actor.birth and isinstance(actor.birth, str),
        actor.image and isinstance(actor.image, str),
        actor.authority and isinstance(actor.authority, str),
        isinstance(actor.pid, int) and actor.pid > 0,
    ]):
        return IdentityVerdict.IDENTITY_INCOMPLETE

    # 4. Operation completeness: all stages must be present and not denied.
    if not evidence.stages:
        return IdentityVerdict.UNPROVEN

    for record in evidence.stages:
        if not isinstance(record, StageRecord):
            raise ThroughUseContractError(
                f"stages must contain StageRecord instances, got {type(record)!r}"
            )
        if record.absent:
            return IdentityVerdict.UNPROVEN
        if record.denied:
            return IdentityVerdict.UNPROVEN

    return IdentityVerdict.PROVEN


# ---------------------------------------------------------------------------
# Convenience builder from raw stage dicts.


def build_stage_records(
    raw_stages: list[dict],
) -> tuple[StageRecord, ...]:
    """Convert raw stage dicts from an authority-contract document to StageRecords.

    Each dict must have at minimum a "stage" key.  "errno" and "return" keys
    are used to infer denial and absence.

    A stage is classified as:
    * absent  — if the dict has no "return" key or its value is None AND the
                 "errno" key is also missing or None.
    * denied  — if "errno" is non-zero or "return" is -1 with "errno" == 13.
    * otherwise present and non-denied.

    Raises
    ------
    ThroughUseContractError
        If any dict is missing the "stage" key.
    """
    records = []
    for entry in raw_stages:
        if "stage" not in entry:
            raise ThroughUseContractError(
                f"stage record missing 'stage' key: {entry!r}"
            )
        name = entry["stage"]
        returned = entry.get("return")
        errno = entry.get("errno")
        absent = returned is None and not errno
        denied = (not absent) and bool(errno)
        records.append(StageRecord(stage=name, denied=denied, absent=absent))
    return tuple(records)
