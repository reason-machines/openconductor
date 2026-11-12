"""Portable file/role fixtures only. Fake principals and errno are not OS denials."""
from contextlib import contextmanager
import errno
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from tools import inert_storage_probe as probe


class StorageProbeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)
        self.consumer = os.getuid()
        if self.consumer == 0:
            self.skipTest("file ownership fixtures need a non-root test process")
        self.caller = self.consumer + 10000
        self.role = self.consumer
        self.addCleanup(patch.stopall)
        patch.object(probe, "BASE", self.base).start()
        patch.object(probe.pwd, "getpwuid", return_value=object()).start()
        patch.object(probe, "principal", side_effect=self.fixture_principal).start()
        patch.object(probe, "state", side_effect=self.fixture_state).start()
        self.selection = probe.initialize(self.caller)
        self.probe_id = self.selection["probe_id"]
        self.sha = self.selection["plan_sha256"]
        self.root = probe.root_path(self.probe_id)
        self.resources = self.root / "resources"

    def fixture_principal(self, expected=None):
        if expected is not None and expected != self.role:
            raise probe.Unavailable("wrong fixture principal")
        return self.role

    @contextmanager
    def fixture_state(self, uid):
        path = self.base / f"fixture-journal-{uid}"
        path.mkdir(mode=0o700, exist_ok=True)
        with probe.directory(path) as fd:
            yield fd

    def consumer_check(self, phase="initial", verify=False):
        self.role = self.consumer
        return probe.consumer_check(self.probe_id, self.sha, phase, verify=verify)

    def caller_check(self, phase="initial"):
        self.role = self.caller
        return probe.caller_check(self.probe_id, self.sha, phase)

    def test_markers_are_behind_a_pinned_private_search_boundary(self):
        private = self.root / "resources"
        info = private.lstat()
        self.assertEqual(info.st_uid, self.consumer)
        self.assertEqual(info.st_mode & 0o7777, 0o700)
        with probe.load_plan(self.probe_id, self.sha) as (plan, fd):
            self.assertEqual((plan.storage.device, plan.storage.inode), (info.st_dev, info.st_ino))
        for resource in probe.RESOURCES:
            self.assertFalse((self.root / (resource + ".marker")).exists())
            self.assertTrue((private / (resource + ".marker")).is_file())

    def test_file_mode_alone_does_not_prevent_retained_hard_link(self):
        legacy = self.base / "legacy-searchable"
        legacy.mkdir(mode=0o755)
        marker = legacy / "disk.marker"
        marker.write_bytes(b"synthetic-only")
        marker.chmod(0o600)
        alias = self.base / "retained-legacy-alias"
        os.link(marker, alias)
        self.assertEqual(marker.stat().st_ino, alias.stat().st_ino)
        self.assertEqual(marker.stat().st_nlink, 2)
        with self.assertRaisesRegex(probe.Unavailable, "single-link"):
            probe.Identity.of(marker.stat())

    def test_fresh_plan_has_two_exact_markers_and_no_admission(self):
        self.assertFalse(self.selection["runtime_admission"])
        with probe.load_plan(self.probe_id, self.sha) as (plan, fd):
            self.assertEqual(set(plan.resources), {"disk", "auxiliary"})
            with probe.resource_directory(fd, plan) as storage_fd:
                for resource in probe.RESOURCES:
                    self.assertEqual(probe.read_file(storage_fd, resource + ".marker"), plan.marker(resource))
        self.assertNotEqual((self.resources / "disk.marker").read_bytes(),
                            (self.resources / "auxiliary.marker").read_bytes())

    def test_consumer_writes_reads_and_reopens_both_resources_across_inert_phases(self):
        for phase in probe.PHASES:
            result = self.consumer_check(phase)
            self.assertEqual(result["status"], "AUTHORIZED_CONTROL_OK")
            self.assertEqual(len(result["observations"]), 2)
            self.assertTrue(all(o["read"] and o["write"] for o in result["observations"]))
            verified = self.consumer_check(phase, verify=True)
            self.assertEqual(verified["status"], "INTACT")
        self.assertTrue((self.root / "verify-retained.json").is_file())

    def test_uid_cannot_initialize_another_fixture(self):
        with self.assertRaisesRegex(probe.Unavailable, "UID already reserved"):
            probe.initialize(self.caller)

    def test_same_uid_and_unregistered_caller_refused(self):
        for uid in (0, self.consumer, -1):
            with self.subTest(uid=uid), self.assertRaises(probe.Unavailable):
                probe.initialize(uid)
        with patch.object(probe.pwd, "getpwuid", side_effect=KeyError):
            with self.assertRaisesRegex(probe.Unavailable, "registered"):
                probe.initialize(self.caller)

    def test_replay_and_crash_claims_remain_burned(self):
        self.consumer_check()
        with self.assertRaises(FileExistsError):
            self.consumer_check()
        with self.fixture_state(self.consumer) as fd:
            probe.write_new(fd, "verify-initial.claimed", b"crashed before observation")
        with self.assertRaises(FileExistsError):
            self.consumer_check(verify=True)
        with self.assertRaises(FileNotFoundError):
            self.consumer_check("repeat")

    def test_phase_jump_and_wrong_role_refused(self):
        with self.assertRaises(FileNotFoundError):
            self.consumer_check("retained")
        self.role = self.caller
        with self.assertRaises(probe.Unavailable):
            probe.consumer_check(self.probe_id, self.sha, "initial")
        with self.assertRaises(FileNotFoundError):
            self.caller_check()

    def test_bad_digest_missing_target_and_bad_ids_are_unavailable(self):
        for probe_id, sha in ((self.probe_id, "0" * 64), ("../outside", self.sha),
                              (self.probe_id, "")):
            with self.subTest(probe_id=probe_id, sha=sha), self.assertRaises(probe.Unavailable):
                with probe.load_plan(probe_id, sha):
                    self.fail("invalid selection reached operations")
        (self.resources / "auxiliary.marker").unlink()
        with self.assertRaises(FileNotFoundError):
            self.consumer_check()

    def test_symlink_hardlink_and_content_change_do_not_touch_outside_file(self):
        outside = self.base / "outside-synthetic"
        outside.write_bytes(b"untouched")
        target = self.resources / "auxiliary.marker"
        original = target.read_bytes()
        target.unlink()
        target.symlink_to(outside)
        with self.assertRaises(probe.Unavailable):
            self.consumer_check()
        self.assertEqual(outside.read_bytes(), b"untouched")
        target.unlink()
        target.write_bytes(original)
        os.link(target, self.base / "alias")
        with probe.load_plan(self.probe_id, self.sha) as (plan, fd):
            with probe.resource_directory(fd, plan) as storage_fd:
                with self.assertRaises(probe.Unavailable):
                    probe.check_identity(storage_fd, plan, "auxiliary")

    def test_exact_marker_modification_is_detected(self):
        path = self.resources / "disk.marker"
        data = path.read_bytes()
        path.write_bytes(b"!" + data[1:])
        with self.assertRaisesRegex(probe.Unavailable, "marker was modified"):
            self.consumer_check()

    def test_namespace_symlink_and_changed_inode_refused(self):
        renamed = self.base / "old-root"
        self.root.rename(renamed)
        self.root.symlink_to(renamed, target_is_directory=True)
        with self.assertRaises(OSError):
            self.consumer_check()
        self.root.unlink()
        self.root.mkdir(mode=0o711)
        (self.root / "plan.json").write_bytes((renamed / "plan.json").read_bytes())
        with self.assertRaisesRegex(probe.Unavailable, "namespace identity"):
            self.consumer_check()

    def test_fixture_denials_require_each_real_twin_calibration(self):
        self.consumer_check()
        original = probe.attempt
        controls = []

        def fixture_attempt(name, fd, target, scratch):
            if target == "twin":
                result = original(name, fd, target, scratch)
                controls.append((name, result["returned"]))
                return result
            return {"returned": False, "errno": errno.EACCES,
                    "errno_name": "EACCES", "completed": []}

        with patch.object(probe, "attempt", side_effect=fixture_attempt):
            result = self.caller_check()
        self.assertEqual(result["status"], "DENIALS_OBSERVED")
        self.assertEqual(len(controls), 12)
        self.assertTrue(all(success for _, success in controls))
        self.assertEqual({o["resource"] for o in result["observations"]}, set(probe.RESOURCES))
        self.assertTrue(all(o["negative"]["errno"] == errno.EACCES for o in result["observations"]))
        self.assertFalse(result["runtime_admission"])
        with self.assertRaises(FileExistsError):
            self.caller_check()
        self.consumer_check(verify=True)

    def test_private_markers_are_attempted_by_real_syscall_paths_not_stat_failures(self):
        self.consumer_check()
        calls = []
        original_open, original_link, original_replace = probe.os.open, probe.os.link, probe.os.replace

        def deny(name, target, fd):
            self.assertEqual(os.fstat(fd).st_ino, self.root.stat().st_ino)
            self.assertIn(target, {"resources/" + resource + ".marker" for resource in probe.RESOURCES})
            calls.append((name, target))
            raise PermissionError(errno.EACCES, "fixture kernel boundary")

        def opened(path, flags, *args, **kwargs):
            if isinstance(path, str) and path.startswith("resources/"):
                deny("open", path, kwargs["dir_fd"])
            return original_open(path, flags, *args, **kwargs)

        def linked(src, dst, **kwargs):
            if src.startswith("resources/"):
                deny("link", src, kwargs["src_dir_fd"])
            return original_link(src, dst, **kwargs)

        def replaced(src, dst, **kwargs):
            if dst.startswith("resources/"):
                deny("replace", dst, kwargs["dst_dir_fd"])
            return original_replace(src, dst, **kwargs)

        with patch.object(probe.os, "open", side_effect=opened), \
                patch.object(probe.os, "link", side_effect=linked), \
                patch.object(probe.os, "replace", side_effect=replaced), \
                patch.object(probe, "check_identity", side_effect=AssertionError("caller stat preflight")):
            result = self.caller_check()
        self.assertEqual(result["status"], "DENIALS_OBSERVED")
        self.assertEqual(len(calls), 12)
        self.assertEqual(sum(name == "link" for name, _ in calls), 2)
        self.assertTrue(all(o["calibration"]["returned"] for o in result["observations"]))
        self.consumer_check(verify=True)

    def test_private_storage_missing_symlink_replaced_or_searchable_is_unavailable(self):
        original = self.base / "retained-original-resources"
        self.resources.rename(original)
        with self.assertRaises(FileNotFoundError):
            self.consumer_check()
        self.resources.symlink_to(original, target_is_directory=True)
        with self.assertRaisesRegex(probe.Unavailable, "private"):
            self.consumer_check()
        self.resources.unlink()
        self.resources.mkdir(mode=0o700)
        with self.assertRaisesRegex(probe.Unavailable, "storage identity"):
            self.consumer_check()
        self.resources.rmdir()
        original.rename(self.resources)
        for mode in (0o711, 0o755, 0o770, 0o1700):
            self.resources.chmod(mode)
            with self.subTest(mode=mode), self.assertRaises(probe.Unavailable):
                self.consumer_check()
        self.resources.chmod(0o700)
        self.consumer_check()

    def test_old_plan_version_and_wrong_private_directory_fields_are_refused(self):
        original = (self.root / "plan.json").read_bytes()
        raw = json.loads(original)
        for field, value in (("version", 1), ("storage", None),
                             ("storage", {**raw["storage"], "uid": self.caller}),
                             ("storage", {**raw["storage"], "inode": True})):
            data = probe.encoded({**raw, field: value})
            (self.root / "plan.json").chmod(0o600)
            (self.root / "plan.json").write_bytes(data)
            with self.subTest(field=field, value=value), self.assertRaises((probe.Unavailable, TypeError)):
                with probe.load_plan(self.probe_id, probe.digest(data)):
                    self.fail("accepted wrong plan boundary")
        (self.root / "plan.json").write_bytes(original)

    def test_successful_link_is_still_a_breach_and_single_link_is_still_required(self):
        self.consumer_check()
        original = probe.attempt

        def attempted(name, fd, target, scratch):
            if target == "twin" or name == "link":
                return original(name, fd, target, scratch)
            return {"returned": False, "errno": errno.EACCES, "errno_name": "EACCES", "completed": []}

        with patch.object(probe, "attempt", side_effect=attempted):
            result = self.caller_check()
        links = [o for o in result["observations"] if o["operation"] == "link"]
        self.assertEqual(result["status"], "FAILED")
        self.assertEqual(len(links), 2)
        self.assertTrue(all(o["status"] == "BREACH" and o["negative"]["completed"] == ["link"] for o in links))
        with self.assertRaisesRegex(probe.Unavailable, "single-link"):
            self.consumer_check(verify=True)

    def test_missing_operation_calibration_never_reports_denial(self):
        self.consumer_check()
        failure = {"returned": False, "errno": errno.ENOSYS, "errno_name": "ENOSYS", "completed": []}
        with patch.object(probe, "attempt", return_value=failure) as attempt:
            result = self.caller_check()
        self.assertEqual(attempt.call_count, 12)
        self.assertEqual(result["status"], "FAILED")
        self.assertTrue(all(o["status"] == "UNAVAILABLE" and o["negative"] is None
                            for o in result["observations"]))

    def test_wrong_errno_and_partial_access_never_report_denial(self):
        self.consumer_check()
        sequence = []
        for number in (errno.ENOENT, errno.EROFS, errno.EXDEV, errno.ENOSYS, errno.EIO, errno.ELOOP):
            sequence += [{"returned": True, "errno": None, "completed": ["open"]},
                         {"returned": False, "errno": number, "completed": []}]
        sequence *= 2
        with patch.object(probe, "attempt", side_effect=sequence):
            result = self.caller_check()
        self.assertEqual(result["status"], "FAILED")
        self.assertTrue(all(o["status"] == "UNAVAILABLE" for o in result["observations"]))

    def test_partial_negative_open_is_a_breach_even_with_eacces(self):
        self.consumer_check()
        sequence = []
        for _ in range(12):
            sequence += [{"returned": True, "errno": None, "completed": ["open"]},
                         {"returned": False, "errno": errno.EACCES, "completed": ["open"]}]
        with patch.object(probe, "attempt", side_effect=sequence):
            result = self.caller_check()
        self.assertEqual(result["status"], "FAILED")
        self.assertTrue(all(o["status"] == "BREACH" for o in result["observations"]))

    def test_same_kernel_uid_fixture_is_a_breach_not_enforcement_proof(self):
        self.consumer_check()
        result = self.caller_check()
        self.assertEqual(result["status"], "FAILED")
        self.assertTrue(any(o["status"] == "BREACH" for o in result["observations"]))
        with self.assertRaises(probe.Unavailable):
            self.consumer_check(verify=True)

    def test_partial_reopen_preserves_first_success_and_later_errno(self):
        with probe.directory(self.resources) as fd:
            original = probe.os.open
            opens = []

            def second_open_denied(*args, **kwargs):
                if opens:
                    raise PermissionError(errno.EACCES, "fixture second open")
                handle = original(*args, **kwargs)
                opens.append(handle)
                return handle

            with patch.object(probe.os, "open", side_effect=second_open_denied):
                result = probe.attempt("reopen", fd, "disk.marker", fd)
        self.assertFalse(result["returned"])
        self.assertEqual(result["completed"], ["open"])
        self.assertEqual(result["errno"], errno.EACCES)

    def test_unavailable_cli_emits_no_pass_or_admission(self):
        output = io.StringIO()
        with patch("sys.stdout", output), patch.object(probe, "initialize", side_effect=FileNotFoundError(errno.ENOENT, "fixture")):
            self.assertEqual(probe.main(["consumer-init", "--caller-uid", str(self.caller)]), 2)
        result = json.loads(output.getvalue())
        self.assertEqual(result["status"], "UNAVAILABLE")
        self.assertEqual(result["errno"], errno.ENOENT)
        self.assertFalse(result["runtime_admission"])


class ActualPrincipalGuardTests(unittest.TestCase):
    def test_root_setuid_and_wrong_role_refused_without_provisioning(self):
        for uid, euid, expected in ((0, 0, None), (1001, 0, None), (1001, 1001, 1002)):
            with self.subTest(uid=uid, euid=euid, expected=expected):
                with patch.object(probe.os, "getuid", return_value=uid), patch.object(probe.os, "geteuid", return_value=euid):
                    with self.assertRaises(probe.Unavailable):
                        probe.principal(expected)

    def test_private_state_rejects_symlink_or_world_writable_store(self):
        uid = os.getuid()
        with tempfile.TemporaryDirectory() as temporary, patch.object(probe, "BASE", Path(temporary)):
            target = Path(temporary) / f"oc-inert-storage-state-{uid}"
            other = Path(temporary) / "other-synthetic"
            other.mkdir()
            target.symlink_to(other, target_is_directory=True)
            with self.assertRaises(OSError):
                with probe.state(uid):
                    self.fail("followed state symlink")
            target.unlink()
            target.mkdir(mode=0o777)
            target.chmod(0o777)
            with self.assertRaises(probe.Unavailable):
                with probe.state(uid):
                    self.fail("accepted public state")


if __name__ == "__main__":
    unittest.main()
