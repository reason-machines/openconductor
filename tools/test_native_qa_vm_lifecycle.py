"""Adversarial lifecycle integration tests for the full allocation-to-disposal chain.

These tests exercise the source pipeline end-to-end using synthetic inputs and
real filesystem operations, proving that:

  1. The full chain (stage → alloc → plan → execute with fake runner → consume
     → dispose) succeeds with consistent identity through each hand-off.
  2. After disposal, re-execution is refused by the OS: the staged executable
     no longer exists, so subprocess.run raises FileNotFoundError (OSError).
     This proves that dispose_staged_bundle revokes execution authority for
     the allocation path.
  3. A mid-execution identity change (resource file mutated between
     produce_guest_allocation and execute_capability_plan) is detected and
     refused before the subprocess starts.
  4. Mismatched bundle/allocation identity is refused by the broker before
     any execution attempt.

Scope and limits
----------------
* Fake runner scripts (Python shims) are used for execute_capability_plan;
  they never represent the real Mach-O runner.
* No VZ framework, no Mac entitlements, no native execution.
* These tests prove source-layer enforcement of allocation authority.
  They do NOT prove filesystem confinement, native isolation, or that the
  real runner exits 0.  E1 retains sole native executor responsibility.
* The lstat→rmtree TOCTOU gap documented in dispose_staged_bundle is not
  closed by these tests; see the function's docstring.
"""
import hashlib
import io
import os
import pathlib
import plistlib
import shutil
import stat
import sys
import tempfile
import textwrap
import unittest
import zipfile

from tools import native_qa_vm_alloc as alloc
from tools import native_qa_vm_broker as broker
from tools import native_qa_vm_executor as executor
from tools import native_qa_vm_receipt as policy
from tools import native_qa_vm_staging as staging

# ---------------------------------------------------------------------------
# Synthetic archive construction (mirrors test_native_qa_vm_staging.py helpers)

_SOURCE = "b" * 40
_REPO_ID = 3
_RUN_ID = 4
_ATTEMPT = 1

_FAKE_EXE = b"\xcf\xfa\xed\xfe" + b"\x00" * 60   # Mach-O magic + padding
_FAKE_PLIST = plistlib.dumps({
    "CFBundleIdentifier": policy.BUNDLE_ID,
    "CFBundleExecutable": policy.EXECUTABLE.rsplit("/", 1)[1],
})
_FAKE_CODESIG = b"lifecycle-codesig"


def _build_id() -> str:
    return f"github-actions:{_REPO_ID}:{_RUN_ID}:{_ATTEMPT}:{policy.JOB}"


def _make_archive(exe_bytes: bytes = _FAKE_EXE) -> bytes:
    exe_sha = hashlib.sha256(exe_bytes).hexdigest()
    build_id = _build_id()
    receipt = policy._canonical({
        "schema": 1, "repository": policy.REPOSITORY,
        "source_commit": _SOURCE, "build_id": build_id,
        "executable_sha256": exe_sha,
    })
    manifest = policy._canonical({
        "schema": 1, "repository": policy.REPOSITORY,
        "repository_id": _REPO_ID, "source_commit": _SOURCE,
        "workflow_path": policy.WORKFLOW, "workflow_commit": _SOURCE,
        "run_id": _RUN_ID, "run_attempt": _ATTEMPT, "job_key": policy.JOB,
        "event": "push", "ref": "refs/heads/main",
        "build_id": build_id, "bundle_id": policy.BUNDLE_ID,
        "executable": policy.EXECUTABLE, "architecture": "arm64",
        "minimum_macos": "15.0", "sdk_version": "15.0",
        "clang_version": "clang-1700", "signing_mode": "ad-hoc",
        "receipt_sha256": hashlib.sha256(receipt).hexdigest(),
    })
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


def _write_resource(path: str, content: bytes, mode: int = 0o600) -> None:
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    try:
        os.write(fd, content)
    finally:
        os.close(fd)


# ---------------------------------------------------------------------------
# Fake runner factory.
#
# A "fake runner" is a small Python script written to a temp file and
# staged in place of the Mach-O binary.  It exits with a chosen code and
# writes chosen bytes to stdout/stderr so execute_capability_plan + consume
# can be exercised with predictable results.  It is never executed as the
# real runner; it only validates the source composition seam.

def _fake_runner_script(exit_code: int, stderr_text: bytes = b"") -> bytes:
    """Return a Python script source that exits exit_code and writes stderr_text."""
    escaped = stderr_text.decode("latin-1").replace("\\", "\\\\").replace('"', '\\"')
    return textwrap.dedent(f"""\
        #!/usr/bin/env python3
        import sys
        sys.stderr.buffer.write(b"{escaped}")
        sys.exit({exit_code})
    """).encode()


def _make_archive_with_fake_runner(exit_code: int, stderr_text: bytes = b"") -> bytes:
    """Return a valid bundle archive whose 'executable' is a Python fake runner."""
    return _make_archive(exe_bytes=_fake_runner_script(exit_code, stderr_text))


# ---------------------------------------------------------------------------

class LifecycleTests(unittest.TestCase):
    """End-to-end adversarial lifecycle tests for the allocation-to-disposal chain."""

    def setUp(self) -> None:
        self._tmpdir = os.path.realpath(tempfile.mkdtemp(prefix="oc-lifecycle-test-"))

    def tearDown(self) -> None:
        shutil.rmtree(self._tmpdir, ignore_errors=True)

    def _target(self, name: str = "staged") -> pathlib.Path:
        return pathlib.Path(self._tmpdir) / name

    def _resource_path(self, name: str, size: int = 32) -> str:
        p = os.path.join(self._tmpdir, name)
        _write_resource(p, b"x" * size)
        return p

    # ------------------------------------------------------------------
    # 1. Happy-path: full chain succeeds with fake runner

    def test_full_chain_exit_zero(self) -> None:
        """stage → alloc → plan → execute (fake runner exit 0) → consume → dispose."""
        data = _make_archive_with_fake_runner(exit_code=0, stderr_text=b"")
        target = self._target()
        bundle = staging.stage_retained_bundle(data, target)
        disk = self._resource_path("disk.img")
        aux  = self._resource_path("aux.bin", size=16)
        allocation = alloc.produce_guest_allocation(
            bundle, disk, aux, max_disk_bytes=1024, max_aux_bytes=1024,
        )
        plan = broker.plan_capability_dispatch_with_allocation(
            bundle, broker.CapabilitySpec.PROBE, allocation,
        )

        # Replace the staged executable with the fake runner script.
        bundle.executable_path.chmod(0o755)
        bundle.executable_path.write_bytes(_fake_runner_script(0))
        bundle.executable_path.chmod(0o755)

        raw = executor.execute_capability_plan(plan)
        result = broker.consume_capability_output(plan, raw)
        self.assertEqual(result.outcome, broker.CapabilityOutcome.SUCCESS)
        self.assertEqual(result.exit_code, 0)

        staging.dispose_staged_bundle(bundle)
        self.assertFalse(bundle.staged_path.exists(),
                         "staged directory must be gone after disposal")

    def test_full_chain_exit_78_not_yet_implemented(self) -> None:
        """stage → alloc → plan → execute (exit 78 stub) → consume → dispose."""
        marker = broker._NOT_YET_IMPL_MARKER
        data = _make_archive_with_fake_runner(exit_code=78, stderr_text=marker)
        target = self._target()
        bundle = staging.stage_retained_bundle(data, target)
        disk = self._resource_path("disk.img")
        aux  = self._resource_path("aux.bin", size=16)
        allocation = alloc.produce_guest_allocation(
            bundle, disk, aux, max_disk_bytes=1024, max_aux_bytes=1024,
        )
        plan = broker.plan_capability_dispatch_with_allocation(
            bundle, broker.CapabilitySpec.PROBE, allocation,
        )

        bundle.executable_path.chmod(0o755)
        bundle.executable_path.write_bytes(_fake_runner_script(78, marker))
        bundle.executable_path.chmod(0o755)

        raw = executor.execute_capability_plan(plan)
        result = broker.consume_capability_output(plan, raw)
        self.assertEqual(result.outcome, broker.CapabilityOutcome.NOT_YET_IMPLEMENTED)
        self.assertTrue(result.not_yet_impl_marker_present)

        staging.dispose_staged_bundle(bundle)
        self.assertFalse(bundle.staged_path.exists())

    # ------------------------------------------------------------------
    # 2. Post-disposal re-execution is refused by the OS
    #    (proves disposal revokes execution authority)

    def test_re_execute_after_dispose_raises_oserror(self) -> None:
        """After dispose_staged_bundle, execute_capability_plan raises OSError.

        This is the key adversarial test for allocation authority: once the
        staged directory is removed, the executable path in plan.argv[0] no
        longer exists, and subprocess.run raises FileNotFoundError (a subclass
        of OSError).  The GuestAllocation and DispatchPlan records are still
        valid Python objects, but execution is denied at the OS level.

        This does NOT prove that a concurrent execution was interrupted, only
        that a sequential re-use attempt after disposal fails.
        """
        data = _make_archive_with_fake_runner(exit_code=0)
        bundle = staging.stage_retained_bundle(data, self._target())
        disk = self._resource_path("disk_re.img")
        aux  = self._resource_path("aux_re.bin", size=16)
        allocation = alloc.produce_guest_allocation(
            bundle, disk, aux, max_disk_bytes=1024, max_aux_bytes=1024,
        )
        plan = broker.plan_capability_dispatch_with_allocation(
            bundle, broker.CapabilitySpec.PROBE, allocation,
        )
        # Dispose BEFORE execution.
        staging.dispose_staged_bundle(bundle)
        self.assertFalse(bundle.staged_path.exists())

        # execute_capability_plan must raise OSError because argv[0] is gone.
        with self.assertRaises(OSError):
            executor.execute_capability_plan(plan)

    def test_re_execute_after_dispose_does_not_reach_consumer(self) -> None:
        """consume_capability_output is never reached when execute raises after disposal."""
        data = _make_archive_with_fake_runner(exit_code=0)
        bundle = staging.stage_retained_bundle(data, self._target("re2"))
        disk = self._resource_path("disk_re2.img")
        aux  = self._resource_path("aux_re2.bin", size=16)
        allocation = alloc.produce_guest_allocation(
            bundle, disk, aux, max_disk_bytes=1024, max_aux_bytes=1024,
        )
        plan = broker.plan_capability_dispatch_with_allocation(
            bundle, broker.CapabilitySpec.PROBE, allocation,
        )
        staging.dispose_staged_bundle(bundle)

        raised = False
        try:
            raw = executor.execute_capability_plan(plan)
            # If we somehow get here, consume should never be called on stale data.
            broker.consume_capability_output(plan, raw)
        except OSError:
            raised = True
        self.assertTrue(raised, "OSError must be raised before consume is reached")

    # ------------------------------------------------------------------
    # 3. Identity change detected before execution
    #    (proves recheck_resource_identity guards the allocation path)

    def test_changed_disk_identity_refused_before_subprocess(self) -> None:
        """Mutating disk between alloc and execute raises ValueError before subprocess."""
        data = _make_archive_with_fake_runner(exit_code=0)
        bundle = staging.stage_retained_bundle(data, self._target("id1"))
        disk = self._resource_path("disk_id1.img")
        aux  = self._resource_path("aux_id1.bin", size=16)
        allocation = alloc.produce_guest_allocation(
            bundle, disk, aux, max_disk_bytes=1024, max_aux_bytes=1024,
        )
        plan = broker.plan_capability_dispatch_with_allocation(
            bundle, broker.CapabilitySpec.PROBE, allocation,
        )
        # Mutate disk content (changes size → identity mismatch).
        with open(disk, "wb") as fh:
            fh.write(b"z" * 128)

        with self.assertRaises(ValueError,
                               msg="changed disk must be refused before subprocess"):
            executor.execute_capability_plan(plan)

    def test_changed_aux_identity_refused_before_subprocess(self) -> None:
        """Mutating aux between alloc and execute raises ValueError before subprocess."""
        data = _make_archive_with_fake_runner(exit_code=0)
        bundle = staging.stage_retained_bundle(data, self._target("id2"))
        disk = self._resource_path("disk_id2.img")
        aux  = self._resource_path("aux_id2.bin", size=16)
        allocation = alloc.produce_guest_allocation(
            bundle, disk, aux, max_disk_bytes=1024, max_aux_bytes=1024,
        )
        plan = broker.plan_capability_dispatch_with_allocation(
            bundle, broker.CapabilitySpec.PROBE, allocation,
        )
        with open(aux, "wb") as fh:
            fh.write(b"z" * 128)

        with self.assertRaises(ValueError,
                               msg="changed aux must be refused before subprocess"):
            executor.execute_capability_plan(plan)

    def test_identity_check_precedes_subprocess_via_exit_flag(self) -> None:
        """Proves recheck runs before subprocess: mutated resource refuses even when
        a fake runner would succeed.  Uses an exit-0 runner so the subprocess
        path itself is known-good; the ValueError from recheck must precede it."""
        data = _make_archive_with_fake_runner(exit_code=0)
        bundle = staging.stage_retained_bundle(data, self._target("id3"))
        disk = self._resource_path("disk_id3.img")
        aux  = self._resource_path("aux_id3.bin", size=16)
        allocation = alloc.produce_guest_allocation(
            bundle, disk, aux, max_disk_bytes=1024, max_aux_bytes=1024,
        )
        plan = broker.plan_capability_dispatch_with_allocation(
            bundle, broker.CapabilitySpec.PROBE, allocation,
        )
        # Remove the disk file (triggers FileNotFoundError → wrapped as ValueError
        # inside recheck_resource_identity).
        os.unlink(disk)

        with self.assertRaises(ValueError):
            executor.execute_capability_plan(plan)

    # ------------------------------------------------------------------
    # 4. Broker refuses allocation/bundle identity mismatch before any execution

    def test_broker_refuses_mismatched_source_commit(self) -> None:
        """plan_capability_dispatch_with_allocation refuses alloc with wrong source_commit."""
        data = _make_archive()
        bundle = staging.stage_retained_bundle(data, self._target("mismatch1"))
        disk = self._resource_path("disk_m1.img")
        aux  = self._resource_path("aux_m1.bin", size=16)
        # Build a valid allocation for a bundle with DIFFERENT source identity
        # by patching the bundle's source_commit through the allocation directly.
        # We produce the allocation, then try to plan against a different bundle.
        import dataclasses
        forged_alloc = dataclasses.replace(
            alloc.produce_guest_allocation(
                bundle, disk, aux, max_disk_bytes=1024, max_aux_bytes=1024,
            ),
            source_commit="c" * 40,
        )
        with self.assertRaises(ValueError,
                               msg="mismatched source_commit must be refused by broker"):
            broker.plan_capability_dispatch_with_allocation(
                bundle, broker.CapabilitySpec.PROBE, forged_alloc,
            )

    def test_broker_refuses_mismatched_build_id(self) -> None:
        """plan_capability_dispatch_with_allocation refuses alloc with wrong build_id."""
        data = _make_archive()
        bundle = staging.stage_retained_bundle(data, self._target("mismatch2"))
        disk = self._resource_path("disk_m2.img")
        aux  = self._resource_path("aux_m2.bin", size=16)
        import dataclasses
        forged_alloc = dataclasses.replace(
            alloc.produce_guest_allocation(
                bundle, disk, aux, max_disk_bytes=1024, max_aux_bytes=1024,
            ),
            build_id="wrong-build-id",
        )
        with self.assertRaises(ValueError,
                               msg="mismatched build_id must be refused by broker"):
            broker.plan_capability_dispatch_with_allocation(
                bundle, broker.CapabilitySpec.PROBE, forged_alloc,
            )

    # ------------------------------------------------------------------
    # 5. Disposal is idempotent-safe: second dispose raises OSError
    #    (proves staged_path state is checked, not silently ignored)

    def test_double_dispose_raises_oserror(self) -> None:
        """Calling dispose_staged_bundle twice raises OSError on the second call."""
        data = _make_archive()
        bundle = staging.stage_retained_bundle(data, self._target("double"))
        staging.dispose_staged_bundle(bundle)
        self.assertFalse(bundle.staged_path.exists())
        # Second dispose: lstat on a missing path raises FileNotFoundError (OSError).
        with self.assertRaises(OSError):
            staging.dispose_staged_bundle(bundle)


if __name__ == "__main__":
    unittest.main()
