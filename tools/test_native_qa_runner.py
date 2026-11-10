"""Portable transport contracts are not enforcement proof.

NativeSentinelTests run only the embedded synthetic C program in an explicitly
selected fresh GitHub macOS job. They never launch OpenConductor or WebKit.
"""
import ast
import contextlib
import errno
import hashlib
import json
import os
from pathlib import Path
import platform
import plistlib
import stat
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from tools import native_qa_runner as runner
from tools.native_qa import environment


@contextlib.contextmanager
def portable_transport():
    """Replace only OS confinement transport for portable receipt fixtures."""
    with patch.object(runner, "_sandbox_command", side_effect=lambda spec: [
        str(spec.executable), *spec.probe.arguments,
    ]):
        yield


def stage_fixed_files(root):
    """Precreate the exact synthetic files required by the launch contract."""
    for relative in runner.MUTABLE_FILES.values():
        path = root / relative
        path.parent.mkdir(mode=0o700, exist_ok=True)
        path.write_bytes(b"")
        path.chmod(0o600)


class RunnerContractTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.parent = Path(self.tmp.name).resolve()
        self.root = self.parent / "root"
        self.root.mkdir(mode=0o700)
        self.exe = self.root / "fixture"
        self.exe.write_text("synthetic executable; never run without explicit portable transport")
        self.exe.chmod(0o700)
        stage_fixed_files(self.root)

    def spec(self, probe=None, **changes):
        return runner.LaunchSpec(self.root, self.exe, probe or runner.Probe.PATHS, **changes)

    def test_non_macos_is_refused_without_starting_a_process(self):
        with patch.object(runner.sys, "platform", "linux"), patch.object(runner.subprocess, "Popen") as launch:
            with self.assertRaisesRegex(ValueError, "macOS"):
                runner.run_probe(self.spec())
            launch.assert_not_called()

    def test_missing_enforcement_transport_has_no_unconfined_fallback(self):
        with patch.object(runner.sys, "platform", "darwin"), patch.object(runner, "SANDBOX_EXEC", self.parent / "missing"):
            with patch.object(runner.subprocess, "Popen") as launch:
                with self.assertRaisesRegex(ValueError, "sandbox"):
                    runner.run_probe(self.spec())
                launch.assert_not_called()

    def test_symlink_root_and_nonprivate_root_are_refused(self):
        alias = self.parent / "alias"
        alias.symlink_to(self.root, target_is_directory=True)
        for root in (alias, self.root):
            if root == self.root:
                root.chmod(0o755)
            with self.subTest(root=root), patch.object(runner.subprocess, "Popen") as launch:
                with self.assertRaises(ValueError):
                    runner.run_probe(runner.LaunchSpec(root, self.exe, runner.Probe.PATHS))
                launch.assert_not_called()

    def test_preexisting_hardlinked_files_refused_before_transport(self):
        outside = self.parent / "canary"
        outside.write_text("synthetic")
        os.link(outside, self.root / "alias")
        with patch.object(runner.subprocess, "Popen") as launch:
            with self.assertRaisesRegex(ValueError, "hard.link"):
                runner.run_probe(self.spec())
            launch.assert_not_called()
        self.assertEqual(outside.read_text(), "synthetic")

    def test_preexisting_symlinks_refused_before_transport(self):
        (self.root / "alias").symlink_to(self.parent)
        with patch.object(runner.subprocess, "Popen") as launch:
            with self.assertRaisesRegex(ValueError, "symlink"):
                runner.run_probe(self.spec())
            launch.assert_not_called()

    def test_external_or_mutable_executable_refused(self):
        external = self.parent / "external"
        external.write_bytes(self.exe.read_bytes())
        external.chmod(0o700)
        mutable = self.root / "data/executable"
        mutable.write_bytes(self.exe.read_bytes())
        mutable.chmod(0o700)
        for executable in (external, mutable):
            with self.subTest(executable=executable), self.assertRaises(ValueError):
                runner.run_probe(runner.LaunchSpec(self.root, executable, runner.Probe.PATHS))

    def test_storage_token_and_timeout_are_bounded(self):
        for changes in ({"token": "not-a-fixture-token"}, {"timeout_seconds": 0},
                        {"timeout_seconds": 31}, {"timeout_seconds": float("nan")}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                runner.run_probe(self.spec(**changes))
        with self.assertRaises(ValueError):
            runner.run_probe(self.spec(runner.Probe.STORAGE_WRITE))

    def test_mutable_files_require_private_modes_on_every_launch(self):
        state = self.root / "data/confinement-state"
        state.write_text("synthetic")
        state.chmod(0o644)
        with portable_transport(), patch.object(runner.subprocess, "Popen") as launch:
            with self.assertRaisesRegex(ValueError, "0600"):
                runner.run_probe(self.spec())
            launch.assert_not_called()

    def assert_no_launch(self):
        return patch.object(runner.subprocess, "Popen", side_effect=AssertionError("preflight allowed launch"))

    def test_walk_errors_are_not_silently_ignored(self):
        def failed_walk(root, *, followlinks, onerror=None):
            if onerror is not None:
                onerror(PermissionError(errno.EACCES, "synthetic traversal failure", str(root)))
            return iter(())

        with patch.object(runner.os, "walk", side_effect=failed_walk), portable_transport():
            with self.assert_no_launch() as launch:
                with self.assertRaisesRegex(OSError, "traversal failure"):
                    runner.run_probe(self.spec())
                launch.assert_not_called()

    def test_unlistable_data_directory_cannot_hide_a_mutable_hardlink(self):
        self.assertNotEqual(os.geteuid(), 0, "this regression requires a nonroot test worker")
        outside = self.parent / "outside"
        outside.write_bytes(b"synthetic")
        outside.chmod(0o600)
        state = self.root / "data/confinement-state"
        state.unlink()
        os.link(outside, state)
        data = self.root / "data"
        data.chmod(0o300)
        try:
            with portable_transport(), self.assert_no_launch() as launch:
                with self.assertRaisesRegex((OSError, ValueError), "hard.link|travers|staging"):
                    runner.run_probe(self.spec())
                launch.assert_not_called()
        finally:
            data.chmod(0o700)
        self.assertEqual(outside.read_bytes(), b"synthetic")

    def test_critical_files_are_checked_independently_of_tree_walk(self):
        outside = self.parent / "outside"
        outside.write_bytes(b"synthetic")
        outside.chmod(0o700)
        paths = [self.exe, *(self.root / relative for relative in runner.MUTABLE_FILES.values())]
        for path in paths:
            original, mode = path.read_bytes(), stat.S_IMODE(path.stat().st_mode)
            path.unlink()
            outside.chmod(mode)
            os.link(outside, path)
            try:
                with self.subTest(path=path), patch.object(runner.os, "walk", return_value=iter(())):
                    with portable_transport(), self.assert_no_launch() as launch:
                        with self.assertRaisesRegex(ValueError, "hard.link"):
                            runner.run_probe(self.spec())
                        launch.assert_not_called()
            finally:
                path.unlink()
                path.write_bytes(original)
                path.chmod(mode)

    def test_mutable_parent_symlinks_are_checked_independently_of_tree_walk(self):
        data = self.root / "data"
        moved = self.parent / "moved-data"
        data.rename(moved)
        data.symlink_to(moved, target_is_directory=True)
        with patch.object(runner.os, "walk", return_value=iter(())), portable_transport():
            with self.assert_no_launch() as launch:
                with self.assertRaisesRegex(ValueError, "symlink"):
                    runner.run_probe(self.spec())
                launch.assert_not_called()

    def test_critical_ownership_and_types_are_checked_independently(self):
        original_lstat = Path.lstat
        paths = [self.root, self.exe, self.root / "data", self.root / "tmp",
                 *(self.root / relative for relative in runner.MUTABLE_FILES.values())]
        for path in paths:
            for field, value in ((4, os.geteuid() + 1), (0, stat.S_IFIFO | 0o600)):
                def changed_info(candidate, *args, **kwargs):
                    info = original_lstat(candidate, *args, **kwargs)
                    if candidate == path:
                        values = list(info)
                        values[field] = value
                        return os.stat_result(values)
                    return info

                with self.subTest(path=path, field=field), portable_transport():
                    with patch.object(runner.os, "walk", return_value=iter(())):
                        with patch.object(runner.Path, "lstat", autospec=True, side_effect=changed_info):
                            with self.assert_no_launch() as launch:
                                with self.assertRaisesRegex(ValueError, "unowned|unsupported"):
                                    runner.run_probe(self.spec())
                                launch.assert_not_called()

    def test_directory_link_counts_do_not_use_the_regular_file_invariant(self):
        original_lstat = Path.lstat

        def directory_links(path, *args, **kwargs):
            info = original_lstat(path, *args, **kwargs)
            if stat.S_ISDIR(info.st_mode):
                values = list(info)
                values[3] = 42
                return os.stat_result(values)
            return info

        with patch.object(runner.Path, "lstat", autospec=True, side_effect=directory_links):
            self.assertEqual(runner._validate(self.spec()), runner.Probe.PATHS.timeout_seconds)

    def test_hosted_suite_rejects_skips_and_wrong_counts(self):
        for count, skipped, successful, expected in ((4, [], True, 0), (3, [], True, 1),
                                                     (4, [("fixture", "skipped")], True, 1),
                                                     (4, [], False, 1)):
            result = unittest.TestResult()
            result.testsRun, result.skipped = count, skipped
            with patch.object(result, "wasSuccessful", return_value=successful):
                with patch.object(unittest.TextTestRunner, "run", return_value=result):
                    self.assertEqual(run_native_sentinel_suite(), expected)
        with patch.object(unittest.TestSuite, "countTestCases", return_value=3):
            with patch.object(unittest.TextTestRunner, "run") as run:
                self.assertEqual(run_native_sentinel_suite(), 1)
                run.assert_not_called()

    def test_fixed_files_must_be_precreated(self):
        (self.root / "tmp/confinement-child").unlink()
        with portable_transport(), self.assert_no_launch() as launch:
            with self.assertRaises(FileNotFoundError):
                runner.run_probe(self.spec())
            launch.assert_not_called()

    def test_native_failure_is_not_retried_unconfined(self):
        with portable_transport(), patch.object(runner.subprocess, "Popen", side_effect=OSError("transport failure")) as launch:
            with self.assertRaisesRegex(OSError, "transport failure"):
                runner.run_probe(self.spec())
            self.assertEqual(launch.call_count, 1)

    def test_completed_failure_keeps_status_and_stderr(self):
        self.exe.write_text(f"#!{sys.executable}\nimport sys\nprint('out')\nprint('failure', file=sys.stderr)\nsys.exit(7)\n")
        with portable_transport():
            result = runner.run_probe(self.spec())
        self.assertGreater(result.pid, 0)
        self.assertEqual(result.returncode, 7)
        self.assertEqual(result.stdout, "out\n")
        self.assertEqual(result.stderr, "failure\n")
        self.assertEqual(result.policy_version, runner.POLICY_VERSION)
        self.assertEqual(result.policy_sha256, hashlib.sha256(runner.POLICY.encode()).hexdigest())
        self.assertEqual(result.policy_receipt["parameters"], runner._policy_parameters(self.spec()))

    def test_policy_is_default_deny_and_path_parameters_are_not_syntax(self):
        self.assertIn("(deny default)", runner.POLICY)
        for forbidden in ("(allow default)", "(import", "(allow mach", "(allow network", "file-write*", "file-write-create"):
            self.assertNotIn(forbidden, runner.POLICY)
        self.assertEqual(runner.POLICY.count("(allow file-write-data"), len(runner.MUTABLE_FILES))
        self.assertIn('(literal "/")', runner.POLICY)
        self.assertNotIn('(subpath "/")', runner.POLICY)
        with patch.object(runner.sys, "platform", "darwin"), patch.object(runner.Path, "is_file", return_value=True), patch.object(runner.os, "access", return_value=True):
            command = runner._sandbox_command(self.spec())
        self.assertEqual(command[command.index("-p") + 1], runner.POLICY)
        self.assertNotIn(str(self.root), runner.POLICY)
        self.assertIn(f"QA_ROOT={self.root}", command)
        self.assertEqual(command[-2:], [str(self.exe), "--oc-qa-paths"])

    def test_all_four_launch_sites_have_no_direct_native_subprocess(self):
        sites = {"native_qa.py": "probe", "native_qa_webkit.py": "run_probe",
                 "native_qa_ordinary.py": "run_prerequisite", "native_qa_cache.py": "run_stage"}
        for filename, function in sites.items():
            tree = ast.parse(Path(__file__).with_name(filename).read_text())
            body = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == function)
            calls = [node.func for node in ast.walk(body) if isinstance(node, ast.Call)]
            with self.subTest(filename=filename):
                self.assertFalse(any(isinstance(call, ast.Attribute) and isinstance(call.value, ast.Name)
                                     and call.value.id == "subprocess" for call in calls))
                self.assertTrue(any(isinstance(call, ast.Attribute) and call.attr == "run_probe" for call in calls))


SENTINEL_C = r'''
#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>

static int write_path(const char *path) {
    int fd = open(path, O_WRONLY | O_TRUNC);
    if (fd < 0) return errno;
    int result = write(fd, "changed", 7) == 7 ? 0 : errno;
    close(fd);
    return result;
}
int main(int argc, char **argv) {
    const char *root = getenv("OC_NATIVE_QA_ROOT");
    if (root == NULL || chdir(root) != 0) return 80;
    if (argc == 2 && strcmp(argv[1], "unauthorized-exec") == 0) {
        printf("0\n");
        return 0;
    }
    if (argc == 2 && strcmp(argv[1], "child") == 0) {
        int result = write_path("../sibling/child");
        printf("%d\n", result);
        return result == 0 ? 0 : 20;
    }
    int marker = open("tmp/confinement-startup", O_WRONLY | O_TRUNC);
    if (marker < 0) return 81;
    char pid[32];
    int length = snprintf(pid, sizeof(pid), "%d\n", getpid());
    if (write(marker, pid, (size_t)length) != length) return 82;
    close(marker);
    int read_fd = open("../sibling/read", O_RDONLY);
    int outside_read = read_fd >= 0 ? 0 : errno;
    if (read_fd >= 0) {
        char byte;
        outside_read = read(read_fd, &byte, 1) == 1 ? 0 : errno;
        close(read_fd);
    }
    int outside = write_path("../sibling/direct");
    int traversal = write_path("data/../../sibling/traversal");
    int prefix = write_path("../root-sibling/prefix");
    int alias_file = write_path("data/symlink-file");
    int alias_dir = write_path("data/symlink-dir/alias");
    int hard_alias = write_path("data/hard-alias");
    int symlink_create = symlink("../../sibling", "data/created-dir") == 0 ? 0 : errno;
    int hardlink_create = link("../sibling/hardlink", "data/created-link") == 0 ? 0 : errno;
    int fd = open("../sibling/mapped", O_RDWR);
    int map_open = fd >= 0 ? 0 : errno;
    int mapped = -1, flushed = -1;
    if (fd >= 0) {
        void *mapping = mmap(NULL, 8, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
        mapped = mapping == MAP_FAILED ? errno : 0;
        if (mapping != MAP_FAILED) {
            memcpy(mapping, "mapped!", 7);
            flushed = msync(mapping, 8, MS_SYNC) == 0 ? 0 : errno;
            munmap(mapping, 8);
        }
        close(fd);
    }
    errno = 0;
    int inherited = write(43, "fdwrite", 7) == 7 ? 0 : errno;
    char input;
    int stdin_empty = read(STDIN_FILENO, &input, 1) == 0;
    pid_t child = fork();
    if (child == 0) {
        int output = open("tmp/confinement-child", O_WRONLY | O_TRUNC);
        if (output < 0 || dup2(output, STDOUT_FILENO) < 0) _exit(83);
        close(output);
        execl(argv[0], argv[0], "child", (char *)NULL);
        _exit(84);
    }
    int status = 0;
    if (child < 0 || waitpid(child, &status, 0) != child || !WIFEXITED(status)
        || (WEXITSTATUS(status) != 0 && WEXITSTATUS(status) != 20)) return 85;
    FILE *child_file = fopen("tmp/confinement-child", "r");
    int child_errno = -1;
    if (child_file == NULL || fscanf(child_file, "%d", &child_errno) != 1) return 86;
    fclose(child_file);
    pid_t other = fork();
    if (other == 0) {
        int output = open("tmp/confinement-child", O_WRONLY | O_TRUNC);
        if (output < 0 || dup2(output, STDOUT_FILENO) < 0) _exit(83);
        close(output);
        execl("unapproved-sentinel", "unapproved-sentinel", "unauthorized-exec", (char *)NULL);
        int exec_errno = errno;
        printf("%d\n", exec_errno);
        fflush(stdout);
        _exit(21);
    }
    if (other < 0 || waitpid(other, &status, 0) != other || !WIFEXITED(status)
        || (WEXITSTATUS(status) != 0 && WEXITSTATUS(status) != 21)) return 89;
    FILE *other_file = fopen("tmp/confinement-child", "r");
    int unauthorized_exec = -1;
    if (other_file == NULL || fscanf(other_file, "%d", &unauthorized_exec) != 1) return 90;
    fclose(other_file);
    int local = -1;
    if (argc == 2 && strcmp(argv[1], "--oc-qa-storage-write") == 0) {
        local = write_path("data/confinement-state");
    } else if (argc == 2 && strcmp(argv[1], "--oc-qa-storage-read") == 0) {
        char data[8] = {0};
        int state = open("data/confinement-state", O_RDONLY);
        local = state >= 0 && read(state, data, 7) == 7 && strcmp(data, "changed") == 0 ? 0 : 87;
        if (state >= 0) close(state);
    } else return 88;
    printf("{\"pid\":%d,\"completed\":true,\"outside_read\":%d,\"outside\":%d,\"traversal\":%d,\"prefix\":%d,"
           "\"alias_file\":%d,\"alias_dir\":%d,\"hard_alias\":%d,\"symlink_create\":%d,\"hardlink_create\":%d,"
           "\"mmap_open\":%d,\"mmap\":%d,\"msync\":%d,\"inherited_fd\":%d,\"child\":%d,\"unauthorized_exec\":%d,\"local\":%d,\"stdin_empty\":%s}\n",
           getpid(), outside_read, outside, traversal, prefix, alias_file, alias_dir, hard_alias, symlink_create, hardlink_create,
           map_open, mapped, flushed, inherited, child_errno, unauthorized_exec, local, stdin_empty ? "true" : "false");
    return 0;
}
'''


@unittest.skipUnless(sys.platform == "darwin" and os.environ.get("GITHUB_ACTIONS") == "true"
                     and os.environ.get("OC_CONFINEMENT_SENTINEL") == "1",
                     "native enforcement proof requires the scoped fresh GitHub macOS job")
class NativeSentinelTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.parent = Path(self.tmp.name).resolve()
        self.root = self.parent / "root"
        self.root.mkdir(mode=0o700)
        for name in ("data", "tmp"):
            (self.root / name).mkdir(mode=0o700)
        stage_fixed_files(self.root)
        self.sibling = self.parent / "sibling"
        self.sibling.mkdir(mode=0o700)
        self.prefix = self.parent / "root-sibling"
        self.prefix.mkdir(mode=0o700)
        self.exe = self.root / "sentinel"
        source = self.parent / "sentinel.c"
        source.write_text(SENTINEL_C)
        result = subprocess.run(["/usr/bin/clang", "-std=c11", "-Wall", "-Wextra", "-Werror",
                                 str(source), "-o", str(self.exe)], timeout=30, stdin=subprocess.DEVNULL,
                                close_fds=True, capture_output=True, text=True,
                                env={"PATH": "/usr/bin:/bin", "HOME": str(self.parent), "TMPDIR": str(self.parent)})
        self.assertEqual(result.returncode, 0, result.stderr)
        alternate = self.root / "unapproved-sentinel"
        alternate.write_bytes(self.exe.read_bytes())
        alternate.chmod(0o700)
        self.reset_canaries()
        system = plistlib.loads(Path("/System/Library/CoreServices/SystemVersion.plist").read_bytes())
        print(json.dumps({"macos": platform.mac_ver()[0], "build": system["ProductBuildVersion"],
                          "kernel": os.uname().release, "architecture": platform.machine(),
                          "policy_version": runner.POLICY_VERSION,
                          "policy_sha256": runner.POLICY_SHA256,
                          "policy_parameters": runner._policy_parameters(runner.LaunchSpec(
                              self.root, self.exe, runner.Probe.STORAGE_WRITE, token="a" * 32)),
                          "sentinel_sha256": hashlib.sha256(self.exe.read_bytes()).hexdigest()}), flush=True)

    def reset_canaries(self):
        for name in ("direct", "traversal", "alias", "alias-file", "hardlink", "mapped", "child", "fd", "read"):
            (self.sibling / name).write_bytes(b"original-canary")
        (self.prefix / "prefix").write_bytes(b"original-canary")

    def snapshot(self):
        observed = {}
        for path in [*self.sibling.iterdir(), self.prefix / "prefix"]:
            info = path.stat()
            observed[str(path)] = (path.read_bytes(), info.st_ino, info.st_size, stat.S_IMODE(info.st_mode),
                                   info.st_nlink, info.st_mtime_ns, info.st_ctime_ns)
        return observed

    def aliases(self):
        file_alias = self.root / "data/symlink-file"
        dir_alias = self.root / "data/symlink-dir"
        hard_alias = self.root / "data/hard-alias"
        file_alias.symlink_to(self.sibling / "alias-file")
        dir_alias.symlink_to(self.sibling, target_is_directory=True)
        os.link(self.sibling / "hardlink", hard_alias)
        return (file_alias, dir_alias, hard_alias)

    def remove_created_links(self):
        for name in ("data/created-dir", "data/created-link"):
            path = self.root / name
            if path.is_symlink() or path.exists():
                path.unlink()

    def observe(self, result):
        marker = (self.root / "tmp/confinement-startup").read_text().strip()
        self.assertEqual(result.returncode, 0,
                         f"stdout={result.stdout!r} stderr={result.stderr!r} startup_marker={marker!r}")
        observed = json.loads(result.stdout)
        self.assertIs(observed["completed"], True)
        self.assertEqual(observed["local"], 0)
        self.assertEqual((self.root / "tmp/confinement-startup").read_text().strip(), str(observed["pid"]))
        self.assertIs(observed["stdin_empty"], True)
        return observed

    def assert_denials(self, observed, aliases=False):
        denied = (errno.EPERM, errno.EACCES)
        for key in ("outside_read", "outside", "traversal", "prefix", "child", "unauthorized_exec",
                    "symlink_create", "hardlink_create"):
            self.assertIn(observed[key], denied, key)
        if aliases:
            for key in ("alias_file", "alias_dir", "hard_alias"):
                self.assertIn(observed[key], denied, key)
        if observed["mmap_open"] == 0:
            self.assertIn(observed["mmap"], denied)
        else:
            self.assertIn(observed["mmap_open"], denied)
            self.assertEqual(observed["mmap"], -1)
        self.assertEqual(observed["msync"], -1)
        self.assertEqual(observed["inherited_fd"], errno.EBADF)

    def test_real_process_family_denials_and_positive_relaunch(self):
        aliases = self.aliases()
        with (self.sibling / "fd").open("r+b") as stream:
            saved_fd = None
            saved_inheritable = False
            try:
                saved_inheritable = os.get_inheritable(43)
                saved_fd = os.dup(43)
            except OSError as error:
                if error.errno != errno.EBADF:
                    raise
            try:
                os.dup2(stream.fileno(), 43, inheritable=True)
                control = subprocess.run([str(self.exe), "--oc-qa-storage-write"], cwd=self.root,
                                         env={"OC_NATIVE_QA_ROOT": str(self.root)}, pass_fds=(43,),
                                         stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=10)
                observed = self.observe(control)
                for key in ("outside_read", "outside", "traversal", "prefix", "alias_file", "alias_dir", "hard_alias",
                            "symlink_create", "hardlink_create", "mmap_open", "mmap", "msync", "inherited_fd", "child", "unauthorized_exec"):
                    self.assertEqual(observed[key], 0, f"unconfined control did not exercise {key}")
                self.assertTrue(all(path.read_bytes() != b"original-canary" for path in self.sibling.iterdir()
                                    if path.name != "read"))
                self.assertEqual((self.sibling / "read").read_bytes(), b"original-canary")
                self.assertNotEqual((self.prefix / "prefix").read_bytes(), b"original-canary")
                print(json.dumps({"scope": "unconfined synthetic calibration", "observed": observed}), flush=True)
                state = self.root / "data/confinement-state"
                self.assertEqual(state.read_bytes(), b"changed")
                state.write_bytes(b"")
                self.assertEqual(state.read_bytes(), b"")
                for path in aliases:
                    path.unlink()
                self.remove_created_links()
                self.reset_canaries()
                before = self.snapshot()
                pids = []
                for phase in (runner.Probe.STORAGE_WRITE, runner.Probe.STORAGE_READ):
                    (self.root / "tmp/confinement-startup").write_text("pending")
                    result = runner.run_probe(runner.LaunchSpec(self.root, self.exe, phase, token="a" * 32))
                    observed = self.observe(result)
                    self.assertEqual(observed["pid"], result.pid)
                    self.assertEqual(state.read_bytes(), b"changed", "confined write must seed relaunch state")
                    self.assert_denials(observed)
                    self.assertEqual(self.snapshot(), before, "accepted runner changed outside bytes or metadata")
                    pids.append(result.pid)
                    print(json.dumps({"scope": "accepted-runner", "phase": phase.name, "observed": observed}), flush=True)
                self.assertNotEqual(*pids)
            finally:
                if saved_fd is None:
                    os.close(43)
                else:
                    os.dup2(saved_fd, 43, inheritable=saved_inheritable)
                    os.close(saved_fd)

    def test_policy_only_seeded_alias_denials_are_not_admission_proof(self):
        self.aliases()
        spec = runner.LaunchSpec(self.root, self.exe, runner.Probe.STORAGE_WRITE, token="a" * 32)
        before = self.snapshot()
        result = subprocess.run(runner._sandbox_command(spec), cwd=self.root,
                                env={"OC_NATIVE_QA_ROOT": str(self.root)}, stdin=subprocess.DEVNULL,
                                close_fds=True, capture_output=True, text=True, timeout=10)
        observed = self.observe(result)
        self.assert_denials(observed, aliases=True)
        self.assertEqual(self.snapshot(), before, "policy-only alias attempt changed outside bytes or metadata")
        print(json.dumps({"scope": "policy-only nonmutable aliases; production preflight bypassed by test",
                          "observed": observed}), flush=True)

    def test_root_metadata_only_startup_characterization(self):
        spec = runner.LaunchSpec(self.root, self.exe, runner.Probe.STORAGE_WRITE, token="a" * 32)
        baseline = self.observe(runner.run_probe(spec))
        self.assert_denials(baseline)
        state = self.root / "data/confinement-state"
        state.write_bytes(b"")
        marker = self.root / "tmp/confinement-startup"
        marker.write_text("pending")
        metadata_policy = runner.POLICY.replace(
            '(allow file-read-data file-read-metadata (literal "/"))',
            '(allow file-read-metadata (literal "/"))',
        )
        self.assertNotEqual(metadata_policy, runner.POLICY)
        command = runner._sandbox_command(spec)
        command[command.index("-p") + 1] = metadata_policy
        before = self.snapshot()
        env = environment(self.root)
        env["OC_NATIVE_QA_STORAGE_TOKEN"] = spec.token
        result = subprocess.run(command, cwd=self.root, env=env, start_new_session=True,
                                stdin=subprocess.DEVNULL, close_fds=True, capture_output=True,
                                text=True, timeout=spec.probe.timeout_seconds)
        receipt = {"scope": "metadata-only literal-root startup bisect; not production policy",
                   "policy_sha256": hashlib.sha256(metadata_policy.encode()).hexdigest(),
                   "returncode": result.returncode, "stdout": result.stdout, "stderr": result.stderr,
                   "startup_marker": marker.read_text()}
        if result.returncode == 0:
            observed = self.observe(result)
            self.assert_denials(observed)
            self.assertEqual(state.read_bytes(), b"changed")
            receipt["observed"] = observed
        else:
            self.assertEqual(marker.read_text(), "pending", "startup failed after observation began")
            self.assertEqual(state.read_bytes(), b"")
        self.assertEqual(self.snapshot(), before)
        print(json.dumps(receipt), flush=True)

    def test_seeded_alias_on_allowed_file_is_rejected_before_launch(self):
        state = self.root / "data/confinement-state"
        state.unlink()
        os.link(self.sibling / "hardlink", state)
        before = self.snapshot()
        with patch.object(runner.subprocess, "Popen") as launch:
            with self.assertRaisesRegex(ValueError, "hard.link"):
                runner.run_probe(runner.LaunchSpec(self.root, self.exe, runner.Probe.PATHS))
            launch.assert_not_called()
        self.assertEqual(self.snapshot(), before)
        print("seeded alias on permitted mutable file: staging refusal only, not kernel denial", flush=True)


def run_native_sentinel_suite():
    """Hosted gating must not turn missing authorization or collection into green."""
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(NativeSentinelTests)
    expected = 4
    if suite.countTestCases() != expected:
        return 1
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    return int(not result.wasSuccessful() or result.testsRun != expected or bool(result.skipped))


if __name__ == "__main__":
    unittest.main()
