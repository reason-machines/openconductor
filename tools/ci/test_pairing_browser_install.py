import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("install-pairing-browser.sh")
ROOT = Path(__file__).resolve().parents[2]
CLI = Path(os.environ.get("PLAYWRIGHT_CLI", ROOT / "node_modules/playwright-core/cli.js"))


class PairingBrowserInstallTest(unittest.TestCase):
    def run_installer(self, apt_status=0, browser_status=0):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            shutil.copy(SCRIPT, root / SCRIPT.name)
            recorder = '''#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
name = Path(sys.argv[0]).name
with open(os.environ["PAIRING_TEST_LOG"], "a") as output:
    output.write(json.dumps([name, *sys.argv[1:]]) + "\\n")
sys.exit(int(os.environ["APT_STATUS" if name == "apt-install.sh" else "BROWSER_STATUS"]))
'''
            for name in ("apt-install.sh", "npx"):
                executable = root / name
                executable.write_text(recorder)
                executable.chmod(0o755)
            log = root / "commands.jsonl"
            env = {**os.environ, "PATH": f"{root}:{os.environ['PATH']}",
                   "PAIRING_TEST_LOG": str(log), "APT_STATUS": str(apt_status),
                   "BROWSER_STATUS": str(browser_status)}
            result = subprocess.run(["bash", str(root / SCRIPT.name)], env=env,
                                    capture_output=True, text=True, timeout=10)
            records = [json.loads(line) for line in log.read_text().splitlines()]
            return result, records

    def test_installs_system_packages_before_browser_only_download(self):
        result, records = self.run_installer()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(len(records), 2)
        self.assertEqual(records[0][0], "apt-install.sh")
        self.assertEqual(records[0][1], "--no-install-recommends")
        self.assertGreater(len(records[0][2:]), 1)
        self.assertEqual(records[1], ["npx", "--no-install", "playwright-core", "install", "chromium"])

    def test_failed_system_install_never_downloads_browser(self):
        result, records = self.run_installer(apt_status=23)
        self.assertEqual(result.returncode, 23, result.stdout + result.stderr)
        self.assertEqual([record[0] for record in records], ["apt-install.sh"])

    def test_browser_download_failure_still_fails_setup(self):
        result, _ = self.run_installer(browser_status=24)
        self.assertEqual(result.returncode, 24, result.stdout + result.stderr)

    def test_package_set_matches_locked_playwright_on_workflow_platform(self):
        self.assertTrue(CLI.is_file(), f"Install locked playwright-core first: {CLI}")
        _, records = self.run_installer()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            log = root / "packages.json"
            apt = root / "apt-get"
            apt.write_text('''#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
assert sys.argv[1:4] == ["install", "-s", "--no-install-recommends"]
Path(os.environ["PAIRING_PACKAGES"]).write_text(json.dumps(sys.argv[4:]))
''')
            apt.chmod(0o755)
            result = subprocess.run(
                ["node", str(CLI.resolve()), "install-deps", "--dry-run", "chromium"],
                env={**os.environ, "PATH": f"{root}:{os.environ['PATH']}",
                     "PAIRING_PACKAGES": str(log),
                     "PLAYWRIGHT_HOST_PLATFORM_OVERRIDE": "ubuntu22.04-x64"},
                capture_output=True, text=True, timeout=15)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertEqual(set(records[0][2:]), set(json.loads(log.read_text())))

    def test_real_bounded_helper_stops_after_three_metadata_failures(self):
        import test_apt_install as apt_tests
        from unittest.mock import patch

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            marker = root / "browser-started"
            npx = root / "npx"
            npx.write_text(f'#!/bin/sh\ntouch "{marker}"\n')
            npx.chmod(0o755)
            with patch.object(apt_tests, "SCRIPT", SCRIPT), patch.dict(
                    os.environ, {"PATH": f"{root}:{os.environ['PATH']}"}):
                result, records = apt_tests.AptInstallTest().run_installer("missing-metadata")
            self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertEqual([record["operation"] for record in records], ["update"] * 3)
            self.assertFalse(marker.exists(), "Browser download ran after failed metadata")

    def test_workflow_uses_the_supported_package_platform(self):
        workflow = (ROOT / ".github/workflows/reason-pairing.yml").read_text()
        self.assertIn("runs-on: ubuntu-22.04", workflow)
        self.assertIn("run: tools/ci/install-pairing-browser.sh", workflow)
        self.assertIn("python3 tools/ci/test_pairing_browser_install.py -v", workflow)
        self.assertIn("on:\n  workflow_dispatch:\n", workflow)
        self.assertNotIn("install --with-deps", workflow)


if __name__ == "__main__":
    unittest.main()
