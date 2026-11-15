"""Capability broker tests. No native execution, provisioning or filesystem side effects."""
import hashlib
import io
import os
import stat
import tempfile
import unittest
import zipfile

import plistlib as _plistlib

from tools import native_qa_vm_receipt as policy
from tools import native_qa_vm_staging as staging
from tools import native_qa_vm_broker as broker

# ---------------------------------------------------------------------------
# Shared synthetic bundle helpers (mirrors test_native_qa_vm_staging.py patterns).

_SOURCE = "b" * 40
_REPO_ID = 1
_RUN_ID = 10
_ATTEMPT = 1
_FAKE_EXE = b"\xcf\xfa\xed\xfe" + b"\x00" * 60
_FAKE_PLIST = _plistlib.dumps({
    "CFBundleIdentifier": policy.BUNDLE_ID,
    "CFBundleExecutable": policy.EXECUTABLE.rsplit("/", 1)[1],
})
_FAKE_CODESIG = b"codesig-placeholder"


def _build_id():
    return f"github-actions:{_REPO_ID}:{_RUN_ID}:{_ATTEMPT}:{policy.JOB}"


def _make_receipt(exe_bytes: bytes) -> bytes:
    exe_sha = hashlib.sha256(exe_bytes).hexdigest()
    return policy._canonical({
        "schema": 1, "repository": policy.REPOSITORY,
        "source_commit": _SOURCE, "build_id": _build_id(),
        "executable_sha256": exe_sha,
    })


def _make_manifest(receipt_bytes: bytes) -> bytes:
    return policy._canonical({
        "schema": 1, "repository": policy.REPOSITORY,
        "repository_id": _REPO_ID, "source_commit": _SOURCE,
        "workflow_path": policy.WORKFLOW, "workflow_commit": _SOURCE,
        "run_id": _RUN_ID, "run_attempt": _ATTEMPT, "job_key": policy.JOB,
        "event": "push", "ref": "refs/heads/main",
        "build_id": _build_id(), "bundle_id": policy.BUNDLE_ID,
        "executable": policy.EXECUTABLE, "architecture": "arm64",
        "minimum_macos": "15.0", "sdk_version": "15.0", "clang_version": "clang-1700",
        "signing_mode": "ad-hoc",
        "receipt_sha256": hashlib.sha256(receipt_bytes).hexdigest(),
    })


def _make_archive(exe_bytes: bytes = _FAKE_EXE) -> bytes:
    receipt = _make_receipt(exe_bytes)
    manifest = _make_manifest(receipt)
    buf = io.BytesIO()
    root = policy.BUNDLE_ROOT
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_STORED) as zf:
        for name, (data, mode) in {
            "receipt.json": (receipt, 0o600),
            "build.json": (manifest, 0o600),
            f"{root}/Contents/Info.plist": (_FAKE_PLIST, 0o644),
            f"{root}/{policy.EXECUTABLE}": (exe_bytes, 0o755),
            f"{root}/Contents/_CodeSignature/CodeResources": (_FAKE_CODESIG, 0o644),
        }.items():
            info = zipfile.ZipInfo(name)
            info.create_system = 3
            info.external_attr = (stat.S_IFREG | mode) << 16
            zf.writestr(info, data)
    return buf.getvalue()


class BrokerTestBase(unittest.TestCase):
    """Shared setUp/tearDown that stages a valid bundle for reuse."""

    def setUp(self):
        self._tmpdir = os.path.realpath(tempfile.mkdtemp(prefix="oc-broker-test-"))
        data = _make_archive()
        self._bundle = staging.stage_retained_bundle(data, os.path.join(self._tmpdir, "staged"))

    def tearDown(self):
        import shutil
        shutil.rmtree(self._tmpdir, ignore_errors=True)


# ---------------------------------------------------------------------------
# plan_capability_dispatch — success paths

class PlanSuccessTests(BrokerTestBase):

    def test_probe_returns_dispatch_plan(self):
        plan = broker.plan_capability_dispatch(self._bundle, broker.CapabilitySpec.PROBE)
        self.assertIsInstance(plan, broker.DispatchPlan)

    def test_probe_plan_has_correct_identity(self):
        plan = broker.plan_capability_dispatch(self._bundle, broker.CapabilitySpec.PROBE)
        self.assertEqual(plan.source_commit, _SOURCE)
        self.assertEqual(plan.build_id, _build_id())
        self.assertEqual(plan.executable_sha256, self._bundle.executable_sha256)

    def test_probe_plan_argv_starts_with_executable(self):
        plan = broker.plan_capability_dispatch(self._bundle, broker.CapabilitySpec.PROBE)
        self.assertIsInstance(plan.argv, tuple)
        self.assertGreater(len(plan.argv), 0)
        self.assertEqual(plan.argv[0], str(self._bundle.executable_path))

    def test_probe_plan_capability_is_probe(self):
        plan = broker.plan_capability_dispatch(self._bundle, broker.CapabilitySpec.PROBE)
        self.assertIs(plan.capability, broker.CapabilitySpec.PROBE)

    def test_probe_plan_default_wall_seconds(self):
        plan = broker.plan_capability_dispatch(self._bundle, broker.CapabilitySpec.PROBE)
        self.assertEqual(plan.max_wall_seconds, broker.MAX_WALL_SECONDS)
        self.assertLessEqual(plan.max_wall_seconds, broker.MAX_WALL_SECONDS)

    def test_probe_plan_custom_wall_seconds(self):
        plan = broker.plan_capability_dispatch(
            self._bundle, broker.CapabilitySpec.PROBE, max_wall_seconds=5.0
        )
        self.assertEqual(plan.max_wall_seconds, 5.0)

    def test_probe_plan_default_io_limits(self):
        plan = broker.plan_capability_dispatch(self._bundle, broker.CapabilitySpec.PROBE)
        self.assertEqual(plan.stdout_limit, broker.MAX_STDOUT_BYTES)
        self.assertEqual(plan.stderr_limit, broker.MAX_STDERR_BYTES)

    def test_probe_plan_custom_io_limits(self):
        plan = broker.plan_capability_dispatch(
            self._bundle, broker.CapabilitySpec.PROBE,
            stdout_limit=1024, stderr_limit=512,
        )
        self.assertEqual(plan.stdout_limit, 1024)
        self.assertEqual(plan.stderr_limit, 512)

    def test_dispatch_plan_is_frozen(self):
        plan = broker.plan_capability_dispatch(self._bundle, broker.CapabilitySpec.PROBE)
        with self.assertRaises((AttributeError, TypeError)):
            plan.exit_code = 0  # type: ignore[misc]


# ---------------------------------------------------------------------------
# plan_capability_dispatch — refusal paths

class PlanRefusalTests(BrokerTestBase):

    def test_non_staged_bundle_refused(self):
        with self.assertRaises(TypeError):
            broker.plan_capability_dispatch("not a bundle", broker.CapabilitySpec.PROBE)  # type: ignore

    def test_non_capability_spec_refused(self):
        with self.assertRaises(TypeError):
            broker.plan_capability_dispatch(self._bundle, "probe")  # type: ignore

    def test_zero_wall_seconds_refused(self):
        with self.assertRaises(ValueError):
            broker.plan_capability_dispatch(
                self._bundle, broker.CapabilitySpec.PROBE, max_wall_seconds=0.0
            )

    def test_negative_wall_seconds_refused(self):
        with self.assertRaises(ValueError):
            broker.plan_capability_dispatch(
                self._bundle, broker.CapabilitySpec.PROBE, max_wall_seconds=-1.0
            )

    def test_excessive_wall_seconds_refused(self):
        with self.assertRaises(ValueError):
            broker.plan_capability_dispatch(
                self._bundle, broker.CapabilitySpec.PROBE,
                max_wall_seconds=broker.MAX_WALL_SECONDS + 1.0,
            )

    def test_zero_stdout_limit_refused(self):
        with self.assertRaises(ValueError):
            broker.plan_capability_dispatch(
                self._bundle, broker.CapabilitySpec.PROBE, stdout_limit=0
            )

    def test_excessive_stdout_limit_refused(self):
        with self.assertRaises(ValueError):
            broker.plan_capability_dispatch(
                self._bundle, broker.CapabilitySpec.PROBE,
                stdout_limit=broker.MAX_STDOUT_BYTES + 1,
            )

    def test_zero_stderr_limit_refused(self):
        with self.assertRaises(ValueError):
            broker.plan_capability_dispatch(
                self._bundle, broker.CapabilitySpec.PROBE, stderr_limit=0
            )

    def test_excessive_stderr_limit_refused(self):
        with self.assertRaises(ValueError):
            broker.plan_capability_dispatch(
                self._bundle, broker.CapabilitySpec.PROBE,
                stderr_limit=broker.MAX_STDERR_BYTES + 1,
            )


# ---------------------------------------------------------------------------
# consume_capability_output — success paths

class ConsumeSuccessTests(BrokerTestBase):

    def _plan(self, **kwargs):
        return broker.plan_capability_dispatch(
            self._bundle, broker.CapabilitySpec.PROBE, **kwargs
        )

    def _raw(self, exit_code=0, stdout=b"", stderr=b"", wall_seconds=1.0):
        return broker.RawCapabilityOutput(
            exit_code=exit_code, stdout=stdout, stderr=stderr, wall_seconds=wall_seconds
        )

    def test_exit_zero_classified_success(self):
        result = broker.consume_capability_output(self._plan(), self._raw(exit_code=0))
        self.assertIs(result.outcome, broker.CapabilityOutcome.SUCCESS)

    def test_exit_78_with_marker_classified_not_yet_implemented(self):
        stderr = broker._NOT_YET_IMPL_MARKER + b"\n"
        raw = self._raw(exit_code=78, stderr=stderr)
        result = broker.consume_capability_output(self._plan(), raw)
        self.assertIs(result.outcome, broker.CapabilityOutcome.NOT_YET_IMPLEMENTED)
        self.assertTrue(result.not_yet_impl_marker_present)

    def test_exit_78_without_marker_classified_failure(self):
        raw = self._raw(exit_code=78, stderr=b"some other message")
        result = broker.consume_capability_output(self._plan(), raw)
        self.assertIs(result.outcome, broker.CapabilityOutcome.FAILURE)
        self.assertFalse(result.not_yet_impl_marker_present)

    def test_exit_1_classified_failure(self):
        result = broker.consume_capability_output(self._plan(), self._raw(exit_code=1))
        self.assertIs(result.outcome, broker.CapabilityOutcome.FAILURE)

    def test_result_contains_plan(self):
        plan = self._plan()
        result = broker.consume_capability_output(plan, self._raw())
        self.assertIs(result.plan, plan)

    def test_result_exit_code_preserved(self):
        result = broker.consume_capability_output(self._plan(), self._raw(exit_code=0))
        self.assertEqual(result.exit_code, 0)

    def test_result_stdout_bytes_preserved(self):
        result = broker.consume_capability_output(self._plan(), self._raw(stdout=b"hello"))
        self.assertEqual(result.stdout, b"hello")

    def test_result_stderr_bytes_preserved(self):
        result = broker.consume_capability_output(self._plan(), self._raw(stderr=b"err"))
        self.assertEqual(result.stderr, b"err")

    def test_result_wall_seconds_preserved(self):
        result = broker.consume_capability_output(self._plan(), self._raw(wall_seconds=2.5))
        self.assertAlmostEqual(result.wall_seconds, 2.5)

    def test_result_stdout_sha256_matches_bytes(self):
        payload = b"output data"
        result = broker.consume_capability_output(self._plan(), self._raw(stdout=payload))
        self.assertEqual(result.stdout_sha256, hashlib.sha256(payload).hexdigest())

    def test_result_stderr_sha256_matches_bytes(self):
        payload = b"err data"
        result = broker.consume_capability_output(self._plan(), self._raw(stderr=payload))
        self.assertEqual(result.stderr_sha256, hashlib.sha256(payload).hexdigest())

    def test_result_is_frozen(self):
        result = broker.consume_capability_output(self._plan(), self._raw())
        with self.assertRaises((AttributeError, TypeError)):
            result.exit_code = 1  # type: ignore[misc]

    def test_exact_stdout_limit_accepted(self):
        plan = self._plan(stdout_limit=16)
        raw = self._raw(stdout=b"x" * 16)
        result = broker.consume_capability_output(plan, raw)
        self.assertEqual(len(result.stdout), 16)

    def test_exact_stderr_limit_accepted(self):
        plan = self._plan(stderr_limit=8)
        raw = self._raw(stderr=b"y" * 8)
        result = broker.consume_capability_output(plan, raw)
        self.assertEqual(len(result.stderr), 8)

    def test_exact_wall_seconds_accepted(self):
        plan = self._plan(max_wall_seconds=5.0)
        raw = self._raw(wall_seconds=5.0)
        result = broker.consume_capability_output(plan, raw)
        self.assertAlmostEqual(result.wall_seconds, 5.0)


# ---------------------------------------------------------------------------
# consume_capability_output — refusal paths

class ConsumeRefusalTests(BrokerTestBase):

    def _plan(self):
        return broker.plan_capability_dispatch(self._bundle, broker.CapabilitySpec.PROBE)

    def test_non_plan_refused(self):
        raw = broker.RawCapabilityOutput(0, b"", b"", 1.0)
        with self.assertRaises(TypeError):
            broker.consume_capability_output("not a plan", raw)  # type: ignore

    def test_non_raw_refused(self):
        with self.assertRaises(TypeError):
            broker.consume_capability_output(self._plan(), "not raw")  # type: ignore

    def test_negative_exit_code_refused(self):
        raw = broker.RawCapabilityOutput(-1, b"", b"", 1.0)
        with self.assertRaises(ValueError):
            broker.consume_capability_output(self._plan(), raw)

    def test_exit_code_256_refused(self):
        raw = broker.RawCapabilityOutput(256, b"", b"", 1.0)
        with self.assertRaises(ValueError):
            broker.consume_capability_output(self._plan(), raw)

    def test_stdout_exceeding_plan_limit_refused(self):
        plan = broker.plan_capability_dispatch(
            self._bundle, broker.CapabilitySpec.PROBE, stdout_limit=4
        )
        raw = broker.RawCapabilityOutput(0, b"x" * 5, b"", 1.0)
        with self.assertRaises(ValueError):
            broker.consume_capability_output(plan, raw)

    def test_stderr_exceeding_plan_limit_refused(self):
        plan = broker.plan_capability_dispatch(
            self._bundle, broker.CapabilitySpec.PROBE, stderr_limit=4
        )
        raw = broker.RawCapabilityOutput(0, b"", b"y" * 5, 1.0)
        with self.assertRaises(ValueError):
            broker.consume_capability_output(plan, raw)

    def test_non_bytes_stdout_refused(self):
        raw = broker.RawCapabilityOutput(0, "string", b"", 1.0)  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            broker.consume_capability_output(self._plan(), raw)

    def test_non_bytes_stderr_refused(self):
        raw = broker.RawCapabilityOutput(0, b"", "string", 1.0)  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            broker.consume_capability_output(self._plan(), raw)

    def test_zero_wall_seconds_refused(self):
        raw = broker.RawCapabilityOutput(0, b"", b"", 0.0)
        with self.assertRaises(ValueError):
            broker.consume_capability_output(self._plan(), raw)

    def test_negative_wall_seconds_refused(self):
        raw = broker.RawCapabilityOutput(0, b"", b"", -1.0)
        with self.assertRaises(ValueError):
            broker.consume_capability_output(self._plan(), raw)

    def test_wall_seconds_exceeding_plan_refused(self):
        plan = broker.plan_capability_dispatch(
            self._bundle, broker.CapabilitySpec.PROBE, max_wall_seconds=5.0
        )
        raw = broker.RawCapabilityOutput(0, b"", b"", 5.1)
        with self.assertRaises(ValueError):
            broker.consume_capability_output(plan, raw)


if __name__ == "__main__":
    unittest.main()
