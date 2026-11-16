"""VZ bridge configuration tests.

Cloud-safe: no Virtualization.framework import, no subprocess, no native
execution, no filesystem staging.  StagedBundle instances are built from
scratch using the staging machinery; VZMacConfiguration is validated
structurally without any path-existence checks.
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

from tools import native_qa_vz_bridge as vz
from tools import native_qa_vm_receipt as policy
from tools import native_qa_vm_staging as staging


# ---------------------------------------------------------------------------
# Synthetic bundle helpers.

_SOURCE = "c" * 40
_BUILD_ID = "github-actions:1:20:1:compile-sign"
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
        "run_id": 20, "run_attempt": 1, "job_key": policy.JOB,
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
    archive = _make_archive()
    # Resolve symlinks so stage_retained_bundle's symlink guard passes on
    # Linux (/tmp -> /private/tmp-style mounts) and macOS.
    base = os.path.realpath(tempfile.mkdtemp(prefix="oc-vz-test-"))
    target = Path(os.path.join(base, "staged"))
    return staging.stage_retained_bundle(archive, target)


# ---------------------------------------------------------------------------
# compose_vz_configuration happy-path tests.


class ComposeVZConfigurationTests(unittest.TestCase):
    def setUp(self):
        self.bundle = _make_staged_bundle()
        self.disk = Path("/private/tmp/oc-qa-disk.img")
        self.aux = Path("/private/tmp/oc-qa-aux.bin")

    def tearDown(self):
        import shutil
        shutil.rmtree(str(self.bundle.staged_path.parent), ignore_errors=True)

    def test_returns_vz_mac_configuration(self):
        cfg = vz.compose_vz_configuration(self.bundle, self.disk, self.aux)
        self.assertIsInstance(cfg, vz.VZMacConfiguration)

    def test_config_carries_bundle_identity(self):
        cfg = vz.compose_vz_configuration(self.bundle, self.disk, self.aux)
        self.assertEqual(cfg.source_commit, _SOURCE)
        self.assertEqual(cfg.build_id, _BUILD_ID)
        self.assertEqual(cfg.executable_sha256, _FAKE_EXE_SHA)

    def test_disk_path_stored(self):
        cfg = vz.compose_vz_configuration(self.bundle, self.disk, self.aux)
        self.assertEqual(cfg.disk.path, self.disk)
        self.assertFalse(cfg.disk.read_only)

    def test_aux_path_stored(self):
        cfg = vz.compose_vz_configuration(self.bundle, self.disk, self.aux)
        self.assertEqual(cfg.aux.path, self.aux)

    def test_default_cpu_and_memory(self):
        cfg = vz.compose_vz_configuration(self.bundle, self.disk, self.aux)
        self.assertEqual(cfg.cpu_count, vz.DEFAULT_CPU_COUNT)
        self.assertEqual(cfg.memory_bytes, vz.DEFAULT_MEMORY_BYTES)

    def test_explicit_cpu_and_memory(self):
        mem = 16 * 1024 * 1024 * 1024  # 16 GiB
        cfg = vz.compose_vz_configuration(
            self.bundle, self.disk, self.aux,
            cpu_count=4, memory_bytes=mem
        )
        self.assertEqual(cfg.cpu_count, 4)
        self.assertEqual(cfg.memory_bytes, mem)

    def test_read_only_disk(self):
        cfg = vz.compose_vz_configuration(
            self.bundle, self.disk, self.aux, disk_read_only=True
        )
        self.assertTrue(cfg.disk.read_only)

    def test_min_cpu_count_accepted(self):
        cfg = vz.compose_vz_configuration(
            self.bundle, self.disk, self.aux, cpu_count=vz.MIN_CPU_COUNT
        )
        self.assertEqual(cfg.cpu_count, vz.MIN_CPU_COUNT)

    def test_max_cpu_count_accepted(self):
        cfg = vz.compose_vz_configuration(
            self.bundle, self.disk, self.aux, cpu_count=vz.MAX_CPU_COUNT
        )
        self.assertEqual(cfg.cpu_count, vz.MAX_CPU_COUNT)

    def test_min_memory_accepted(self):
        cfg = vz.compose_vz_configuration(
            self.bundle, self.disk, self.aux, memory_bytes=vz.MIN_MEMORY_BYTES
        )
        self.assertEqual(cfg.memory_bytes, vz.MIN_MEMORY_BYTES)

    def test_max_memory_accepted(self):
        cfg = vz.compose_vz_configuration(
            self.bundle, self.disk, self.aux, memory_bytes=vz.MAX_MEMORY_BYTES
        )
        self.assertEqual(cfg.memory_bytes, vz.MAX_MEMORY_BYTES)


# ---------------------------------------------------------------------------
# Type error tests.


class TypeErrorTests(unittest.TestCase):
    def setUp(self):
        self.bundle = _make_staged_bundle()
        self.disk = Path("/private/tmp/oc-qa-disk.img")
        self.aux = Path("/private/tmp/oc-qa-aux.bin")

    def tearDown(self):
        import shutil
        shutil.rmtree(str(self.bundle.staged_path.parent), ignore_errors=True)

    def test_non_bundle_raises(self):
        with self.assertRaises(TypeError):
            vz.compose_vz_configuration("not-a-bundle", self.disk, self.aux)

    def test_non_path_disk_raises(self):
        with self.assertRaises(TypeError):
            vz.compose_vz_configuration(self.bundle, "/not/a/path/object", self.aux)

    def test_non_path_aux_raises(self):
        with self.assertRaises(TypeError):
            vz.compose_vz_configuration(self.bundle, self.disk, "/not/a/path/object")


# ---------------------------------------------------------------------------
# VZConfigurationRefusal tests.


class RefusalTests(unittest.TestCase):
    def setUp(self):
        self.bundle = _make_staged_bundle()
        self.disk = Path("/private/tmp/oc-qa-disk.img")
        self.aux = Path("/private/tmp/oc-qa-aux.bin")

    def tearDown(self):
        import shutil
        shutil.rmtree(str(self.bundle.staged_path.parent), ignore_errors=True)

    def test_relative_disk_path_refused(self):
        with self.assertRaises(vz.VZConfigurationRefusal):
            vz.compose_vz_configuration(self.bundle, Path("relative/disk"), self.aux)

    def test_relative_aux_path_refused(self):
        with self.assertRaises(vz.VZConfigurationRefusal):
            vz.compose_vz_configuration(self.bundle, self.disk, Path("relative/aux"))

    def test_same_disk_and_aux_path_refused(self):
        same = Path("/private/tmp/oc-qa-same.img")
        with self.assertRaises(vz.VZConfigurationRefusal):
            vz.compose_vz_configuration(self.bundle, same, same)

    def test_zero_cpu_count_refused(self):
        with self.assertRaises(vz.VZConfigurationRefusal):
            vz.compose_vz_configuration(
                self.bundle, self.disk, self.aux, cpu_count=0
            )

    def test_excessive_cpu_count_refused(self):
        with self.assertRaises(vz.VZConfigurationRefusal):
            vz.compose_vz_configuration(
                self.bundle, self.disk, self.aux, cpu_count=vz.MAX_CPU_COUNT + 1
            )

    def test_memory_below_minimum_refused(self):
        with self.assertRaises(vz.VZConfigurationRefusal):
            vz.compose_vz_configuration(
                self.bundle, self.disk, self.aux,
                memory_bytes=vz.MIN_MEMORY_BYTES - 1
            )

    def test_memory_above_maximum_refused(self):
        with self.assertRaises(vz.VZConfigurationRefusal):
            vz.compose_vz_configuration(
                self.bundle, self.disk, self.aux,
                memory_bytes=vz.MAX_MEMORY_BYTES + 1
            )

    def test_memory_not_mib_aligned_refused(self):
        with self.assertRaises(vz.VZConfigurationRefusal):
            # Minimum minus 1 byte is below minimum AND misaligned.
            vz.compose_vz_configuration(
                self.bundle, self.disk, self.aux,
                memory_bytes=vz.MIN_MEMORY_BYTES + 1  # misaligned
            )


if __name__ == "__main__":
    unittest.main()
