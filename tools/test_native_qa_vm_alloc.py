"""Cloud-safe tests for native_qa_vm_alloc.

All tests use synthetic temporary files; no VZ runtime, no disk images,
no VMs, no native execution, no network.  Size limits are overridden to
small values so tests run on tiny synthetic files.

Coverage
--------
produce_guest_allocation:
  * basic success: returns correct type and fields
  * binds bundle source_commit and build_id
  * refuses wrong bundle type
  * refuses non-existent disk path
  * refuses non-existent aux path
  * refuses disk too large (exceeds max_disk_bytes)
  * refuses aux too large (exceeds max_aux_bytes)
  * refuses same-inode disk and aux
  * refuses hard-linked disk
  * refuses symlink in disk path ancestry (via symlink to temp dir)

recheck_resource_identity:
  * passes when file unchanged
  * detects size change (truncation)
  * detects removed file
  * refuses wrong type argument

build_allocation_argv:
  * returns correct 4-tuple (--disk, path, --aux, path)
  * refuses wrong type argument

GuestAllocation:
  * construction validates distinct inodes
  * construction validates 40-hex source_commit
  * construction validates non-empty build_id

plan_capability_dispatch_with_allocation:
  * argv includes --disk and --aux
  * plan.allocation matches the GuestAllocation
  * refuses mismatched source_commit
  * refuses mismatched build_id

execute_capability_plan with allocation:
  * identity unchanged: subprocess runs normally
  * identity changed before run: raises ValueError before subprocess
"""
from __future__ import annotations

import hashlib
import os
import stat
import tempfile
import textwrap
import unittest
from pathlib import Path

import plistlib as _plistlib

from tools import native_qa_vm_alloc as alloc
from tools import native_qa_vm_broker as broker
from tools import native_qa_vm_executor as executor
from tools import native_qa_vm_receipt as policy
from tools import native_qa_vm_staging as staging

# ---------------------------------------------------------------------------
# Shared synthetic bundle helpers (mirrors test_native_qa_vm_staging patterns).

_SOURCE = "c" * 40
_REPO_ID = 7
_RUN_ID = 42
_ATTEMPT = 1
_FAKE_EXE = b"\xcf\xfa\xed\xfe" + b"\x00" * 60
_FAKE_PLIST = _plistlib.dumps({
    "CFBundleIdentifier": policy.BUNDLE_ID,
    "CFBundleExecutable": policy.EXECUTABLE.rsplit("/", 1)[1],
})
_FAKE_CODESIG = b"codesig-placeholder"
_BUNDLE_APP = "OpenConductorQAVMRunner.app"
_EXEC_SUBPATH = "Contents/MacOS/OpenConductorQAVMRunner"


def _build_id():
    return f"github-actions:{_REPO_ID}:{_RUN_ID}:{_ATTEMPT}:{policy.JOB}"


def _make_staged_bundle(staged_root: str, exe_bytes: bytes = _FAKE_EXE) -> staging.StagedBundle:
    """Return a minimal StagedBundle with a fake executable written to staged_root."""
    exe_sha = hashlib.sha256(exe_bytes).hexdigest()
    exec_dir = os.path.join(staged_root, _BUNDLE_APP, "Contents", "MacOS")
    os.makedirs(exec_dir, exist_ok=True)
    exe_path = os.path.join(exec_dir, "OpenConductorQAVMRunner")
    with open(exe_path, "wb") as fh:
        fh.write(exe_bytes)
    os.chmod(exe_path, 0o755)
    staged_path = Path(staged_root)
    app_path = staged_path / _BUNDLE_APP
    return staging.StagedBundle(
        source_commit=_SOURCE,
        build_id=_build_id(),
        executable_sha256=exe_sha,
        staged_path=staged_path,
        app_path=app_path,
        executable_path=Path(exe_path),
    )


def _write_tmp_file(directory: str, content: bytes = b"x" * 16) -> str:
    """Write a small temp file and return its absolute path."""
    path = os.path.join(directory, "resource")
    with open(path, "wb") as fh:
        fh.write(content)
    return path


def _write_fake_runner(staged_root: str, source: str) -> str:
    """Write a Python script as the staged executable; return its path."""
    exec_dir = os.path.join(staged_root, _BUNDLE_APP, "Contents", "MacOS")
    os.makedirs(exec_dir, exist_ok=True)
    path = os.path.join(exec_dir, "OpenConductorQAVMRunner")
    full_source = "#!/usr/bin/env python3\n" + textwrap.dedent(source)
    with open(path, "w") as fh:
        fh.write(full_source)
    os.chmod(path, stat.S_IRWXU | stat.S_IRGRP | stat.S_IXGRP | stat.S_IROTH | stat.S_IXOTH)
    return path


# ---------------------------------------------------------------------------
# Tests: produce_guest_allocation.

class TestProduceGuestAllocation(unittest.TestCase):

    def setUp(self):
        self._tmp = tempfile.mkdtemp(prefix="oc-alloc-test-")

    def _bundle(self):
        return _make_staged_bundle(self._tmp)

    def _two_files(self):
        disk = os.path.join(self._tmp, "disk.img")
        aux = os.path.join(self._tmp, "aux.bin")
        with open(disk, "wb") as fh:
            fh.write(b"d" * 32)
        with open(aux, "wb") as fh:
            fh.write(b"a" * 16)
        return disk, aux

    def test_returns_guest_allocation(self):
        bundle = self._bundle()
        disk, aux = self._two_files()
        result = alloc.produce_guest_allocation(
            bundle, disk, aux,
            max_disk_bytes=1024, max_aux_bytes=1024,
        )
        self.assertIsInstance(result, alloc.GuestAllocation)

    def test_binds_bundle_source_commit(self):
        bundle = self._bundle()
        disk, aux = self._two_files()
        result = alloc.produce_guest_allocation(
            bundle, disk, aux,
            max_disk_bytes=1024, max_aux_bytes=1024,
        )
        self.assertEqual(result.source_commit, bundle.source_commit)

    def test_binds_bundle_build_id(self):
        bundle = self._bundle()
        disk, aux = self._two_files()
        result = alloc.produce_guest_allocation(
            bundle, disk, aux,
            max_disk_bytes=1024, max_aux_bytes=1024,
        )
        self.assertEqual(result.build_id, bundle.build_id)

    def test_captures_distinct_identities(self):
        bundle = self._bundle()
        disk, aux = self._two_files()
        result = alloc.produce_guest_allocation(
            bundle, disk, aux,
            max_disk_bytes=1024, max_aux_bytes=1024,
        )
        # Different paths → different identities.
        self.assertNotEqual(result.disk.ino, result.aux.ino)
        self.assertEqual(result.disk.path, os.path.abspath(disk))
        self.assertEqual(result.aux.path, os.path.abspath(aux))

    def test_wrong_bundle_type_raises_type_error(self):
        _, aux = self._two_files()
        disk = os.path.join(self._tmp, "disk2.img")
        with open(disk, "wb") as fh:
            fh.write(b"d" * 32)
        with self.assertRaises(TypeError):
            alloc.produce_guest_allocation(
                "not-a-bundle", disk, aux,  # type: ignore[arg-type]
                max_disk_bytes=1024, max_aux_bytes=1024,
            )

    def test_missing_disk_raises_value_error(self):
        bundle = self._bundle()
        _, aux = self._two_files()
        with self.assertRaises(ValueError):
            alloc.produce_guest_allocation(
                bundle, "/nonexistent/disk.img", aux,
                max_disk_bytes=1024, max_aux_bytes=1024,
            )

    def test_missing_aux_raises_value_error(self):
        bundle = self._bundle()
        disk, _ = self._two_files()
        with self.assertRaises(ValueError):
            alloc.produce_guest_allocation(
                bundle, disk, "/nonexistent/aux.bin",
                max_disk_bytes=1024, max_aux_bytes=1024,
            )

    def test_disk_exceeds_max_raises_value_error(self):
        bundle = self._bundle()
        disk, aux = self._two_files()
        with self.assertRaises(ValueError):
            alloc.produce_guest_allocation(
                bundle, disk, aux,
                max_disk_bytes=4,  # disk is 32 bytes
                max_aux_bytes=1024,
            )

    def test_aux_exceeds_max_raises_value_error(self):
        bundle = self._bundle()
        disk, aux = self._two_files()
        with self.assertRaises(ValueError):
            alloc.produce_guest_allocation(
                bundle, disk, aux,
                max_disk_bytes=1024,
                max_aux_bytes=4,  # aux is 16 bytes
            )

    def test_same_inode_disk_and_aux_raises_value_error(self):
        bundle = self._bundle()
        disk, _ = self._two_files()
        # Pass the same file for both disk and aux.
        with self.assertRaises(ValueError):
            alloc.produce_guest_allocation(
                bundle, disk, disk,
                max_disk_bytes=1024, max_aux_bytes=1024,
            )

    def test_hard_linked_disk_raises_value_error(self):
        bundle = self._bundle()
        disk, aux = self._two_files()
        link = os.path.join(self._tmp, "disk_link.img")
        os.link(disk, link)  # hard link: nlink becomes 2
        with self.assertRaises(ValueError):
            alloc.produce_guest_allocation(
                bundle, link, aux,
                max_disk_bytes=1024, max_aux_bytes=1024,
            )

    def test_symlink_disk_path_raises_value_error(self):
        bundle = self._bundle()
        disk, aux = self._two_files()
        link = os.path.join(self._tmp, "disk_symlink.img")
        os.symlink(disk, link)
        with self.assertRaises(ValueError):
            alloc.produce_guest_allocation(
                bundle, link, aux,
                max_disk_bytes=1024, max_aux_bytes=1024,
            )


# ---------------------------------------------------------------------------
# Tests: recheck_resource_identity.

class TestRecheckResourceIdentity(unittest.TestCase):

    def setUp(self):
        self._tmp = tempfile.mkdtemp(prefix="oc-recheck-test-")

    def _make_identity(self, content: bytes = b"x" * 32) -> tuple[alloc.GuestResourceIdentity, str]:
        path = os.path.join(self._tmp, "res.bin")
        with open(path, "wb") as fh:
            fh.write(content)
        # Use a minimal bundle just to call _capture_resource_identity indirectly.
        bundle_root = os.path.join(self._tmp, "staged")
        os.makedirs(bundle_root, exist_ok=True)
        # Build identity directly via the internal helper.
        identity = alloc._capture_resource_identity(
            Path(path), min_bytes=1, max_bytes=65536,
        )
        return identity, path

    def test_passes_when_file_unchanged(self):
        identity, _ = self._make_identity()
        # Should not raise.
        alloc.recheck_resource_identity(identity)

    def test_detects_size_change(self):
        identity, path = self._make_identity(b"original")
        # Truncate the file.
        with open(path, "wb") as fh:
            fh.write(b"x")
        with self.assertRaises(ValueError):
            alloc.recheck_resource_identity(identity)

    def test_detects_removed_file(self):
        identity, path = self._make_identity()
        os.unlink(path)
        with self.assertRaises(ValueError):
            alloc.recheck_resource_identity(identity)

    def test_wrong_type_raises_type_error(self):
        with self.assertRaises(TypeError):
            alloc.recheck_resource_identity("not-an-identity")  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# Tests: build_allocation_argv.

class TestBuildAllocationArgv(unittest.TestCase):

    def setUp(self):
        self._tmp = tempfile.mkdtemp(prefix="oc-argv-test-")

    def _make_allocation(self) -> alloc.GuestAllocation:
        bundle = _make_staged_bundle(self._tmp)
        disk = os.path.join(self._tmp, "disk.img")
        aux = os.path.join(self._tmp, "aux.bin")
        with open(disk, "wb") as fh:
            fh.write(b"d" * 32)
        with open(aux, "wb") as fh:
            fh.write(b"a" * 16)
        return alloc.produce_guest_allocation(
            bundle, disk, aux,
            max_disk_bytes=1024, max_aux_bytes=1024,
        )

    def test_returns_four_tuple(self):
        allocation = self._make_allocation()
        argv = alloc.build_allocation_argv(allocation)
        self.assertIsInstance(argv, tuple)
        self.assertEqual(len(argv), 4)

    def test_contains_disk_and_aux_flags(self):
        allocation = self._make_allocation()
        argv = alloc.build_allocation_argv(allocation)
        self.assertEqual(argv[0], alloc.ARG_DISK)
        self.assertEqual(argv[1], allocation.disk.path)
        self.assertEqual(argv[2], alloc.ARG_AUX)
        self.assertEqual(argv[3], allocation.aux.path)

    def test_wrong_type_raises_type_error(self):
        with self.assertRaises(TypeError):
            alloc.build_allocation_argv("not-an-allocation")  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# Tests: plan_capability_dispatch_with_allocation.

class TestPlanCapabilityDispatchWithAllocation(unittest.TestCase):

    def setUp(self):
        self._tmp = tempfile.mkdtemp(prefix="oc-plan-alloc-test-")

    def _make_bundle_and_allocation(self) -> tuple[staging.StagedBundle, alloc.GuestAllocation]:
        bundle = _make_staged_bundle(self._tmp)
        disk = os.path.join(self._tmp, "disk.img")
        aux = os.path.join(self._tmp, "aux.bin")
        with open(disk, "wb") as fh:
            fh.write(b"d" * 32)
        with open(aux, "wb") as fh:
            fh.write(b"a" * 16)
        allocation = alloc.produce_guest_allocation(
            bundle, disk, aux,
            max_disk_bytes=1024, max_aux_bytes=1024,
        )
        return bundle, allocation

    def test_argv_includes_disk_and_aux(self):
        bundle, allocation = self._make_bundle_and_allocation()
        plan = broker.plan_capability_dispatch_with_allocation(
            bundle, broker.CapabilitySpec.PROBE, allocation,
        )
        self.assertIn(alloc.ARG_DISK, plan.argv)
        self.assertIn(alloc.ARG_AUX, plan.argv)

    def test_plan_carries_allocation(self):
        bundle, allocation = self._make_bundle_and_allocation()
        plan = broker.plan_capability_dispatch_with_allocation(
            bundle, broker.CapabilitySpec.PROBE, allocation,
        )
        self.assertIs(plan.allocation, allocation)

    def test_argv_starts_with_executable(self):
        bundle, allocation = self._make_bundle_and_allocation()
        plan = broker.plan_capability_dispatch_with_allocation(
            bundle, broker.CapabilitySpec.PROBE, allocation,
        )
        self.assertEqual(plan.argv[0], str(bundle.executable_path))

    def test_refuses_mismatched_source_commit(self):
        bundle, allocation = self._make_bundle_and_allocation()
        # Build a GuestAllocation with a different source_commit.
        wrong_commit = "d" * 40
        from dataclasses import replace as _replace
        wrong_alloc = alloc.GuestAllocation(
            source_commit=wrong_commit,
            build_id=allocation.build_id,
            disk=allocation.disk,
            aux=allocation.aux,
        )
        with self.assertRaises(ValueError):
            broker.plan_capability_dispatch_with_allocation(
                bundle, broker.CapabilitySpec.PROBE, wrong_alloc,
            )

    def test_refuses_mismatched_build_id(self):
        bundle, allocation = self._make_bundle_and_allocation()
        wrong_alloc = alloc.GuestAllocation(
            source_commit=allocation.source_commit,
            build_id="wrong-build-id",
            disk=allocation.disk,
            aux=allocation.aux,
        )
        with self.assertRaises(ValueError):
            broker.plan_capability_dispatch_with_allocation(
                bundle, broker.CapabilitySpec.PROBE, wrong_alloc,
            )


# ---------------------------------------------------------------------------
# Tests: execute_capability_plan identity recheck.

class TestExecutorAllocationRecheck(unittest.TestCase):

    def setUp(self):
        self._tmp = tempfile.mkdtemp(prefix="oc-exec-alloc-test-")

    def _make_plan_with_allocation(self) -> tuple[broker.DispatchPlan, str, str]:
        """Return (plan, disk_path, aux_path) using a fake runner that exits 78."""
        runner_path = _write_fake_runner(self._tmp, """\
            import sys
            sys.stderr.buffer.write(b"VM execution is unavailable: resource identity, "
                                     b"inherited-capability, effective-profile and lifecycle "
                                     b"acceptance are not implemented.")
            sys.exit(78)
        """)
        with open(runner_path, "rb") as _fh:
            _exe_sha = hashlib.sha256(_fh.read()).hexdigest()
        bundle = staging.StagedBundle(
            source_commit=_SOURCE,
            build_id=_build_id(),
            executable_sha256=_exe_sha,
            staged_path=Path(self._tmp),
            app_path=Path(self._tmp) / _BUNDLE_APP,
            executable_path=Path(runner_path),
        )
        disk_path = os.path.join(self._tmp, "disk.img")
        aux_path = os.path.join(self._tmp, "aux.bin")
        with open(disk_path, "wb") as fh:
            fh.write(b"d" * 32)
        with open(aux_path, "wb") as fh:
            fh.write(b"a" * 16)
        allocation = alloc.produce_guest_allocation(
            bundle, disk_path, aux_path,
            max_disk_bytes=1024, max_aux_bytes=1024,
        )
        plan = broker.plan_capability_dispatch_with_allocation(
            bundle, broker.CapabilitySpec.PROBE, allocation,
        )
        return plan, disk_path, aux_path

    def test_unchanged_identity_runs_subprocess(self):
        plan, _, _ = self._make_plan_with_allocation()
        raw = executor.execute_capability_plan(plan)
        self.assertIsInstance(raw, broker.RawCapabilityOutput)

    def test_changed_disk_raises_before_subprocess(self):
        plan, disk_path, _ = self._make_plan_with_allocation()
        # Change the disk file to trigger identity mismatch.
        with open(disk_path, "wb") as fh:
            fh.write(b"z" * 64)
        with self.assertRaises(ValueError):
            executor.execute_capability_plan(plan)

    def test_changed_aux_raises_before_subprocess(self):
        plan, _, aux_path = self._make_plan_with_allocation()
        # Change the aux file.
        with open(aux_path, "wb") as fh:
            fh.write(b"z" * 64)
        with self.assertRaises(ValueError):
            executor.execute_capability_plan(plan)


# ---------------------------------------------------------------------------
# Tests for produce_guest_allocation_with_hardware and extended build_allocation_argv.

class TestProduceGuestAllocationWithHardware(unittest.TestCase):
    """Tests for produce_guest_allocation_with_hardware.

    Uses tiny synthetic files; no VZ runtime, no real hardware blobs.
    """

    def setUp(self):
        self._tmp = tempfile.mkdtemp()
        self._staged = _make_staged_bundle(self._tmp)
        self._disk = Path(self._tmp) / "disk.img"
        self._aux = Path(self._tmp) / "aux.nvram"
        self._hw = Path(self._tmp) / "hardware_model.bin"
        self._mid = Path(self._tmp) / "machine_id.bin"
        self._disk.write_bytes(b"d" * 32)
        self._aux.write_bytes(b"a" * 32)
        self._hw.write_bytes(b"h" * 64)
        self._mid.write_bytes(b"m" * 64)

    def tearDown(self):
        import shutil
        shutil.rmtree(self._tmp, ignore_errors=True)

    def test_returns_guest_allocation(self):
        result = alloc.produce_guest_allocation_with_hardware(
            self._staged, self._disk, self._aux, self._hw, self._mid,
            max_disk_bytes=4096, max_aux_bytes=4096,
            max_hardware_model_bytes=4096, max_machine_id_bytes=4096,
        )
        self.assertIsInstance(result, alloc.GuestAllocation)

    def test_hardware_model_and_machine_id_populated(self):
        result = alloc.produce_guest_allocation_with_hardware(
            self._staged, self._disk, self._aux, self._hw, self._mid,
            max_disk_bytes=4096, max_aux_bytes=4096,
            max_hardware_model_bytes=4096, max_machine_id_bytes=4096,
        )
        self.assertIsNotNone(result.hardware_model)
        self.assertIsNotNone(result.machine_id)
        # Path is stored via os.path.abspath; check basename to avoid symlink-resolution differences.
        self.assertTrue(result.hardware_model.path.endswith("hardware_model.bin"))  # type: ignore
        self.assertTrue(result.machine_id.path.endswith("machine_id.bin"))          # type: ignore

    def test_binds_bundle_identity(self):
        result = alloc.produce_guest_allocation_with_hardware(
            self._staged, self._disk, self._aux, self._hw, self._mid,
            max_disk_bytes=4096, max_aux_bytes=4096,
            max_hardware_model_bytes=4096, max_machine_id_bytes=4096,
        )
        self.assertEqual(result.source_commit, _SOURCE)

    def test_refuses_missing_hardware_model(self):
        missing = Path(self._tmp) / "no_hw.bin"
        with self.assertRaises((ValueError, OSError)):
            alloc.produce_guest_allocation_with_hardware(
                self._staged, self._disk, self._aux, missing, self._mid,
                max_disk_bytes=4096, max_aux_bytes=4096,
                max_hardware_model_bytes=4096, max_machine_id_bytes=4096,
            )

    def test_refuses_missing_machine_id(self):
        missing = Path(self._tmp) / "no_mid.bin"
        with self.assertRaises((ValueError, OSError)):
            alloc.produce_guest_allocation_with_hardware(
                self._staged, self._disk, self._aux, self._hw, missing,
                max_disk_bytes=4096, max_aux_bytes=4096,
                max_hardware_model_bytes=4096, max_machine_id_bytes=4096,
            )

    def test_refuses_duplicate_hw_inode_as_disk(self):
        # hardware_model must be a distinct inode from disk.
        with self.assertRaises(ValueError):
            alloc.produce_guest_allocation_with_hardware(
                self._staged, self._disk, self._aux, self._disk, self._mid,
                max_disk_bytes=4096, max_aux_bytes=4096,
                max_hardware_model_bytes=4096, max_machine_id_bytes=4096,
            )

    def test_refuses_hw_exceeds_max(self):
        big = Path(self._tmp) / "big_hw.bin"
        big.write_bytes(b"x" * 128)
        with self.assertRaises(ValueError):
            alloc.produce_guest_allocation_with_hardware(
                self._staged, self._disk, self._aux, big, self._mid,
                max_disk_bytes=4096, max_aux_bytes=4096,
                max_hardware_model_bytes=64, max_machine_id_bytes=4096,
            )


class TestBuildAllocationArgvWithHardware(unittest.TestCase):
    """Tests for build_allocation_argv with hardware_model and machine_id."""

    def setUp(self):
        self._tmp = tempfile.mkdtemp()
        self._staged = _make_staged_bundle(self._tmp)
        self._disk = Path(self._tmp) / "disk.img"
        self._aux = Path(self._tmp) / "aux.nvram"
        self._hw = Path(self._tmp) / "hw.bin"
        self._mid = Path(self._tmp) / "mid.bin"
        for p in (self._disk, self._aux, self._hw, self._mid):
            p.write_bytes(b"x" * 32)

    def tearDown(self):
        import shutil
        shutil.rmtree(self._tmp, ignore_errors=True)

    def _make_full_alloc(self):
        return alloc.produce_guest_allocation_with_hardware(
            self._staged, self._disk, self._aux, self._hw, self._mid,
            max_disk_bytes=4096, max_aux_bytes=4096,
            max_hardware_model_bytes=4096, max_machine_id_bytes=4096,
        )

    def test_returns_eight_tuple_with_hardware(self):
        a = self._make_full_alloc()
        argv = alloc.build_allocation_argv(a)
        self.assertEqual(len(argv), 8)

    def test_includes_hardware_model_flag(self):
        a = self._make_full_alloc()
        argv = alloc.build_allocation_argv(a)
        self.assertIn(alloc.ARG_HARDWARE_MODEL, argv)

    def test_includes_machine_id_flag(self):
        a = self._make_full_alloc()
        argv = alloc.build_allocation_argv(a)
        self.assertIn(alloc.ARG_MACHINE_ID, argv)

    def test_hardware_model_path_in_argv(self):
        a = self._make_full_alloc()
        argv = alloc.build_allocation_argv(a)
        hw_idx = argv.index(alloc.ARG_HARDWARE_MODEL)
        self.assertTrue(argv[hw_idx + 1].endswith("hw.bin"))

    def test_machine_id_path_in_argv(self):
        a = self._make_full_alloc()
        argv = alloc.build_allocation_argv(a)
        mid_idx = argv.index(alloc.ARG_MACHINE_ID)
        self.assertTrue(argv[mid_idx + 1].endswith("mid.bin"))

    def test_partial_hardware_raises_value_error(self):
        # Allocate without hardware, then manually construct partial GuestAllocation.
        base_alloc = alloc.produce_guest_allocation(
            self._staged, self._disk, self._aux,
            max_disk_bytes=4096, max_aux_bytes=4096,
        )
        # hardware_model set but machine_id = None → ValueError
        import dataclasses
        partial = dataclasses.replace(base_alloc,
                                       hardware_model=base_alloc.disk,
                                       machine_id=None)
        with self.assertRaises(ValueError):
            alloc.build_allocation_argv(partial)


class DisposeGuestDiskTests(unittest.TestCase):
    """Cloud-safe tests for dispose_guest_disk; synthetic tempfiles only.

    No VZ runtime, no real disk images, no native execution.
    """

    def setUp(self):
        self._tmp = tempfile.mkdtemp()
        self._staged = _make_staged_bundle(self._tmp)
        self._disk = Path(self._tmp) / "disk.img"
        self._aux = Path(self._tmp) / "aux.bin"
        self._disk.write_bytes(b"d" * 64)
        self._aux.write_bytes(b"a" * 32)

    def tearDown(self):
        import shutil
        shutil.rmtree(self._tmp, ignore_errors=True)

    def _make_alloc(self):
        return alloc.produce_guest_allocation(
            self._staged, self._disk, self._aux,
            max_disk_bytes=4096, max_aux_bytes=4096,
        )

    def test_removes_disk_image(self):
        a = self._make_alloc()
        self.assertTrue(self._disk.exists())
        alloc.dispose_guest_disk(a)
        self.assertFalse(self._disk.exists())

    def test_does_not_remove_aux_storage(self):
        a = self._make_alloc()
        alloc.dispose_guest_disk(a)
        self.assertTrue(self._aux.exists())

    def test_returns_receipt_with_matching_identity(self):
        a = self._make_alloc()
        receipt = alloc.dispose_guest_disk(a)
        self.assertEqual(receipt.disk_path, a.disk.path)
        self.assertEqual(receipt.disk_ino, a.disk.ino)
        self.assertEqual(receipt.disk_dev, a.disk.dev)
        self.assertEqual(receipt.disk_size, a.disk.size)

    def test_receipt_host_filesystem_coverage_verified_is_false(self):
        a = self._make_alloc()
        receipt = alloc.dispose_guest_disk(a)
        self.assertFalse(receipt.host_filesystem_coverage_verified)

    def test_receipt_disk_identity_verified_before_removal_is_true(self):
        a = self._make_alloc()
        receipt = alloc.dispose_guest_disk(a)
        self.assertTrue(receipt.disk_identity_verified_before_removal)

    def test_receipt_toctou_note_non_empty(self):
        a = self._make_alloc()
        receipt = alloc.dispose_guest_disk(a)
        self.assertTrue(receipt.toctou_note)
        self.assertIn("TOCTOU", receipt.toctou_note)

    def test_receipt_scope_does_not_claim_host_unmodified_as_observed(self):
        a = self._make_alloc()
        receipt = alloc.dispose_guest_disk(a)
        # Must not assert an observation-based claim of host coverage.
        self.assertIn("architectural claim", receipt.scope)
        self.assertIn("not an observation", receipt.scope)

    def test_receipt_disposed_at_is_parseable_iso_timestamp(self):
        a = self._make_alloc()
        receipt = alloc.dispose_guest_disk(a)
        from datetime import datetime
        # Must not raise.
        datetime.fromisoformat(receipt.disposed_at)

    def test_refuses_wrong_type(self):
        with self.assertRaises(TypeError):
            alloc.dispose_guest_disk("not an allocation")  # type: ignore[arg-type]

    def test_refuses_when_disk_already_removed(self):
        a = self._make_alloc()
        self._disk.unlink()
        with self.assertRaises(ValueError):
            alloc.dispose_guest_disk(a)

    def test_refuses_when_disk_size_changed_since_allocation(self):
        a = self._make_alloc()
        self._disk.write_bytes(b"d" * 128)  # size changed
        with self.assertRaises(ValueError):
            alloc.dispose_guest_disk(a)
        # Disk must NOT have been removed: refusal happens before unlink.
        self.assertTrue(self._disk.exists())

    def test_refuses_when_disk_replaced_with_symlink(self):
        a = self._make_alloc()
        self._disk.unlink()
        decoy = Path(self._tmp) / "decoy.img"
        decoy.write_bytes(b"d" * 64)
        self._disk.symlink_to(decoy)
        with self.assertRaises(ValueError):
            alloc.dispose_guest_disk(a)
        # Decoy must survive: refusal happens before any removal attempt.
        self.assertTrue(decoy.exists())

    def test_double_dispose_raises_on_second_call(self):
        a = self._make_alloc()
        alloc.dispose_guest_disk(a)
        with self.assertRaises(ValueError):
            alloc.dispose_guest_disk(a)


if __name__ == "__main__":
    unittest.main()
