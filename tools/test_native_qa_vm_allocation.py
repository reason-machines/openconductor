"""Allocation producer and broker composition tests.

Cloud-safe: no native execution, subprocess, filesystem staging, or
provisioning.  StagedBundle instances are built from scratch using their
dataclass constructor with synthetic but structurally valid fields.
"""
import hashlib
import io
import os
import plistlib
import stat
import tempfile
import unittest
import zipfile
from pathlib import Path

from tools import native_qa_vm_allocation as alloc
from tools import native_qa_vm_broker as broker
from tools import native_qa_vm_receipt as policy
from tools import native_qa_vm_staging as staging

# ---------------------------------------------------------------------------
# Synthetic bundle helpers.

_SOURCE = "a" * 40
_BUILD_ID = "github-actions:1:10:1:compile-sign"
_FAKE_EXE = b"\xcf\xfa\xed\xfe" + b"\x00" * 60
_FAKE_EXE_SHA = hashlib.sha256(_FAKE_EXE).hexdigest()
_FAKE_PLIST = plistlib.dumps({
    "CFBundleIdentifier": policy.BUNDLE_ID,
    "CFBundleExecutable": policy.EXECUTABLE.rsplit("/", 1)[1],
})
_FAKE_CODESIG = b"codesig-placeholder"


def _make_archive(exe_bytes: bytes = _FAKE_EXE) -> bytes:
    """Return a valid retained bundle archive with correct ZipInfo Unix attrs."""
    receipt = policy._canonical({
        "schema": 1, "repository": policy.REPOSITORY,
        "source_commit": _SOURCE, "build_id": _BUILD_ID,
        "executable_sha256": hashlib.sha256(exe_bytes).hexdigest(),
    })
    manifest = policy._canonical({
        "schema": 1, "repository": policy.REPOSITORY,
        "repository_id": 1, "source_commit": _SOURCE,
        "workflow_path": policy.WORKFLOW, "workflow_commit": _SOURCE,
        "run_id": 10, "run_attempt": 1, "job_key": policy.JOB,
        "event": "push", "ref": "refs/heads/main",
        "build_id": _BUILD_ID, "bundle_id": policy.BUNDLE_ID,
        "executable": policy.EXECUTABLE, "architecture": "arm64",
        "minimum_macos": "15.0", "sdk_version": "15.0",
        "clang_version": "clang-1700", "signing_mode": "ad-hoc",
        "receipt_sha256": hashlib.sha256(receipt).hexdigest(),
    })
    root = policy.BUNDLE_ROOT
    contents = {
        "receipt.json": (receipt, 0o600),
        "build.json": (manifest, 0o600),
        f"{root}/Contents/Info.plist": (_FAKE_PLIST, 0o644),
        f"{root}/{policy.EXECUTABLE}": (exe_bytes, 0o755),
        f"{root}/Contents/_CodeSignature/CodeResources": (_FAKE_CODESIG, 0o644),
    }
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_STORED) as zf:
        for name, (data, mode) in contents.items():
            info = zipfile.ZipInfo(name)
            info.create_system = 3  # Unix
            info.external_attr = (stat.S_IFREG | mode) << 16
            zf.writestr(info, data)
    return buf.getvalue()


def _make_staged_bundle() -> staging.StagedBundle:
    """Create a StagedBundle via the real staging machinery (temp dir)."""
    archive = _make_archive()
    # Resolve symlinks so stage_retained_bundle's symlink guard passes on
    # Linux (/tmp -> /private/tmp-style mounts) and macOS.
    base = os.path.realpath(tempfile.mkdtemp(prefix="oc-alloc-test-"))
    target = Path(os.path.join(base, "staged"))
    return staging.stage_retained_bundle(archive, target)


# ---------------------------------------------------------------------------
# AllocationToken production tests.


class RequestAllocationSlotTests(unittest.TestCase):
    def setUp(self):
        self.bundle = _make_staged_bundle()

    def tearDown(self):
        import shutil
        shutil.rmtree(str(self.bundle.staged_path.parent), ignore_errors=True)

    # ------------------------------------------------------------------
    def test_produces_token_with_correct_fields(self):
        token = alloc.request_allocation_slot(self.bundle)
        self.assertEqual(token.source_commit, _SOURCE)
        self.assertEqual(token.build_id, _BUILD_ID)
        self.assertEqual(token.executable_sha256, _FAKE_EXE_SHA)
        self.assertFalse(token.is_consumed())

    def test_token_not_expired_immediately(self):
        t0 = 1000.0
        token = alloc.request_allocation_slot(self.bundle, lifetime_seconds=60.0,
                                               now_seconds=t0)
        self.assertFalse(token.is_expired(t0 + 59.9))

    def test_token_expires_at_lifetime_boundary(self):
        t0 = 1000.0
        token = alloc.request_allocation_slot(self.bundle, lifetime_seconds=60.0,
                                               now_seconds=t0)
        self.assertTrue(token.is_expired(t0 + 60.0))

    def test_issuer_hash_matches_expected(self):
        token = alloc.request_allocation_slot(self.bundle)
        expected = hashlib.sha256(
            f"{_SOURCE}\n{_BUILD_ID}".encode()
        ).hexdigest()
        self.assertEqual(token.issuer_hash, expected)

    def test_rejects_non_staged_bundle(self):
        with self.assertRaises(TypeError):
            alloc.request_allocation_slot("not-a-bundle")

    def test_rejects_lifetime_too_short(self):
        with self.assertRaises(alloc.AllocationRefusal):
            alloc.request_allocation_slot(self.bundle, lifetime_seconds=0.5)

    def test_rejects_lifetime_too_long(self):
        with self.assertRaises(alloc.AllocationRefusal):
            alloc.request_allocation_slot(self.bundle,
                                           lifetime_seconds=alloc.MAX_ALLOCATION_SECONDS + 1)

    def test_accepts_exact_minimum_lifetime(self):
        t0 = 1000.0
        token = alloc.request_allocation_slot(
            self.bundle, lifetime_seconds=alloc.MIN_ALLOCATION_SECONDS, now_seconds=t0
        )
        self.assertFalse(token.is_expired(t0))

    def test_accepts_exact_maximum_lifetime(self):
        t0 = 1000.0
        token = alloc.request_allocation_slot(
            self.bundle, lifetime_seconds=alloc.MAX_ALLOCATION_SECONDS, now_seconds=t0
        )
        self.assertFalse(token.is_expired(t0))


# ---------------------------------------------------------------------------
# compose_allocated_plan tests.


class ComposeAllocatedPlanTests(unittest.TestCase):
    def setUp(self):
        self.bundle = _make_staged_bundle()

    def tearDown(self):
        import shutil
        shutil.rmtree(str(self.bundle.staged_path.parent), ignore_errors=True)

    def _fresh_token(self, t0=1000.0, lifetime=60.0):
        return alloc.request_allocation_slot(
            self.bundle, lifetime_seconds=lifetime, now_seconds=t0
        )

    def test_returns_dispatch_plan(self):
        token = self._fresh_token()
        plan = alloc.compose_allocated_plan(token, self.bundle, now_seconds=999.0)
        self.assertIsInstance(plan, broker.DispatchPlan)

    def test_plan_carries_bundle_identity(self):
        token = self._fresh_token()
        plan = alloc.compose_allocated_plan(token, self.bundle, now_seconds=999.0)
        self.assertEqual(plan.source_commit, _SOURCE)
        self.assertEqual(plan.build_id, _BUILD_ID)
        self.assertEqual(plan.executable_sha256, _FAKE_EXE_SHA)

    def test_token_consumed_after_compose(self):
        token = self._fresh_token()
        alloc.compose_allocated_plan(token, self.bundle, now_seconds=999.0)
        self.assertTrue(token.is_consumed())

    def test_second_compose_raises_consumed(self):
        token = self._fresh_token()
        alloc.compose_allocated_plan(token, self.bundle, now_seconds=999.0)
        with self.assertRaises(alloc.AllocationConsumedError):
            alloc.compose_allocated_plan(token, self.bundle, now_seconds=999.0)

    def test_expired_token_raises(self):
        t0 = 1000.0
        token = self._fresh_token(t0=t0, lifetime=10.0)
        with self.assertRaises(alloc.AllocationExpiredError):
            alloc.compose_allocated_plan(token, self.bundle, now_seconds=t0 + 10.0)

    def test_mismatched_source_commit_raises(self):
        token = self._fresh_token()
        bundle2 = _make_staged_bundle()
        try:
            # Patch the token with a different source commit.
            import dataclasses
            tampered = dataclasses.replace(token, source_commit="b" * 40)
            with self.assertRaises(alloc.AllocationRefusal):
                alloc.compose_allocated_plan(tampered, self.bundle, now_seconds=999.0)
        finally:
            import shutil
            shutil.rmtree(str(bundle2.staged_path.parent), ignore_errors=True)

    def test_non_token_type_raises(self):
        with self.assertRaises(TypeError):
            alloc.compose_allocated_plan("not-a-token", self.bundle)

    def test_non_bundle_type_raises(self):
        token = self._fresh_token()
        with self.assertRaises(TypeError):
            alloc.compose_allocated_plan(token, "not-a-bundle")

    def test_plan_capability_is_probe(self):
        token = self._fresh_token()
        plan = alloc.compose_allocated_plan(
            token, self.bundle,
            broker.CapabilitySpec.PROBE,
            now_seconds=999.0,
        )
        self.assertEqual(plan.capability, broker.CapabilitySpec.PROBE)


if __name__ == "__main__":
    unittest.main()
