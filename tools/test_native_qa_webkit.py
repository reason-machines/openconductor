import hashlib
import json
import os
from pathlib import Path
import plistlib
import sys
import tempfile
import unittest
from unittest.mock import patch

from tools.test_native_qa_runner import portable_transport

from tools import native_qa_webkit as wk


class WebKitQaTests(unittest.TestCase):
    def setUp(self):
        self.enterContext(portable_transport())
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.parent = Path(self.tmp.name).resolve()
        self.root = self.parent / "fresh"
        with patch.object(wk.qa.subprocess, "check_output", side_effect=["b" * 40 + "\n", b""]):
            self.manifest = wk.qa.prepare(self.root)
        self.app = self.root / "QA.app"
        (self.app / "Contents/MacOS").mkdir(parents=True)
        (self.app / "Contents/Info.plist").write_bytes(plistlib.dumps({
            "CFBundleIdentifier": self.manifest["identifier"], "CFBundleExecutable": "fixture",
        }))
        self.exe = self.app / "Contents/MacOS/fixture"
        self.receipt = {
            "probe_version": wk.VERSION, "identifier": self.manifest["identifier"],
            "executable": str(self.exe), "webview_incognito": True,
            **{key: str(self.root / "app-data") for key in wk.qa.PATH_FIELDS},
            "settings_file": str(self.root / "settings/settings.toml"),
            "database": str(self.root / "app-data/conductor.db"),
            "cache_database": str(self.root / "app-data/cache.db"),
            "webkit_data_store_persistent": False, "native_window_visible": False,
            "javascript_disabled_requested": True, "navigation_policy_all_denied": True,
            "new_window_policy_all_denied": True, "bootstrap_url": "about:blank",
            "inspection_after_bootstrap_construction": True,
        }
        self.script()

    def script(self, extra="", marker=True):
        self.exe.write_text(f"#!{sys.executable}\n# {wk.VERSION if marker else 'old-binary'}\n"
                            "import json, sys, time\nfrom pathlib import Path\n"
                            "assert sys.argv[1:] == ['--oc-qa-webkit']\n" + extra +
                            "\nprint(" + repr(json.dumps(self.receipt if marker else dict(self.receipt, probe_version=wk.qa.VERSION))) + ")\n")
        self.exe.chmod(0o700)
        previous = dict(self.receipt, probe_version=wk.qa.VERSION,
                        binary_sha256=hashlib.sha256(self.exe.read_bytes()).hexdigest(),
                        config_sha256=self.manifest["config_sha256"],
                        prepared_source_sha=self.manifest["source_sha"])
        (self.root / "paths-receipt.json").write_text(json.dumps(previous))

    def test_success_is_runtime_only_and_retains_provenance(self):
        receipt = wk.probe(self.root, self.app)
        self.assertIs(receipt["webkit_data_store_persistent"], False)
        self.assertIn("after inert bootstrap", receipt["scope"])
        self.assertIn("not full filesystem", receipt["scope"])
        self.assertEqual(receipt["binary_sha256"], hashlib.sha256(self.exe.read_bytes()).hexdigest())
        self.assertEqual((self.root / "webkit-receipt.json").stat().st_mode & 0o777, 0o600)

    def test_requires_prior_same_binary_path_receipt(self):
        self.exe.write_text(self.exe.read_text() + "# changed binary\n")
        with self.assertRaisesRegex(ValueError, "exact binary"):
            wk.probe(self.root, self.app)

    def test_refuses_path_only_binary_before_execution(self):
        self.script(extra="raise RuntimeError('must not execute')", marker=False)
        with self.assertRaisesRegex(ValueError, "separate WebKit probe"):
            wk.probe(self.root, self.app)

    def test_requires_matching_config_and_source_receipts(self):
        previous_path = self.root / "paths-receipt.json"
        previous = json.loads(previous_path.read_text())
        for key in ("config_sha256", "prepared_source_sha"):
            with self.subTest(key=key):
                previous_path.write_text(json.dumps(dict(previous, **{key: "incorrect"})))
                with self.assertRaises(ValueError):
                    wk.probe(self.root, self.app)

    def test_rejects_missing_or_false_control_policy(self):
        for key in ("javascript_disabled_requested", "navigation_policy_all_denied", "new_window_policy_all_denied",
                    "inspection_after_bootstrap_construction"):
            with self.subTest(key=key):
                for value in (None, False, 1):
                    with self.assertRaises(ValueError):
                        wk.validate_receipt(self.root, dict(self.receipt, **{key: value}), self.manifest, self.exe)

    def test_rejects_persistent_visible_or_unobserved_webview(self):
        for key in ("webkit_data_store_persistent", "native_window_visible"):
            with self.subTest(key=key):
                for value in (None, True, 0):
                    with self.assertRaises(ValueError):
                        wk.validate_receipt(self.root, dict(self.receipt, **{key: value}), self.manifest, self.exe)

    def test_refuses_app_content_or_old_receipt_version(self):
        for changes in ({"bootstrap_url": "tauri://localhost"}, {"probe_version": wk.qa.VERSION}):
            with self.assertRaises(ValueError):
                wk.validate_receipt(self.root, dict(self.receipt, **changes), self.manifest, self.exe)

    def test_refuses_escaped_store_paths(self):
        for key in wk.qa.PATH_FIELDS:
            with self.subTest(key=key), self.assertRaises(ValueError):
                wk.validate_receipt(self.root, dict(self.receipt, **{key: str(self.parent / "preserved")}), self.manifest, self.exe)

    def test_refuses_reused_runtime_fixture(self):
        wk.probe(self.root, self.app)
        with self.assertRaisesRegex(ValueError, "unused runtime"):
            wk.probe(self.root, self.app)

    def test_refuses_existing_or_created_ordinary_stores(self):
        self.script(extra=f"Path({str(self.root / 'settings/settings.toml')!r}).write_text('unexpected')")
        with self.assertRaisesRegex(ValueError, "unexpectedly created"):
            wk.probe(self.root, self.app)
        self.assertFalse((self.root / "webkit-receipt.json").exists())
        with self.assertRaisesRegex(ValueError, "unused app-data"):
            wk.probe(self.root, self.app)

    def test_timeout_terminates_probe_without_success_receipt(self):
        pid_file = self.root / "tmp/probe.pid"
        self.script(extra=f"import os\nPath({str(pid_file)!r}).write_text(str(os.getpid()))\ntime.sleep(10)")
        with patch.object(wk, "TIMEOUT_SECONDS", 1), self.assertRaises(wk.subprocess.TimeoutExpired):
            wk.probe(self.root, self.app)
        with self.assertRaises(ProcessLookupError):
            os.kill(int(pid_file.read_text()), 0)
        self.assertFalse((self.root / "webkit-receipt.json").exists())

    def test_nonzero_result_has_no_success_receipt(self):
        self.script(extra="sys.exit(4)")
        with self.assertRaisesRegex(ValueError, "exit 4"):
            wk.probe(self.root, self.app)
        self.assertFalse((self.root / "webkit-receipt.json").exists())

    def test_no_ambient_provider_credentials_are_forwarded(self):
        self.script(extra="import os\nassert 'OPENAI_API_KEY' not in os.environ")
        with patch.dict(os.environ, {"OPENAI_API_KEY": "fixture-only"}):
            wk.probe(self.root, self.app)


if __name__ == "__main__":
    unittest.main()
