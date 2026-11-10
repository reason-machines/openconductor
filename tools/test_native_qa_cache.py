import hashlib
import json
import os
from pathlib import Path
import plistlib
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from tools.test_native_qa_runner import portable_transport

from tools import native_qa_cache as stage


class CacheStageTests(unittest.TestCase):
    def setUp(self):
        self.enterContext(portable_transport())
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        parent = Path(self.tmp.name).resolve()
        self.root = parent / "fresh"
        qa = stage.ordinary.wk.qa
        with patch.object(qa.subprocess, "check_output", side_effect=["c" * 40 + "\n", b""]):
            self.manifest = qa.prepare(self.root)
        self.app = self.root / "QA.app"
        (self.app / "Contents/MacOS").mkdir(parents=True)
        (self.app / "Contents/Info.plist").write_bytes(plistlib.dumps({
            "CFBundleIdentifier": self.manifest["identifier"], "CFBundleExecutable": "fixture",
        }))
        self.exe = self.app / "Contents/MacOS/fixture"
        self.prerequisite = {
            "probe_version": stage.ordinary.VERSION, "identifier": self.manifest["identifier"],
            "executable": str(self.exe), "webview_incognito": True,
            **{key: str(self.root / "app-data") for key in qa.PATH_FIELDS},
            "settings_file": str(self.root / "settings/settings.toml"),
            "database": str(self.root / "app-data/conductor.db"),
            "cache_database": str(self.root / "app-data/cache.db"),
            "webkit_data_store_persistent": False, "native_window_visible": False,
            "javascript_disabled_requested": True, "navigation_policy_all_denied": True,
            "new_window_policy_all_denied": True, "bootstrap_url": "about:blank",
            "inspection_after_bootstrap_construction": True, "window_label": "main",
            "app_content_admitted": False, "ordinary_setup_admitted": False,
            "cache_filesystem_verified": False,
        }
        self.script()

    def script(self, extra="", marker=True):
        self.exe.write_text(f"#!{sys.executable}\n# {stage.ordinary.wk.VERSION}\n"
                            f"# {stage.VERSION if marker else 'old-binary'}\n"
                            "import json, os, sys, time\nfrom pathlib import Path\n"
                            "phase = sys.argv[1].removeprefix('--oc-qa-storage-')\n"
                            "assert phase in ('write', 'read')\n"
                            "token = os.environ['OC_NATIVE_QA_STORAGE_TOKEN']\n"
                            "value = 'written-read-back' if phase == 'write' else 'absent'\n"
                            f"receipt = {{'probe_version': {stage.VERSION if marker else 'old-binary'!r}, "
                            "'phase': phase, 'token': token, 'pid': os.getpid(), "
                            "'webkit_data_store_persistent': False, 'native_window_visible': False, "
                            "'ordinary_app_content_admitted': False, 'filesystem_coverage_verified': False, "
                            "'inspection_after_inert_bootstrap': True, 'synthetic_content_only': True, "
                            "'local_storage': value, 'indexed_db': value, 'cache_storage': value}\n" + extra +
                            "\nprint(json.dumps(receipt))\n")
        self.exe.chmod(0o700)
        bound = dict(self.prerequisite,
                     binary_sha256=hashlib.sha256(self.exe.read_bytes()).hexdigest(),
                     config_sha256=self.manifest["config_sha256"],
                     prepared_source_sha=self.manifest["source_sha"])
        (self.root / stage.ordinary.RECEIPT).write_text(json.dumps(bound))
        (self.root / "paths-receipt.json").write_text(json.dumps(dict(bound, probe_version=stage.ordinary.wk.qa.VERSION)))

    def test_lifecycle_receipt_is_partial_and_exact_build_bound(self):
        receipt = stage.probe(self.root, self.app)
        self.assertIs(receipt["storage_lifecycle_verified"], True)
        self.assertIs(receipt["filesystem_coverage_verified"], False)
        self.assertIs(receipt["ordinary_app_content_admitted"], False)
        self.assertNotEqual(receipt["write"]["pid"], receipt["read"]["pid"])
        self.assertEqual(receipt["write"]["token"], receipt["read"]["token"])
        self.assertEqual(receipt["binary_sha256"], hashlib.sha256(self.exe.read_bytes()).hexdigest())
        self.assertEqual((self.root / stage.RECEIPT).stat().st_mode & 0o777, 0o600)
        self.assertIn("no process/helper filesystem observer", receipt["scope"])

    def test_no_asserted_receipt_can_unlock_filesystem_admission(self):
        for receipt in ({}, {"filesystem_coverage_verified": True, "all_helpers_covered": True,
                             "lost_events": 0, "external_writes": []}):
            with self.assertRaisesRegex(ValueError, "admission denied"):
                stage.require_filesystem_isolation(receipt)

    def test_old_binary_refused_without_execution(self):
        self.script(extra="raise RuntimeError('must not execute')", marker=False)
        with self.assertRaisesRegex(ValueError, "lacks synthetic"):
            stage.probe(self.root, self.app)

    def test_missing_or_stale_ordinary_prerequisite_refused(self):
        path = self.root / stage.ordinary.RECEIPT
        bound = json.loads(path.read_text())
        for key in ("binary_sha256", "config_sha256", "prepared_source_sha"):
            path.write_text(json.dumps(dict(bound, **{key: "incorrect"})))
            with self.assertRaisesRegex(ValueError, "exact source"):
                stage.probe(self.root, self.app)
        path.unlink()
        with self.assertRaises(FileNotFoundError):
            stage.probe(self.root, self.app)

    def test_all_storage_stores_must_pass_both_phases(self):
        for key in ("local_storage", "indexed_db", "cache_storage"):
            with self.subTest(key=key):
                self.script(extra=f"receipt[{key!r}] = 'survived' if phase == 'read' else 'failed'")
                with self.assertRaisesRegex(ValueError, "all three"):
                    stage.probe(self.root, self.app)
                self.assertFalse((self.root / stage.RECEIPT).exists())

    def test_failed_read_keeps_partial_write_receipt_but_never_success_or_reuse(self):
        self.script(extra="if phase == 'read': receipt['cache_storage'] = 'survived'")
        with self.assertRaisesRegex(ValueError, "all three"):
            stage.probe(self.root, self.app)
        self.assertTrue((self.root / "storage-write.json").exists())
        self.assertFalse((self.root / stage.RECEIPT).exists())
        with self.assertRaisesRegex(ValueError, "unused fixture"):
            stage.probe(self.root, self.app)

    def test_forged_observations_and_process_binding_refused(self):
        for extra in ("receipt['token'] = 'incorrect'", "receipt['pid'] = True",
                      "receipt['webkit_data_store_persistent'] = True",
                      "receipt['filesystem_coverage_verified'] = True",
                      "receipt['ordinary_app_content_admitted'] = True"):
            with self.subTest(extra=extra):
                self.script(extra=extra)
                with self.assertRaises(ValueError):
                    stage.probe(self.root, self.app)
                self.assertFalse((self.root / stage.RECEIPT).exists())

    def assert_mutation_refused_before_relaunch(self, target):
        self.script(extra=f"if phase == 'write': Path({str(target)!r}).write_bytes(Path({str(target)!r}).read_bytes() + b'\\n#changed')")
        with patch.object(stage, "run_stage", wraps=stage.run_stage) as launch:
            with self.assertRaisesRegex(ValueError, "changed during storage lifecycle"):
                stage.probe(self.root, self.app)
            self.assertEqual(launch.call_count, 1)
        self.assertFalse((self.root / stage.RECEIPT).exists())

    def test_changed_binary_is_refused_before_read_launch(self):
        self.assert_mutation_refused_before_relaunch(self.exe)

    def test_changed_config_is_refused_before_read_launch(self):
        self.assert_mutation_refused_before_relaunch(self.root / "tauri.qa.json")

    def test_created_ordinary_settings_refused(self):
        self.script(extra=f"Path({str(self.root / 'settings/settings.toml')!r}).write_text('unexpected')")
        with self.assertRaisesRegex(ValueError, "ordinary app stores"):
            stage.probe(self.root, self.app)
        self.assertFalse((self.root / stage.RECEIPT).exists())

    def test_timeout_terminates_only_own_process_group(self):
        pid = self.root / "tmp/stage.pid"
        self.script(extra=f"Path({str(pid)!r}).write_text(str(os.getpid()))\ntime.sleep(10)")
        with patch.object(stage, "TIMEOUT_SECONDS", 1), self.assertRaises(subprocess.TimeoutExpired):
            stage.probe(self.root, self.app)
        with self.assertRaises(ProcessLookupError):
            os.kill(int(pid.read_text()), 0)
        self.assertFalse((self.root / stage.RECEIPT).exists())

    def test_credentials_are_not_forwarded(self):
        self.script(extra="assert 'OPENAI_API_KEY' not in os.environ")
        with patch.dict(os.environ, {"OPENAI_API_KEY": "fixture-only"}):
            stage.probe(self.root, self.app)


if __name__ == "__main__":
    unittest.main()
