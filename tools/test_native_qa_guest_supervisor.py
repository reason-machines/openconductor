"""Portable supervisor checks: synthetic Python children only, never a guest/VM.

These exercise source control flow, not native prevention or guest acceptance.
"""
from dataclasses import FrozenInstanceError
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest import mock

from tools import native_qa_guest_supervisor as supervisor


class SupervisorTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="oc-guest-supervisor-test-")
        self.addCleanup(self.tmp.cleanup)
        self.cwd = os.path.realpath(self.tmp.name)

    def step(self, name="check", code="print('ok')"):
        return supervisor.GuestStep(name, (sys.executable, "-B", "-c", code))

    def plan(self, *steps, **kwargs):
        return supervisor.GuestPlan(tuple(steps or (self.step(),)), self.cwd, **kwargs)

    def test_success_has_bounded_output_digests_not_native_acceptance(self):
        receipt = supervisor.supervise(self.plan(self.step(code="import os; os.write(1,b'ok'); os.write(2,b'err')")))
        self.assertEqual(receipt.outcome, "completed")
        self.assertTrue(receipt.commands_passed)
        step = receipt.steps[0]
        self.assertEqual((step.exit_code, step.stdout_bytes, step.stderr_bytes), (0, 2, 3))
        self.assertEqual(step.stdout_sha256, hashlib.sha256(b"ok").hexdigest())
        self.assertTrue(step.leader_reaped)
        self.assertTrue(step.process_group_absent)
        self.assertTrue(step.streams_eof)
        self.assertFalse(receipt.native_admission)
        self.assertFalse(receipt.host_filesystem_coverage_verified)
        self.assertFalse(receipt.vm_stopped_verified)
        self.assertFalse(receipt.guest_location_verified)
        self.assertFalse(receipt.process_tree_verified)
        with self.assertRaises(FrozenInstanceError):
            receipt.native_admission = True

    def test_terminal_receipt_binds_exact_plan_not_just_step_names(self):
        first = supervisor.supervise(self.plan(self.step(code="print('one')")))
        second = supervisor.supervise(self.plan(self.step(code="print('two')")))
        self.assertNotEqual(first.plan_sha256, second.plan_sha256)
        self.assertEqual(len(first.plan_sha256), 64)
        self.assertFalse(first.guest_location_verified)

    def test_ordered_steps_share_files_and_stop_at_first_failure(self):
        receipt = supervisor.supervise(self.plan(
            self.step("prepare", "from pathlib import Path; Path('ready').write_text('yes')"),
            self.step("check", "from pathlib import Path; assert Path('ready').read_text() == 'yes'"),
            self.step("fail", "raise SystemExit(7)"),
            self.step("unreachable", "from pathlib import Path; Path('bad').touch()"),
        ))
        self.assertEqual([s.name for s in receipt.steps], ["prepare", "check", "fail"])
        self.assertEqual(receipt.outcome, "failed")
        self.assertEqual(receipt.steps[-1].exit_code, 7)
        self.assertFalse((Path(self.cwd) / "bad").exists())

    def test_cancellation_before_start_spawns_nothing(self):
        cancel = threading.Event()
        cancel.set()
        receipt = supervisor.supervise(self.plan(), cancel=cancel)
        self.assertEqual(receipt.outcome, "cancelled")
        self.assertEqual(receipt.steps, ())

    def test_running_cancellation_reaps_before_return(self):
        cancel = threading.Event()
        timer = threading.Timer(0.15, cancel.set)
        timer.start()
        try:
            receipt = supervisor.supervise(self.plan(self.step(code="import time; time.sleep(10)")), cancel=cancel)
        finally:
            timer.cancel()
            timer.join()
        self.assertEqual(receipt.outcome, "cancelled")
        self.assertTrue(receipt.steps[0].leader_reaped)
        self.assertTrue(receipt.steps[0].process_group_absent)
        self.assertIn("SIGTERM", receipt.steps[0].signals_sent)

    def test_deadline_is_total_not_reset_for_each_step(self):
        receipt = supervisor.supervise(self.plan(
            self.step("one", "import time; time.sleep(.12)"),
            self.step("two", "import time; time.sleep(10)"),
            self.step("three"), max_wall_seconds=0.3,
        ))
        self.assertEqual(receipt.outcome, "timed_out")
        self.assertLessEqual(len(receipt.steps), 2)
        self.assertLess(receipt.wall_seconds, 2)
        self.assertTrue(receipt.steps[-1].leader_reaped)

    def test_sigterm_ignoring_child_is_killed_and_reaped(self):
        receipt = supervisor.supervise(self.plan(self.step(code=(
            "import signal,time; signal.signal(signal.SIGTERM, signal.SIG_IGN); "
            "print('ready',flush=True); time.sleep(10)"
        )), max_wall_seconds=.3))
        self.assertEqual(receipt.outcome, "timed_out")
        step = receipt.steps[0]
        self.assertIn("SIGKILL", step.signals_sent)
        self.assertTrue(step.leader_reaped)
        self.assertTrue(step.process_group_absent)
        self.assertEqual(step.exit_code, -signal.SIGKILL)

    def test_each_stream_overflow_is_stopped_while_running(self):
        for fd in (1, 2):
            with self.subTest(fd=fd):
                receipt = supervisor.supervise(self.plan(self.step(code=(
                    f"import os,time; os.write({fd},b'x'*10000); time.sleep(10)"
                )), output_limit_bytes=64))
                self.assertEqual(receipt.outcome, "output_overflow")
                step = receipt.steps[0]
                self.assertLessEqual(step.stdout_bytes, 65)
                self.assertLessEqual(step.stderr_bytes, 65)
                self.assertTrue(step.leader_reaped)
                self.assertLess(receipt.wall_seconds, 2)

    def test_exit_output_is_drained_and_overflow_still_refuses(self):
        receipt = supervisor.supervise(self.plan(self.step(code="import os; os.write(1,b'x'*4096)"), output_limit_bytes=64))
        self.assertEqual(receipt.outcome, "output_overflow")
        self.assertFalse(receipt.commands_passed)

    def test_spawn_failure_is_terminal_without_claiming_execution(self):
        receipt = supervisor.supervise(self.plan(supervisor.GuestStep("missing", ("/not-an-oc-command",))))
        self.assertEqual(receipt.outcome, "start_failed")
        self.assertIsNone(receipt.steps[0].exit_code)
        self.assertFalse(receipt.steps[0].leader_reaped)
        self.assertTrue(receipt.steps[0].process_group_absent)

    def test_no_inherited_environment_stdin_or_extra_fd(self):
        with open(Path(self.cwd) / "inert-fd", "wb") as inherited:
            os.set_inheritable(inherited.fileno(), True)
            code = ("import os,sys; assert 'OC_TEST_SECRET' not in os.environ; "
                    "assert sys.stdin.read() == ''\n"
                    f"try: os.fstat({inherited.fileno()})\n"
                    "except OSError: pass\n"
                    "else: raise AssertionError('inherited fd')")
            with mock.patch.dict(os.environ, {"OC_TEST_SECRET": "do-not-inherit"}):
                receipt = supervisor.supervise(self.plan(self.step(code=code)))
        self.assertEqual(receipt.outcome, "completed")

    def test_descendant_in_owned_group_is_terminated_and_reaped_by_parent(self):
        # Cooperative synthetic parent reaps its child: no orphan/zombie is
        # intentionally left behind by this test. Escaped groups are NOT proven.
        code = "\n".join((
            "import subprocess,sys,signal,time",
            "from pathlib import Path",
            "child = subprocess.Popen((sys.executable,'-B','-c','import time; time.sleep(10)'))",
            "def stop(*args):",
            "    child.wait(timeout=1)",
            "    sys.exit(0)",
            "signal.signal(signal.SIGTERM, stop)",
            "Path('descendant-pid').write_text(str(child.pid))",
            "time.sleep(10)",
        ))
        receipt = supervisor.supervise(self.plan(self.step(code=code), max_wall_seconds=.4))
        self.assertEqual(receipt.outcome, "timed_out")
        step = receipt.steps[0]
        self.assertTrue(step.leader_reaped)
        self.assertTrue(step.process_group_absent)
        self.assertTrue(step.streams_eof)
        pid = int((Path(self.cwd) / "descendant-pid").read_text())
        with self.assertRaises(ProcessLookupError):
            os.kill(pid, 0)

    def test_unconfirmed_teardown_never_returns_success_or_starts_next_step(self):
        with mock.patch.object(supervisor, "_teardown", wraps=supervisor._teardown) as teardown:
            real = teardown._mock_wraps
            def unconfirmed(*args):
                real(*args)
                return False
            teardown.side_effect = unconfirmed
            receipt = supervisor.supervise(self.plan(self.step("one"), self.step("two")))
        self.assertEqual(receipt.outcome, "cleanup_incomplete")
        self.assertFalse(receipt.commands_passed)
        self.assertEqual(len(receipt.steps), 1)
        self.assertEqual(teardown.call_count, 1)

    def test_unexpected_error_still_tears_down_owned_child(self):
        real_teardown = supervisor._teardown
        calls = []
        def teardown(*args):
            result = real_teardown(*args)
            calls.append((args[0].returncode, result))
            return result
        real_drain = supervisor._Output.drain
        count = 0
        def drain(output, timeout):
            nonlocal count
            count += 1
            if count == 1:
                raise RuntimeError("synthetic read failure")
            return real_drain(output, timeout)
        with mock.patch.object(supervisor, "_teardown", side_effect=teardown), mock.patch.object(supervisor._Output, "drain", drain):
            with self.assertRaisesRegex(RuntimeError, "synthetic read failure"):
                supervisor.supervise(self.plan(self.step(code="import time; time.sleep(10)")))
        self.assertEqual(len(calls), 1)
        self.assertIsNotNone(calls[0][0])
        self.assertTrue(calls[0][1])

    def test_persistent_read_error_forces_stop_without_leaking_child(self):
        created = []
        popen = subprocess.Popen
        def start(*args, **kwargs):
            process = popen(*args, **kwargs)
            created.append(process)
            return process
        with mock.patch.object(supervisor.subprocess, "Popen", side_effect=start), mock.patch.object(supervisor._Output, "drain", side_effect=OSError("synthetic pipe failure")):
            with self.assertRaisesRegex(OSError, "synthetic pipe failure"):
                supervisor.supervise(self.plan(self.step(code="import time; time.sleep(10)")))
        self.assertEqual(len(created), 1)
        self.assertIsNotNone(created[0].returncode)
        self.assertTrue(created[0].stdout.closed)
        self.assertTrue(created[0].stderr.closed)

    def test_invalid_plans_refuse_before_spawn(self):
        for kwargs in ({"max_wall_seconds": 0}, {"max_wall_seconds": float('nan')},
                       {"max_wall_seconds": float('inf')}, {"max_wall_seconds": True},
                       {"max_wall_seconds": 31}, {"output_limit_bytes": 0},
                       {"output_limit_bytes": True}, {"output_limit_bytes": 65537}):
            with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                self.plan(**kwargs)
        for argv in (("relative",), ("/bin/echo", "bad\0arg"), ["/bin/echo"], ()):
            with self.subTest(argv=argv), self.assertRaises(ValueError):
                supervisor.GuestStep("check", argv)
        with self.assertRaises(ValueError):
            supervisor.GuestPlan((), self.cwd)
        with self.assertRaises(ValueError):
            supervisor.GuestPlan((self.step(), self.step()), self.cwd)
        with self.assertRaises(ValueError):
            supervisor.GuestPlan((self.step(),), "relative")

    def document(self):
        return {"schema": 1, "cwd": self.cwd, "steps": [
            {"name": "check", "argv": [sys.executable, "-B", "-c", "print('ok')"]}
        ], "max_wall_seconds": 2, "output_limit_bytes": 64}

    def test_manifest_strict_bounded_json(self):
        document = self.document()
        self.assertEqual(supervisor.parse_plan(json.dumps(document).encode()).steps[0].name, "check")
        invalid = [b'{"schema":1,"schema":1}', b'[]', b'{}', b'x'*65537]
        for key in ("native_admission", "shell", "env"):
            invalid.append(json.dumps({**document, key: True}).encode())
        document["steps"][0]["unknown"] = True
        invalid.append(json.dumps(document).encode())
        for raw in invalid:
            with self.subTest(raw=raw[:80]), self.assertRaises(ValueError):
                supervisor.parse_plan(raw)

    def test_one_foreground_cli_returns_one_json_receipt(self):
        manifest = Path(self.cwd) / "plan.json"
        manifest.write_text(json.dumps(self.document()))
        result = subprocess.run((sys.executable, "-B", "-m", "tools.native_qa_guest_supervisor", "--plan", str(manifest)), capture_output=True, timeout=5)
        self.assertEqual(result.returncode, 0, result.stderr)
        receipt = json.loads(result.stdout)
        self.assertEqual(receipt["outcome"], "completed")
        self.assertFalse(receipt["native_admission"])
        self.assertNotIn("ok", receipt["steps"][0])

    def test_cli_sigterm_returns_cancellation_receipt_in_same_call(self):
        manifest = Path(self.cwd) / "cancel.json"
        document = self.document()
        document["steps"][0]["argv"][-1] = "from pathlib import Path; import time; Path('started').touch(); time.sleep(10)"
        manifest.write_text(json.dumps(document))
        process = subprocess.Popen((sys.executable, "-B", "-m", "tools.native_qa_guest_supervisor", "--plan", str(manifest)), stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            deadline = time.monotonic() + 3
            while not (Path(self.cwd) / "started").exists() and time.monotonic() < deadline:
                time.sleep(.01)
            self.assertTrue((Path(self.cwd) / "started").exists())
            process.terminate()
            stdout, stderr = process.communicate(timeout=3)
        finally:
            if process.poll() is None:
                process.kill()
                process.communicate(timeout=2)
        self.assertEqual(process.returncode, 1, stderr)
        receipt = json.loads(stdout)
        self.assertEqual(receipt["outcome"], "cancelled")
        self.assertTrue(receipt["steps"][0]["leader_reaped"])
        self.assertTrue(receipt["steps"][0]["process_group_absent"])


if __name__ == "__main__":
    unittest.main()
