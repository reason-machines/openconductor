import json
import os
from pathlib import Path
import plistlib
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from tools import native_qa as qa
from tools import native_qa_cache as cache
from tools import native_qa_ordinary as ordinary
from tools import native_qa_webkit as webkit


class NativeQaStdinTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.parent = Path(self.tmp.name).resolve()
        self.root = self.parent / "fresh"
        with patch.object(qa.subprocess, "check_output", side_effect=["d" * 40 + "\n", b""]):
            self.manifest = qa.prepare(self.root)
        self.app = self.parent / "QA.app"
        (self.app / "Contents/MacOS").mkdir(parents=True)
        (self.app / "Contents/Info.plist").write_bytes(plistlib.dumps({
            "CFBundleIdentifier": self.manifest["identifier"], "CFBundleExecutable": "fixture",
        }))
        self.exe = self.app / "Contents/MacOS/fixture"
        self.receipt = {
            "probe_version": qa.VERSION, "identifier": self.manifest["identifier"],
            "executable": str(self.exe), "webview_incognito": True,
            **{key: str(self.root / "app-data") for key in qa.PATH_FIELDS},
            "settings_file": str(self.root / "settings/settings.toml"),
            "database": str(self.root / "app-data/conductor.db"),
            "cache_database": str(self.root / "app-data/cache.db"),
        }

    def assert_stdin_is_disconnected(self, launch, receipt=None):
        self.exe.write_text(
            f"#!{sys.executable}\n# {qa.VERSION}\n"
            "import json, os\n"
            "received = os.read(0, 1024)\n"
            "try:\n    os.write(0, b'fixture-write-through-stdin')\n"
            "except OSError:\n    pass\n"
            f"receipt = {self.receipt if receipt is None else receipt!r}\n"
            "receipt.update(pid=os.getpid(), stdin_bytes_read=len(received))\n"
            "print(json.dumps(receipt))\n"
        )
        self.exe.chmod(0o700)
        canary = self.parent / "stdin-canary"
        original = b"task-only-synthetic-input"
        canary.write_bytes(original)
        with canary.open("r+b") as stream:
            control = subprocess.run([str(self.exe)], stdin=stream, capture_output=True,
                                     text=True, check=True, env=qa.environment(self.root))
        self.assertEqual(json.loads(control.stdout)["stdin_bytes_read"], len(original))
        self.assertNotEqual(canary.read_bytes(), original)
        canary.write_bytes(original)
        stdin_inheritable = os.get_inheritable(0)
        saved_stdin = os.dup(0)
        try:
            with canary.open("r+b") as stream:
                os.dup2(stream.fileno(), 0)
                observed = launch()
        finally:
            os.dup2(saved_stdin, 0, inheritable=stdin_inheritable)
            os.close(saved_stdin)
        self.assertEqual(canary.read_bytes(), original, "probe inherited writable caller stdin")
        self.assertEqual(observed["stdin_bytes_read"], 0, "probe read caller stdin")

    def test_path_probe_cannot_read_or_write_caller_stdin(self):
        self.assert_stdin_is_disconnected(lambda: qa.probe(self.root, self.app))

    def test_webkit_probe_cannot_read_or_write_caller_stdin(self):
        self.assert_stdin_is_disconnected(lambda: webkit.run_probe(self.exe, self.root))

    def test_ordinary_prerequisite_cannot_read_or_write_caller_stdin(self):
        self.assert_stdin_is_disconnected(lambda: ordinary.run_prerequisite(self.exe, self.root))

    def test_storage_stage_cannot_read_or_write_caller_stdin(self):
        token = "a" * 32
        receipt = {
            "probe_version": cache.VERSION, "phase": "write", "token": token,
            "webkit_data_store_persistent": False, "native_window_visible": False,
            "ordinary_app_content_admitted": False, "filesystem_coverage_verified": False,
            "inspection_after_inert_bootstrap": True, "synthetic_content_only": True,
            **{key: "written-read-back" for key in ("local_storage", "indexed_db", "cache_storage")},
        }
        self.assert_stdin_is_disconnected(
            lambda: cache.run_stage(self.exe, self.root, "write", token), receipt,
        )


if __name__ == "__main__":
    unittest.main()
