"""Synthetic staging tests. No native execution, provisioning or filesystem side effects."""
import hashlib
import io
import os
import stat
import tempfile
import unittest
import zipfile

from tools import native_qa_vm_receipt as policy
from tools import native_qa_vm_staging as staging


# ---------------------------------------------------------------------------
# Minimal valid synthetic bundle archive helpers (mirrors test_native_qa_vm_receipt.py patterns)

_SOURCE = "a" * 40
_REPO_ID = 1
_RUN_ID = 2
_ATTEMPT = 1

_FAKE_EXE = b"\xcf\xfa\xed\xfe" + b"\x00" * 60   # Mach-O magic + padding
# Minimal valid plist with required bundle identity fields.
import plistlib as _plistlib
_FAKE_PLIST = _plistlib.dumps({
    "CFBundleIdentifier": policy.BUNDLE_ID,
    "CFBundleExecutable": policy.EXECUTABLE.rsplit("/", 1)[1],
})
_FAKE_CODESIG = b"codesig-placeholder"


def _build_id():
    return f"github-actions:{_REPO_ID}:{_RUN_ID}:{_ATTEMPT}:{policy.JOB}"


def _make_receipt(exe_bytes: bytes) -> bytes:
    exe_sha = hashlib.sha256(exe_bytes).hexdigest()
    build_id = _build_id()
    return policy._canonical({
        "schema": 1, "repository": policy.REPOSITORY,
        "source_commit": _SOURCE, "build_id": build_id,
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


def _make_archive(exe_bytes: bytes = _FAKE_EXE,
                  plist_bytes: bytes = _FAKE_PLIST,
                  codesig_bytes: bytes = _FAKE_CODESIG) -> bytes:
    """Return a valid retained bundle archive for _SOURCE / _build_id()."""
    receipt = _make_receipt(exe_bytes)
    manifest = _make_manifest(receipt)
    buf = io.BytesIO()
    root = policy.BUNDLE_ROOT
    exe_member = f"{root}/{policy.EXECUTABLE}"
    plist_member = f"{root}/Contents/Info.plist"
    codesig_member = f"{root}/Contents/_CodeSignature/CodeResources"
    contents = {
        "receipt.json": (receipt, 0o600),
        "build.json": (manifest, 0o600),
        plist_member: (plist_bytes, 0o644),
        exe_member: (exe_bytes, 0o755),
        codesig_member: (codesig_bytes, 0o644),
    }
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_STORED) as zf:
        for name, (data, mode) in contents.items():
            info = zipfile.ZipInfo(name)
            info.create_system = 3
            info.external_attr = (stat.S_IFREG | mode) << 16
            zf.writestr(info, data)
    return buf.getvalue()


# ---------------------------------------------------------------------------

class StagingTests(unittest.TestCase):

    def setUp(self):
        # Resolve symlinks so the staging module's ancestry check passes on
        # machines where TMPDIR goes through a symlink (e.g. cloud runners).
        self._tmpdir = os.path.realpath(tempfile.mkdtemp(prefix="oc-staging-test-"))

    def tearDown(self):
        import shutil
        shutil.rmtree(self._tmpdir, ignore_errors=True)

    def _target(self, name: str = "staged"):
        return os.path.join(self._tmpdir, name)

    # --- success path -------------------------------------------------------

    def test_valid_archive_extracts_to_owned_staged_path(self):
        data = _make_archive()
        target = self._target()
        result = staging.stage_retained_bundle(data, target)
        self.assertIsInstance(result, staging.StagedBundle)
        self.assertEqual(result.source_commit, _SOURCE)
        self.assertEqual(result.build_id, _build_id())
        self.assertEqual(result.staged_path, result.staged_path)
        self.assertTrue(result.staged_path.is_dir())
        self.assertTrue(result.executable_path.is_file())
        self.assertTrue(result.executable_path.is_relative_to(result.staged_path))

    def test_staged_directory_has_mode_0700(self):
        data = _make_archive()
        result = staging.stage_retained_bundle(data, self._target())
        mode = stat.S_IMODE(result.staged_path.lstat().st_mode)
        self.assertEqual(mode, 0o700)

    def test_executable_has_mode_0755_after_staging(self):
        data = _make_archive()
        result = staging.stage_retained_bundle(data, self._target())
        mode = stat.S_IMODE(result.executable_path.lstat().st_mode)
        self.assertEqual(mode, 0o755)

    def test_plist_has_mode_0644_after_staging(self):
        data = _make_archive()
        result = staging.stage_retained_bundle(data, self._target())
        plist = result.app_path / "Contents" / "Info.plist"
        self.assertTrue(plist.is_file())
        mode = stat.S_IMODE(plist.lstat().st_mode)
        self.assertEqual(mode, 0o644)

    def test_receipt_files_not_extracted_to_staged_path(self):
        data = _make_archive()
        result = staging.stage_retained_bundle(data, self._target())
        self.assertFalse((result.staged_path / "receipt.json").exists())
        self.assertFalse((result.staged_path / "build.json").exists())

    def test_executable_digest_in_result_matches_exe_bytes(self):
        exe = b"\xcf\xfa\xed\xfe" + b"\x01" * 60
        data = _make_archive(exe_bytes=exe)
        result = staging.stage_retained_bundle(data, self._target())
        expected = hashlib.sha256(exe).hexdigest()
        self.assertEqual(result.executable_sha256, expected)
        actual = hashlib.sha256(result.executable_path.read_bytes()).hexdigest()
        self.assertEqual(actual, expected)

    def test_app_path_is_bundle_root_inside_staged(self):
        data = _make_archive()
        result = staging.stage_retained_bundle(data, self._target())
        self.assertEqual(result.app_path.name, policy.BUNDLE_ROOT)
        self.assertEqual(result.app_path.parent, result.staged_path)

    def test_string_path_accepted_for_target(self):
        data = _make_archive()
        result = staging.stage_retained_bundle(data, self._target("str-target"))
        self.assertTrue(result.staged_path.is_dir())

    # --- refusal before extraction ----------------------------------------

    def test_existing_target_refused(self):
        data = _make_archive()
        target = self._target()
        os.makedirs(target)
        with self.assertRaises((ValueError, OSError)):
            staging.stage_retained_bundle(data, target)

    def test_symlink_target_refused(self):
        data = _make_archive()
        real = self._target("real")
        link = self._target("link")
        os.makedirs(real)
        os.symlink(real, link)
        with self.assertRaises(ValueError):
            staging.stage_retained_bundle(data, link)

    def test_invalid_archive_refused_before_extraction(self):
        with self.assertRaises(ValueError):
            staging.stage_retained_bundle(b"not a zip", self._target())
        self.assertFalse(os.path.exists(self._target()))

    def test_empty_data_refused(self):
        with self.assertRaises(ValueError):
            staging.stage_retained_bundle(b"", self._target())

    def test_truncated_archive_refused(self):
        data = _make_archive()[:100]
        with self.assertRaises(ValueError):
            staging.stage_retained_bundle(data, self._target())

    def test_wrong_executable_digest_refused_and_target_removed(self):
        """Tamper with exe after building archive: receipt sha won't match extracted file."""
        # Build archive with one exe, but patch the receipt to claim a different sha256.
        import json
        good_data = _make_archive()
        # Read archive, replace executable bytes with something different.
        buf = io.BytesIO()
        with zipfile.ZipFile(io.BytesIO(good_data)) as src, \
                zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_STORED) as dst:
            for item in src.infolist():
                content = src.read(item.filename)
                if item.filename == f"{policy.BUNDLE_ROOT}/{policy.EXECUTABLE}":
                    content = b"\xcf\xfa\xed\xfe" + b"\xff" * 60  # different bytes
                info = zipfile.ZipInfo(item.filename)
                info.create_system = 3
                info.external_attr = item.external_attr
                dst.writestr(info, content)
        tampered = buf.getvalue()
        target = self._target()
        with self.assertRaises(ValueError):
            staging.stage_retained_bundle(tampered, target)
        # target must be cleaned up
        self.assertFalse(os.path.exists(target))

    def test_missing_receipt_member_refused(self):
        good_data = _make_archive()
        buf = io.BytesIO()
        with zipfile.ZipFile(io.BytesIO(good_data)) as src, \
                zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_STORED) as dst:
            for item in src.infolist():
                if item.filename != "receipt.json":
                    info = zipfile.ZipInfo(item.filename)
                    info.create_system = 3
                    info.external_attr = item.external_attr
                    dst.writestr(info, src.read(item.filename))
        with self.assertRaises(ValueError):
            staging.stage_retained_bundle(buf.getvalue(), self._target())

    def test_partial_target_removed_on_validation_failure(self):
        """Archive passes initial zip check but fails inspect_retained_bundle; no remnant."""
        # Build archive with wrong build_id in receipt.
        import json
        receipt_bad = policy._canonical({
            "schema": 1, "repository": policy.REPOSITORY,
            "source_commit": _SOURCE, "build_id": "wrong-build-id",
            "executable_sha256": hashlib.sha256(_FAKE_EXE).hexdigest(),
        })
        manifest_bad = policy._canonical({
            "schema": 1, "repository": policy.REPOSITORY,
            "repository_id": _REPO_ID, "source_commit": _SOURCE,
            "workflow_path": policy.WORKFLOW, "workflow_commit": _SOURCE,
            "run_id": _RUN_ID, "run_attempt": _ATTEMPT, "job_key": policy.JOB,
            "event": "push", "ref": "refs/heads/main",
            "build_id": "wrong-build-id", "bundle_id": policy.BUNDLE_ID,
            "executable": policy.EXECUTABLE, "architecture": "arm64",
            "minimum_macos": "15.0", "sdk_version": "15.0", "clang_version": "clang-1700",
            "signing_mode": "ad-hoc",
            "receipt_sha256": hashlib.sha256(receipt_bad).hexdigest(),
        })
        buf = io.BytesIO()
        root = policy.BUNDLE_ROOT
        with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_STORED) as zf:
            for name, (data, mode) in {
                "receipt.json": (receipt_bad, 0o600),
                "build.json": (manifest_bad, 0o600),
                f"{root}/Contents/Info.plist": (_FAKE_PLIST, 0o644),
                f"{root}/{policy.EXECUTABLE}": (_FAKE_EXE, 0o755),
                f"{root}/Contents/_CodeSignature/CodeResources": (_FAKE_CODESIG, 0o644),
            }.items():
                info = zipfile.ZipInfo(name)
                info.create_system = 3
                info.external_attr = (stat.S_IFREG | mode) << 16
                zf.writestr(info, data)
        target = self._target()
        with self.assertRaises(ValueError):
            staging.stage_retained_bundle(buf.getvalue(), target)
        self.assertFalse(os.path.exists(target), "partial target must be removed on failure")

    # --- compose_invocation -------------------------------------------------

    def test_compose_invocation_returns_tuple_starting_with_executable(self):
        data = _make_archive()
        result = staging.stage_retained_bundle(data, self._target())
        argv = staging.compose_invocation(result)
        self.assertIsInstance(argv, tuple)
        self.assertGreater(len(argv), 0)
        self.assertEqual(argv[0], str(result.executable_path))

    def test_compose_invocation_refuses_non_staged_bundle(self):
        with self.assertRaises(TypeError):
            staging.compose_invocation("not a bundle")  # type: ignore[arg-type]

    def test_compose_invocation_does_not_execute_binary(self):
        """compose_invocation returns a tuple and nothing more; no subprocess is started."""
        import subprocess
        original_popen = subprocess.Popen
        called = []
        def patched_popen(*args, **kwargs):
            called.append(args)
            return original_popen(*args, **kwargs)
        try:
            subprocess.Popen = patched_popen
            data = _make_archive()
            result = staging.stage_retained_bundle(data, self._target())
            staging.compose_invocation(result)
        finally:
            subprocess.Popen = original_popen
        self.assertEqual(called, [], "compose_invocation must not start a process")


if __name__ == "__main__":
    unittest.main()
