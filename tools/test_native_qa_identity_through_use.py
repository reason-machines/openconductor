"""Identity-through-use contract tests.

Cloud-safe: no native execution, subprocess, filesystem access, or OS probing.
All inputs are synthetic document evidence matching the authority-contract
structure used by the inert-pair runner.
"""
import unittest

from tools import native_qa_identity_through_use as itu


# ---------------------------------------------------------------------------
# Helpers.


def _caller_claim(uid=501, pid=12345):
    return itu.ActorIdentityClaim(
        role=itu.CALLER_ROLE,
        uid=uid,
        pid=pid,
        boot="fixture-boot-session",
        birth="fixture-birth-12345",
        image="/usr/local/bin/oc-qa-runner",
        authority="a" * 64,
    )


def _consumer_claim(uid=1, pid=99):
    return itu.ActorIdentityClaim(
        role=itu.CONSUMER_ROLE,
        uid=uid,
        pid=pid,
        boot="fixture-boot-session",
        birth="fixture-birth-99",
        image="/usr/libexec/oc-qa-consumer",
        authority="b" * 64,
    )


def _stages_pass(names=("open", "pwrite")):
    return tuple(itu.StageRecord(stage=n, denied=False, absent=False) for n in names)


def _stages_denied(names=("open",)):
    return tuple(itu.StageRecord(stage=n, denied=True, absent=False) for n in names)


def _stages_absent(names=("open",)):
    return tuple(itu.StageRecord(stage=n, denied=False, absent=True) for n in names)


# ---------------------------------------------------------------------------
# PROVEN verdict tests.


class ProvenVerdictTests(unittest.TestCase):
    def test_caller_proven_with_complete_stages(self):
        evidence = itu.ThroughUseEvidence(
            actor=_caller_claim(),
            stages=_stages_pass(("open", "pwrite")),
            operation_name="write",
        )
        verdict = itu.verify_identity_through_use(evidence, expected_role=itu.CALLER_ROLE)
        self.assertEqual(verdict, itu.IdentityVerdict.PROVEN)

    def test_consumer_proven_with_complete_stages(self):
        evidence = itu.ThroughUseEvidence(
            actor=_consumer_claim(),
            stages=_stages_pass(("pread", "pwrite", "fsync")),
            operation_name="write",
        )
        verdict = itu.verify_identity_through_use(evidence, expected_role=itu.CONSUMER_ROLE)
        self.assertEqual(verdict, itu.IdentityVerdict.PROVEN)

    def test_single_stage_sufficient_for_proven(self):
        evidence = itu.ThroughUseEvidence(
            actor=_caller_claim(),
            stages=_stages_pass(("pwrite",)),
            operation_name="mmap",
        )
        verdict = itu.verify_identity_through_use(evidence, expected_role=itu.CALLER_ROLE)
        self.assertEqual(verdict, itu.IdentityVerdict.PROVEN)


# ---------------------------------------------------------------------------
# UNPROVEN verdict tests.


class UnprovenVerdictTests(unittest.TestCase):
    def test_empty_stages_unproven(self):
        evidence = itu.ThroughUseEvidence(
            actor=_caller_claim(),
            stages=(),
            operation_name="write",
        )
        verdict = itu.verify_identity_through_use(evidence, expected_role=itu.CALLER_ROLE)
        self.assertEqual(verdict, itu.IdentityVerdict.UNPROVEN)

    def test_denied_stage_unproven(self):
        evidence = itu.ThroughUseEvidence(
            actor=_caller_claim(),
            stages=_stages_denied(("open",)),
            operation_name="write",
        )
        verdict = itu.verify_identity_through_use(evidence, expected_role=itu.CALLER_ROLE)
        self.assertEqual(verdict, itu.IdentityVerdict.UNPROVEN)

    def test_absent_stage_unproven(self):
        evidence = itu.ThroughUseEvidence(
            actor=_caller_claim(),
            stages=_stages_absent(("open",)),
            operation_name="write",
        )
        verdict = itu.verify_identity_through_use(evidence, expected_role=itu.CALLER_ROLE)
        self.assertEqual(verdict, itu.IdentityVerdict.UNPROVEN)

    def test_mixed_stages_denied_last_unproven(self):
        stages = (
            itu.StageRecord(stage="open", denied=False, absent=False),
            itu.StageRecord(stage="pwrite", denied=True, absent=False),
        )
        evidence = itu.ThroughUseEvidence(
            actor=_caller_claim(),
            stages=stages,
            operation_name="write",
        )
        verdict = itu.verify_identity_through_use(evidence, expected_role=itu.CALLER_ROLE)
        self.assertEqual(verdict, itu.IdentityVerdict.UNPROVEN)

    def test_consumer_denied_at_first_stage_unproven(self):
        stages = (itu.StageRecord(stage="pread", denied=True, absent=False),)
        evidence = itu.ThroughUseEvidence(
            actor=_consumer_claim(),
            stages=stages,
            operation_name="write",
        )
        verdict = itu.verify_identity_through_use(evidence, expected_role=itu.CONSUMER_ROLE)
        self.assertEqual(verdict, itu.IdentityVerdict.UNPROVEN)


# ---------------------------------------------------------------------------
# ROLE_MISMATCH verdict tests.


class RoleMismatchVerdictTests(unittest.TestCase):
    def test_caller_claim_checked_as_consumer_mismatch(self):
        evidence = itu.ThroughUseEvidence(
            actor=_caller_claim(),
            stages=_stages_pass(),
            operation_name="write",
        )
        verdict = itu.verify_identity_through_use(evidence, expected_role=itu.CONSUMER_ROLE)
        self.assertEqual(verdict, itu.IdentityVerdict.ROLE_MISMATCH)

    def test_consumer_claim_checked_as_caller_mismatch(self):
        evidence = itu.ThroughUseEvidence(
            actor=_consumer_claim(),
            stages=_stages_pass(),
            operation_name="write",
        )
        verdict = itu.verify_identity_through_use(evidence, expected_role=itu.CALLER_ROLE)
        self.assertEqual(verdict, itu.IdentityVerdict.ROLE_MISMATCH)


# ---------------------------------------------------------------------------
# UID_MISMATCH verdict tests.


class UidMismatchVerdictTests(unittest.TestCase):
    def test_caller_wrong_uid_mismatch(self):
        evidence = itu.ThroughUseEvidence(
            actor=_caller_claim(uid=500),
            stages=_stages_pass(),
            operation_name="write",
        )
        verdict = itu.verify_identity_through_use(evidence, expected_role=itu.CALLER_ROLE)
        self.assertEqual(verdict, itu.IdentityVerdict.UID_MISMATCH)

    def test_consumer_wrong_uid_mismatch(self):
        evidence = itu.ThroughUseEvidence(
            actor=_consumer_claim(uid=0),
            stages=_stages_pass(),
            operation_name="write",
        )
        verdict = itu.verify_identity_through_use(evidence, expected_role=itu.CONSUMER_ROLE)
        self.assertEqual(verdict, itu.IdentityVerdict.UID_MISMATCH)


# ---------------------------------------------------------------------------
# IDENTITY_INCOMPLETE verdict tests.


class IdentityIncompleteVerdictTests(unittest.TestCase):
    def _claim_with(self, **overrides):
        base = dict(
            role=itu.CALLER_ROLE, uid=501, pid=1,
            boot="boot", birth="birth",
            image="/bin/runner", authority="x" * 64,
        )
        base.update(overrides)
        return itu.ActorIdentityClaim(**base)

    def test_empty_boot_incomplete(self):
        evidence = itu.ThroughUseEvidence(
            actor=self._claim_with(boot=""),
            stages=_stages_pass(),
            operation_name="write",
        )
        verdict = itu.verify_identity_through_use(evidence, expected_role=itu.CALLER_ROLE)
        self.assertEqual(verdict, itu.IdentityVerdict.IDENTITY_INCOMPLETE)

    def test_empty_birth_incomplete(self):
        evidence = itu.ThroughUseEvidence(
            actor=self._claim_with(birth=""),
            stages=_stages_pass(),
            operation_name="write",
        )
        verdict = itu.verify_identity_through_use(evidence, expected_role=itu.CALLER_ROLE)
        self.assertEqual(verdict, itu.IdentityVerdict.IDENTITY_INCOMPLETE)

    def test_empty_image_incomplete(self):
        evidence = itu.ThroughUseEvidence(
            actor=self._claim_with(image=""),
            stages=_stages_pass(),
            operation_name="write",
        )
        verdict = itu.verify_identity_through_use(evidence, expected_role=itu.CALLER_ROLE)
        self.assertEqual(verdict, itu.IdentityVerdict.IDENTITY_INCOMPLETE)

    def test_zero_pid_incomplete(self):
        evidence = itu.ThroughUseEvidence(
            actor=self._claim_with(pid=0),
            stages=_stages_pass(),
            operation_name="write",
        )
        verdict = itu.verify_identity_through_use(evidence, expected_role=itu.CALLER_ROLE)
        self.assertEqual(verdict, itu.IdentityVerdict.IDENTITY_INCOMPLETE)


# ---------------------------------------------------------------------------
# Type / contract error tests.


class ContractErrorTests(unittest.TestCase):
    def test_non_evidence_raises_type_error(self):
        with self.assertRaises(TypeError):
            itu.verify_identity_through_use("not-evidence", expected_role=itu.CALLER_ROLE)

    def test_unknown_expected_role_raises(self):
        evidence = itu.ThroughUseEvidence(
            actor=_caller_claim(),
            stages=_stages_pass(),
            operation_name="write",
        )
        with self.assertRaises(itu.ThroughUseContractError):
            itu.verify_identity_through_use(evidence, expected_role="unknown_role")

    def test_non_stage_record_in_stages_raises(self):
        evidence = itu.ThroughUseEvidence(
            actor=_caller_claim(),
            stages=({"stage": "open"},),  # dict, not StageRecord
            operation_name="write",
        )
        with self.assertRaises(itu.ThroughUseContractError):
            itu.verify_identity_through_use(evidence, expected_role=itu.CALLER_ROLE)


# ---------------------------------------------------------------------------
# build_stage_records helper tests.


class BuildStageRecordsTests(unittest.TestCase):
    def test_pass_stage(self):
        raw = [{"stage": "pwrite", "return": 32, "errno": 0}]
        records = itu.build_stage_records(raw)
        self.assertEqual(len(records), 1)
        self.assertFalse(records[0].denied)
        self.assertFalse(records[0].absent)
        self.assertEqual(records[0].stage, "pwrite")

    def test_denied_stage(self):
        raw = [{"stage": "open", "return": -1, "errno": 13}]
        records = itu.build_stage_records(raw)
        self.assertTrue(records[0].denied)
        self.assertFalse(records[0].absent)

    def test_absent_stage(self):
        raw = [{"stage": "mmap", "return": None}]
        records = itu.build_stage_records(raw)
        self.assertTrue(records[0].absent)

    def test_multiple_stages(self):
        raw = [
            {"stage": "open", "return": 3, "errno": 0},
            {"stage": "pwrite", "return": 32, "errno": 0},
            {"stage": "fsync", "return": 0, "errno": 0},
        ]
        records = itu.build_stage_records(raw)
        self.assertEqual(len(records), 3)
        self.assertFalse(any(r.denied or r.absent for r in records))

    def test_missing_stage_key_raises(self):
        with self.assertRaises(itu.ThroughUseContractError):
            itu.build_stage_records([{"return": 0}])


if __name__ == "__main__":
    unittest.main()
