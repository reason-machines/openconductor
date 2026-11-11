import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("apt-install.sh")
COMMAND = r'''#!/usr/bin/env python3
import json, os, sys
from pathlib import Path

name, args = Path(sys.argv[0]).name, sys.argv[1:]
if name == "sudo":
    os.execvp(args[0], args)
if name == "timeout":
    args = args[3:]
    os.execvp(args[0], args)
if name in ("dpkg", "chown"):
    sys.exit(0)

operation = "update" if "update" in args else "install"
options = dict(args[i + 1].split("=", 1) for i, arg in enumerate(args) if arg == "-o")
log = Path(os.environ["APT_TEST_LOG"])
previous = [json.loads(line) for line in log.read_text().splitlines()] if log.exists() else []
record = {"operation": operation, "options": options,
          "mirror": Path(os.environ["APT_MIRRORS_FILE"]).read_text().splitlines()[0]}
with log.open("a") as output:
    output.write(json.dumps(record) + "\n")
scenario = os.environ["APT_TEST_SCENARIO"]
if operation == "update":
    if scenario == "missing-metadata":
        print("W: Failed to fetch metadata; old index files used instead")
        sys.exit(100 if options.get("APT::Update::Error-Mode") == "any" else 0)
    if scenario == "metadata-retry-budget" and options.get("Acquire::Retries") != "0":
        print("update timed out during internal retries")
        sys.exit(124)
    if scenario in ("ubuntu-dns-failure", "fallback-unavailable"):
        if scenario == "fallback-unavailable" or record["mirror"] != "https://mirrors.kernel.org/ubuntu/\tpriority:1":
            print("Temporary failure resolving Ubuntu archive mirror")
            sys.exit(100)
    if scenario == "mirror-fallback" and sum(r["operation"] == "update" for r in previous) < 2:
        sys.exit(100)
else:
    if scenario == "install-failure":
        sys.exit(100)
    if options.get("Acquire::Retries") != "3":
        sys.exit(101)
sys.exit(0)
'''


class AptInstallTest(unittest.TestCase):
    def run_installer(self, scenario, mirror_text=None):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            commands = root / "bin"
            commands.mkdir()
            for name in ("sudo", "timeout", "apt-get", "dpkg", "chown"):
                executable = commands / name
                executable.write_text(COMMAND)
                executable.chmod(0o755)
            mirrors = root / "mirrors"
            mirrors.write_text(mirror_text or "https://one.invalid/ priority:1\n"
                               "https://two.invalid/ priority:2\n"
                               "https://three.invalid/ priority:3\n")
            log = root / "commands.jsonl"
            env = {**os.environ, "PATH": f"{commands}:{os.environ['PATH']}",
                   "APT_TEST_LOG": str(log), "APT_TEST_SCENARIO": scenario,
                   "APT_MIRRORS_FILE": str(mirrors), "TMPDIR": str(root),
                   "APT_ARCHIVES": str(root / "archives")}
            result = subprocess.run(["bash", str(SCRIPT), "fixture-package"], env=env,
                                    capture_output=True, text=True, timeout=15)
            records = [json.loads(line) for line in log.read_text().splitlines()]
            return result, records

    @unittest.skipUnless(shutil.which("apt-get"), "APT is not installed on this platform")
    def test_real_apt_reports_transient_metadata_errors(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for path in ("conf.d", "sources.list.d", "state/lists/partial", "cache", "log"):
                (root / path).mkdir(parents=True)
            (root / "unused.conf").write_text("")
            (root / "sources.list").write_text("deb http://127.0.0.1:9/ubuntu jammy main\n")
            config = root / "apt.conf"
            config.write_text(f'Dir::Etc "{root}"; Dir::Etc::parts "conf.d"; '
                              f'Dir::Etc::main "unused.conf"; '
                              f'Dir::State "{root}/state"; Dir::Cache "{root}/cache"; '
                              f'Dir::Log "{root}/log";')
            env = {**os.environ, "APT_CONFIG": str(config)}
            command = ["apt-get", "-o", "Debug::NoLocking=true", "-o", "Acquire::Retries=0",
                       "-o", "Acquire::http::Timeout=1"]
            for options, expected in (([], 0), (["-o", "APT::Update::Error-Mode=any"], 100)):
                result = subprocess.run(command + options + ["update"], env=env,
                                        capture_output=True, text=True, timeout=8)
                self.assertEqual(result.returncode, expected, result.stdout + result.stderr)
                self.assertIn("Failed to fetch", result.stdout + result.stderr)

    @unittest.skipUnless(shutil.which("apt-get"), "APT is not installed on this platform")
    def test_real_apt_parses_generated_fallback_priority_as_metadata(self):
        _, records = self.run_installer("fallback-unavailable", self.ubuntu_mirrors)
        fallback = records[-1]["mirror"].replace("https://mirrors.kernel.org",
                                                "http://127.0.0.1:9")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for path in ("conf.d", "sources.list.d", "state/lists/partial", "cache", "log"):
                (root / path).mkdir(parents=True)
            (root / "unused.conf").write_text("")
            (root / "mirrors").write_text(fallback + "\n")
            (root / "sources.list").write_text(f"deb mirror+file:{root}/mirrors jammy main\n")
            config = root / "apt.conf"
            config.write_text(f'Dir::Etc "{root}"; Dir::Etc::parts "conf.d"; '
                              f'Dir::Etc::main "unused.conf"; '
                              f'Dir::State "{root}/state"; Dir::Cache "{root}/cache"; '
                              f'Dir::Log "{root}/log";')
            result = subprocess.run(
                ["apt-get", "-o", "Debug::NoLocking=true", "-o", "Acquire::Retries=0",
                 "-o", "Acquire::http::Timeout=1", "-o", "APT::Update::Error-Mode=any", "update"],
                env={**os.environ, "APT_CONFIG": str(config)},
                capture_output=True, text=True, timeout=8)
            output = result.stdout + result.stderr
            self.assertEqual(result.returncode, 100, output)
            self.assertIn("Err:2 http://127.0.0.1:9/ubuntu jammy InRelease", output)
            self.assertNotIn("priority:1", output)

    def test_failed_metadata_never_reaches_install(self):
        result, records = self.run_installer("missing-metadata")
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertEqual([r["operation"] for r in records], ["update"] * 3)

    def test_metadata_attempt_can_finish_without_nested_retries(self):
        result, records = self.run_installer("metadata-retry-budget")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual([r["operation"] for r in records], ["update", "install"])

    def test_failed_updates_rotate_mirrors_before_install(self):
        result, records = self.run_installer("mirror-fallback")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual([r["operation"] for r in records], ["update"] * 3 + ["install"])
        self.assertEqual([r["mirror"] for r in records[:3]], [
            "https://one.invalid/ priority:1",
            "https://two.invalid/ priority:1",
            "https://three.invalid/ priority:1",
        ])

    ubuntu_mirrors = ("http://azure.archive.ubuntu.com/ubuntu/\tpriority:1\n"
                      "https://archive.ubuntu.com/ubuntu/\tpriority:2\n"
                      "https://security.ubuntu.com/ubuntu/\tpriority:3\n")

    def test_ubuntu_dns_failure_uses_independent_final_mirror(self):
        result, records = self.run_installer("ubuntu-dns-failure", self.ubuntu_mirrors)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual([r["operation"] for r in records], ["update"] * 3 + ["install"])
        self.assertEqual([r["mirror"] for r in records[:3]], [
            "http://azure.archive.ubuntu.com/ubuntu/\tpriority:1",
            "https://archive.ubuntu.com/ubuntu/\tpriority:1",
            "https://mirrors.kernel.org/ubuntu/\tpriority:1",
        ])

    def test_unavailable_independent_mirror_does_not_install(self):
        result, records = self.run_installer("fallback-unavailable", self.ubuntu_mirrors)
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertEqual([r["operation"] for r in records], ["update"] * 3)

    def test_healthy_ubuntu_update_keeps_original_mirror(self):
        result, records = self.run_installer("healthy", self.ubuntu_mirrors)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual([r["operation"] for r in records], ["update", "install"])
        self.assertEqual({r["mirror"] for r in records}, {
            "http://azure.archive.ubuntu.com/ubuntu/\tpriority:1",
        })

    def test_install_failure_does_not_enable_metadata_fallback(self):
        result, records = self.run_installer("install-failure", self.ubuntu_mirrors)
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertEqual([r["operation"] for r in records], ["update"] + ["install"] * 3)
        self.assertEqual(records[-1]["mirror"], "https://security.ubuntu.com/ubuntu/\tpriority:1")

    def test_exhausted_install_attempts_still_fail(self):
        result, records = self.run_installer("install-failure")
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertEqual([r["operation"] for r in records], ["update"] + ["install"] * 3)


if __name__ == "__main__":
    unittest.main()
