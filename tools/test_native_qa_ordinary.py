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

from tools.test_native_qa_runner import portable_transport, stage_fixed_files

from tools import native_qa_ordinary as gate


class OrdinaryQaTests(unittest.TestCase):
    def setUp(self):
        self.enterContext(portable_transport())
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        parent = Path(self.tmp.name).resolve()
        self.root = parent / "fresh"
        with patch.object(gate.wk.qa.subprocess, "check_output", side_effect=["a" * 40 + "\n", b""]):
            self.manifest = gate.wk.qa.prepare(self.root)
        stage_fixed_files(self.root)
        self.app = self.root / "QA.app"
        (self.app / "Contents/MacOS").mkdir(parents=True)
        (self.app / "Contents/Info.plist").write_bytes(plistlib.dumps({
            "CFBundleIdentifier": self.manifest["identifier"], "CFBundleExecutable": "fixture",
        }))
        self.exe = self.app / "Contents/MacOS/fixture"
        self.receipt = {
            "probe_version": gate.VERSION, "identifier": self.manifest["identifier"],
            "executable": str(self.exe), "webview_incognito": True,
            **{key: str(self.root / "app-data") for key in gate.wk.qa.PATH_FIELDS},
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
        self.exe.write_text(f"#!{sys.executable}\n# {gate.wk.VERSION}\n"
                            f"# {gate.VERSION if marker else 'old-binary'}\n"
                            "import json, sys, time, os\nfrom pathlib import Path\n"
                            "assert sys.argv[1:] == []\n" + extra +
                            "\nprint(" + repr(json.dumps(self.receipt if marker else dict(self.receipt, probe_version=gate.wk.VERSION))) + ")\n")
        self.exe.chmod(0o700)
        previous = dict(self.receipt, probe_version=gate.wk.qa.VERSION,
                        binary_sha256=hashlib.sha256(self.exe.read_bytes()).hexdigest(),
                        config_sha256=self.manifest["config_sha256"],
                        prepared_source_sha=self.manifest["source_sha"])
        (self.root / "paths-receipt.json").write_text(json.dumps(previous))

    def test_success_never_claims_cache_proof_or_app_admission(self):
        receipt = gate.probe(self.root, self.app)
        self.assertIs(receipt["app_content_admitted"], False)
        self.assertIs(receipt["ordinary_setup_admitted"], False)
        self.assertIs(receipt["cache_filesystem_verified"], False)
        self.assertIn("no admission capability", receipt["scope"])
        self.assertEqual(receipt["binary_sha256"], hashlib.sha256(self.exe.read_bytes()).hexdigest())
        self.assertEqual((self.root / gate.RECEIPT).stat().st_mode & 0o777, 0o600)

    def test_old_binary_is_refused_before_execution(self):
        self.script(extra="raise RuntimeError('must not execute')", marker=False)
        with self.assertRaisesRegex(ValueError, "lacks fail-closed"):
            gate.probe(self.root, self.app)

    def test_admission_or_cache_claims_are_refused(self):
        for key in ("app_content_admitted", "ordinary_setup_admitted", "cache_filesystem_verified"):
            for value in (None, True, 0):
                with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                    gate.validate_receipt(self.root, dict(self.receipt, **{key: value}), self.manifest, self.exe)

    def test_wrong_window_bootstrap_persistence_and_paths_are_refused(self):
        for changes in ({"window_label": "probe"}, {"bootstrap_url": "tauri://localhost"},
                        {"webkit_data_store_persistent": True}, {"native_window_visible": True},
                        {"app_cache_dir": str(self.root.parent / "preserved")},
                        {"probe_version": gate.wk.VERSION}, {"navigation_policy_all_denied": False}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                gate.validate_receipt(self.root, dict(self.receipt, **changes), self.manifest, self.exe)

    def test_reuse_and_changed_binary_are_refused(self):
        gate.probe(self.root, self.app)
        with self.assertRaisesRegex(ValueError, "unused runtime"):
            gate.probe(self.root, self.app)
        self.exe.write_text(self.exe.read_text() + "# changed\n")
        with self.assertRaisesRegex(ValueError, "exact binary"):
            gate.probe(self.root, self.app)

    def test_config_changes_during_execution_have_no_success_receipt(self):
        config = self.root / "tauri.qa.json"
        self.script(extra=f"Path({str(config)!r}).write_text('{{}}')")
        with self.assertRaisesRegex(ValueError, "config changed"):
            gate.probe(self.root, self.app)
        self.assertFalse((self.root / gate.RECEIPT).exists())

    def test_config_and_source_receipts_must_match(self):
        previous_path = self.root / "paths-receipt.json"
        previous = json.loads(previous_path.read_text())
        for key in ("config_sha256", "prepared_source_sha"):
            with self.subTest(key=key):
                previous_path.write_text(json.dumps(dict(previous, **{key: "incorrect"})))
                with self.assertRaises(ValueError):
                    gate.probe(self.root, self.app)
        self.assertFalse((self.root / gate.RECEIPT).exists())

    def test_store_creation_has_no_success_receipt(self):
        self.script(extra=f"Path({str(self.root / 'settings/settings.toml')!r}).write_text('unexpected')")
        with self.assertRaisesRegex(ValueError, "unexpectedly created"):
            gate.probe(self.root, self.app)
        self.assertFalse((self.root / gate.RECEIPT).exists())

    def test_nonzero_exit_has_no_success_receipt(self):
        self.script(extra="sys.exit(4)")
        with self.assertRaisesRegex(ValueError, "exit 4"):
            gate.probe(self.root, self.app)
        self.assertFalse((self.root / gate.RECEIPT).exists())

    def test_timeout_targets_only_its_process_group(self):
        pid = self.root / "tmp/probe.pid"
        self.script(extra=f"Path({str(pid)!r}).write_text(str(os.getpid()))\ntime.sleep(10)")
        with patch.object(gate, "TIMEOUT_SECONDS", 1), self.assertRaises(subprocess.TimeoutExpired):
            gate.probe(self.root, self.app)
        with self.assertRaises(ProcessLookupError):
            os.kill(int(pid.read_text()), 0)
        self.assertFalse((self.root / gate.RECEIPT).exists())

    def test_no_provider_credentials_are_forwarded(self):
        self.script(extra="assert 'OPENAI_API_KEY' not in os.environ")
        with patch.dict(os.environ, {"OPENAI_API_KEY": "fixture-only"}):
            gate.probe(self.root, self.app)


if __name__ == "__main__":
    unittest.main()
