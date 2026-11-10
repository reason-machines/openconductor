import json
import os
from pathlib import Path
import plistlib
import sys
import tempfile
import unittest
from unittest.mock import patch

from tools import native_qa as qa
from tools.test_native_qa_runner import portable_transport


class NativeQaTests(unittest.TestCase):
    def setUp(self):
        self.enterContext(portable_transport())
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.parent = Path(self.tmp.name).resolve()
        self.root = self.parent / "fresh"
        with patch.object(qa.subprocess, "check_output", side_effect=["a" * 40 + "\n", b""]):
            self.manifest = qa.prepare(self.root)
        self.app = self.root / "OpenConductor QA.app"
        (self.app / "Contents/MacOS").mkdir(parents=True)
        (self.app / "Contents/Info.plist").write_bytes(plistlib.dumps({
            "CFBundleIdentifier": self.manifest["identifier"], "CFBundleExecutable": "qa-fixture",
        }))
        self.exe = self.app / "Contents/MacOS/qa-fixture"
        self.receipt = {
            "probe_version": qa.VERSION, "identifier": self.manifest["identifier"],
            "executable": str(self.exe), "webview_incognito": True,
            **{key: str(self.root / "app-data") for key in qa.PATH_FIELDS},
            "app_cache_dir": str(self.root / "app-data/caches"),
            "app_log_dir": str(self.root / "app-data/logs"),
            "settings_file": str(self.root / "settings/settings.toml"),
            "database": str(self.root / "app-data/conductor.db"),
            "cache_database": str(self.root / "app-data/cache.db"),
        }
        self.script()

    def script(self, extra="", marker=True):
        self.exe.write_text(f"#!{sys.executable}\n# {qa.VERSION if marker else 'old binary'}\n"
                            "import json, sys\nfrom pathlib import Path\n"
                            "assert sys.argv[1:] == ['--oc-qa-paths']\n" + extra +
                            "\nprint(" + repr(json.dumps(self.receipt if marker else {})) + ")\n")
        self.exe.chmod(0o700)

    def test_prepared_config_overrides_all_app_paths_and_disables_webview_persistence(self):
        cfg = json.loads((self.root / "tauri.qa.json").read_text())
        self.assertTrue(cfg["identifier"].startswith(qa.PREFIX))
        self.assertEqual(cfg["app"]["appDirectoriesOverride"], str(self.root / "app-data"))
        self.assertTrue(all(not w["create"] and w["incognito"] for w in cfg["app"]["windows"]))
        self.assertEqual(self.root.stat().st_mode & 0o777, 0o700)
        self.assertFalse((self.root / "app-data").exists())

    def test_success_records_paths_without_starting_gui_or_creating_stores(self):
        receipt = qa.probe(self.root, self.app)
        self.assertEqual(len(receipt["binary_sha256"]), 64)
        self.assertEqual(receipt["prepared_source_sha"], "a" * 40)
        self.assertFalse((self.root / "app-data").exists())
        self.assertIn("no GUI or WebKit", receipt["scope"])

    def test_refuses_reused_root(self):
        with self.assertRaisesRegex(ValueError, "new root"):
            qa.prepare(self.root)

    def test_refuses_symlinked_root(self):
        link = self.parent / "alias"
        link.symlink_to(self.root, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "canonical"):
            qa.probe(link, self.app)

    def test_refuses_world_accessible_root(self):
        self.root.chmod(0o755)
        with self.assertRaisesRegex(ValueError, "0700"):
            qa.probe(self.root, self.app)

    def test_refuses_normal_identifier_before_execution(self):
        (self.app / "Contents/Info.plist").write_bytes(plistlib.dumps({
            "CFBundleIdentifier": "com.reasonmachines.openconductor", "CFBundleExecutable": "qa-fixture",
        }))
        with self.assertRaisesRegex(ValueError, "identifier differs"):
            qa.probe(self.root, self.app)

    def test_refuses_old_binary_before_execution(self):
        self.script(extra="raise RuntimeError('must never execute')", marker=False)
        with self.assertRaisesRegex(ValueError, "old GUI"):
            qa.probe(self.root, self.app)

    def test_refuses_modified_config(self):
        (self.root / "tauri.qa.json").write_text("{}")
        with self.assertRaisesRegex(ValueError, "config changed"):
            qa.probe(self.root, self.app)

    def test_refuses_any_store_outside_root(self):
        for key in qa.PATH_FIELDS:
            with self.subTest(key=key):
                receipt = dict(self.receipt, **{key: str(self.parent / "preserved")})
                with self.assertRaisesRegex(ValueError, "escapes"):
                    qa.validate_receipt(self.root, receipt, self.manifest, self.exe)

    def test_refuses_symlink_escape_and_traversal(self):
        (self.root / "escape").symlink_to(self.parent)
        for path in (self.root / "escape/preserved", self.root / "tmp/../../preserved"):
            with self.assertRaises(ValueError):
                qa.inside(self.root, path)

    def test_refuses_preexisting_stores_before_execution(self):
        (self.root / "app-data").mkdir()
        with self.assertRaisesRegex(ValueError, "unused app-data"):
            qa.probe(self.root, self.app)

    def test_refuses_probe_that_writes_app_stores(self):
        self.script(extra=f"Path({str(self.root / 'app-data')!r}).mkdir()")
        with self.assertRaisesRegex(ValueError, "unexpectedly created"):
            qa.probe(self.root, self.app)
        self.assertFalse((self.root / "paths-receipt.json").exists())

    def test_refuses_nonzero_probe_and_persistent_webview(self):
        self.script(extra="sys.exit(3)")
        with self.assertRaisesRegex(ValueError, "exit 3"):
            qa.probe(self.root, self.app)
        self.receipt["webview_incognito"] = False
        self.script()
        with self.assertRaisesRegex(ValueError, "nonpersistent"):
            qa.probe(self.root, self.app)

    def test_env_has_no_ambient_auth_or_sidecar_overrides(self):
        with patch.dict(os.environ, {"CONDUCTOR_SESSION_EVENT_OUTBOX_ROOT": "/preserved",
                                     "OPENAI_API_KEY": "fixture-only", "REASON_API_KEY": "fixture-only"}):
            env = qa.environment(self.root)
        self.assertNotIn("OPENAI_API_KEY", env)
        self.assertNotIn("REASON_API_KEY", env)
        self.assertNotIn("CONDUCTOR_SESSION_EVENT_OUTBOX_ROOT", env)
        self.assertEqual(env["OC_NATIVE_QA_ROOT"], str(self.root))


if __name__ == "__main__":
    unittest.main()
