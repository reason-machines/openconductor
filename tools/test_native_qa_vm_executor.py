"""
Cloud-safe tests for native_qa_vm_executor.execute_capability_plan.

All tests use synthetic fake runners (small shell or Python one-liners written
to a temporary directory).  No real runner, no Tart, no VMs, no network.

Fake runners are created with mode 0o755 and an ``#!/usr/bin/env python3``
shebang so they work on both Linux and macOS CI runners.

Coverage
--------
* Happy path: exit 0 returns RawCapabilityOutput with correct fields.
* NOT_YET_IMPLEMENTED: exit 78 + exact stub marker returns correct output.
* Failure: exit 1 returns correct output.
* Nonzero arbitrary exit: exit 42 returns correct output.
* Overflow: stdout exceeds limit raises OutputOverflowError.
* Overflow: stderr exceeds limit raises OutputOverflowError.
* Timeout: hanging child raises RunnerTimeoutError.
* Type guard: non-DispatchPlan raises TypeError.
* Wall time: wall_seconds is positive and plausible.
* Stdout and stderr captured independently.
* Empty stdout/stderr accepted.
* Argv passed verbatim to child (child reads sys.argv[0]).
"""

from __future__ import annotations

import hashlib
import os
import stat
import sys
import tempfile
import textwrap
import unittest

from pathlib import Path

from tools import native_qa_vm_broker as broker
from tools import native_qa_vm_executor as executor
from tools import native_qa_vm_staging as staging


# ---------------------------------------------------------------------------
# Helpers.

_FAKE_COMMIT = "a" * 40
_FAKE_BUILD  = "b" * 32

# The staged layout mirrors the real bundle structure so compose_invocation
# resolves to the correct executable path.
_BUNDLE_APP  = "OpenConductorQAVMRunner.app"
_EXEC_SUBPATH = "Contents/MacOS/OpenConductorQAVMRunner"

_NOT_YET_IMPL_MARKER = (
    b"VM execution is unavailable: resource identity, inherited-capability, "
    b"effective-profile and lifecycle acceptance are not implemented."
)


def _write_fake_runner(staged_root: str, source: str) -> str:
    """Write *source* as an executable Python script at the canonical staged
    path; return the executable's filesystem path."""
    exec_dir = os.path.join(staged_root, _BUNDLE_APP, "Contents", "MacOS")
    os.makedirs(exec_dir, exist_ok=True)
    path = os.path.join(exec_dir, "OpenConductorQAVMRunner")
    full_source = "#!/usr/bin/env python3\n" + textwrap.dedent(source)
    with open(path, "w") as fh:
        fh.write(full_source)
    os.chmod(path, stat.S_IRWXU | stat.S_IRGRP | stat.S_IXGRP |
                   stat.S_IROTH | stat.S_IXOTH)
    return path


def _make_staged_bundle(staged_root: str, runner_path: str) -> staging.StagedBundle:
    """Construct a StagedBundle whose executable_path is *runner_path*."""
    with open(runner_path, "rb") as fh:
        exe_sha = hashlib.sha256(fh.read()).hexdigest()
    staged_path = Path(staged_root)
    app_path = staged_path / _BUNDLE_APP
    return staging.StagedBundle(
        source_commit=_FAKE_COMMIT,
        build_id=_FAKE_BUILD,
        executable_sha256=exe_sha,
        staged_path=staged_path,
        app_path=app_path,
        executable_path=Path(runner_path),
    )


def _make_plan(staged_root: str, runner_path: str, **overrides) -> broker.DispatchPlan:
    """Build a minimal PROBE DispatchPlan pointing at *runner_path*."""
    bundle = _make_staged_bundle(staged_root, runner_path)
    plan = broker.plan_capability_dispatch(bundle, broker.CapabilitySpec.PROBE)
    if overrides:
        plan = broker.DispatchPlan(
            source_commit=plan.source_commit,
            build_id=plan.build_id,
            executable_sha256=plan.executable_sha256,
            argv=plan.argv,
            capability=plan.capability,
            max_wall_seconds=overrides.get("max_wall_seconds", plan.max_wall_seconds),
            stdout_limit=overrides.get("stdout_limit", plan.stdout_limit),
            stderr_limit=overrides.get("stderr_limit", plan.stderr_limit),
        )
    return plan


# ---------------------------------------------------------------------------
# Tests.

class TestExecuteCapabilityPlanHappyPath(unittest.TestCase):

    def setUp(self):
        self._tmp = tempfile.mkdtemp(prefix="oc-exec-test-")

    def test_exit_zero_returns_raw_output(self):
        runner = _write_fake_runner(self._tmp, """\
            import sys
            sys.stdout.buffer.write(b"ok\\n")
            sys.exit(0)
        """)
        plan = _make_plan(self._tmp, runner)
        raw = executor.execute_capability_plan(plan)
        self.assertIsInstance(raw, broker.RawCapabilityOutput)
        self.assertEqual(raw.exit_code, 0)
        self.assertEqual(raw.stdout, b"ok\n")
        self.assertEqual(raw.stderr, b"")

    def test_exit_zero_wall_seconds_positive(self):
        runner = _write_fake_runner(self._tmp, """\
            import sys; sys.exit(0)
        """)
        plan = _make_plan(self._tmp, runner)
        raw = executor.execute_capability_plan(plan)
        self.assertGreater(raw.wall_seconds, 0.0)
        self.assertLess(raw.wall_seconds, 10.0)

    def test_empty_stdout_stderr_accepted(self):
        runner = _write_fake_runner(self._tmp, """\
            import sys; sys.exit(0)
        """)
        plan = _make_plan(self._tmp, runner)
        raw = executor.execute_capability_plan(plan)
        self.assertEqual(raw.stdout, b"")
        self.assertEqual(raw.stderr, b"")

    def test_stdout_and_stderr_captured_independently(self):
        runner = _write_fake_runner(self._tmp, """\
            import sys
            sys.stdout.buffer.write(b"STDOUT_DATA")
            sys.stderr.buffer.write(b"STDERR_DATA")
            sys.exit(0)
        """)
        plan = _make_plan(self._tmp, runner)
        raw = executor.execute_capability_plan(plan)
        self.assertEqual(raw.stdout, b"STDOUT_DATA")
        self.assertEqual(raw.stderr, b"STDERR_DATA")


class TestExecuteCapabilityPlanNotYetImplemented(unittest.TestCase):

    def setUp(self):
        self._tmp = tempfile.mkdtemp(prefix="oc-exec-test-")

    def test_exit_78_with_marker_gives_not_yet_implemented(self):
        runner = _write_fake_runner(self._tmp, f"""\
            import sys
            sys.stderr.buffer.write({_NOT_YET_IMPL_MARKER!r})
            sys.exit(78)
        """)
        plan = _make_plan(self._tmp, runner)
        raw = executor.execute_capability_plan(plan)
        result = broker.consume_capability_output(plan, raw)
        self.assertIs(result.outcome, broker.CapabilityOutcome.NOT_YET_IMPLEMENTED)
        self.assertTrue(result.not_yet_impl_marker_present)

    def test_exit_78_produces_raw_with_correct_exit_code(self):
        runner = _write_fake_runner(self._tmp, f"""\
            import sys
            sys.stderr.buffer.write({_NOT_YET_IMPL_MARKER!r})
            sys.exit(78)
        """)
        plan = _make_plan(self._tmp, runner)
        raw = executor.execute_capability_plan(plan)
        self.assertEqual(raw.exit_code, 78)
        self.assertTrue(raw.stderr.startswith(_NOT_YET_IMPL_MARKER))


class TestExecuteCapabilityPlanFailureCases(unittest.TestCase):

    def setUp(self):
        self._tmp = tempfile.mkdtemp(prefix="oc-exec-test-")

    def test_exit_one_returns_exit_code_one(self):
        runner = _write_fake_runner(self._tmp, """\
            import sys; sys.exit(1)
        """)
        plan = _make_plan(self._tmp, runner)
        raw = executor.execute_capability_plan(plan)
        self.assertEqual(raw.exit_code, 1)

    def test_arbitrary_exit_code_preserved(self):
        runner = _write_fake_runner(self._tmp, """\
            import sys; sys.exit(42)
        """)
        plan = _make_plan(self._tmp, runner)
        raw = executor.execute_capability_plan(plan)
        self.assertEqual(raw.exit_code, 42)

    def test_exit_one_consumes_as_failure(self):
        runner = _write_fake_runner(self._tmp, """\
            import sys
            sys.stderr.buffer.write(b"something went wrong")
            sys.exit(1)
        """)
        plan = _make_plan(self._tmp, runner)
        raw = executor.execute_capability_plan(plan)
        result = broker.consume_capability_output(plan, raw)
        self.assertIs(result.outcome, broker.CapabilityOutcome.FAILURE)


class TestExecuteCapabilityPlanOverflow(unittest.TestCase):

    def setUp(self):
        self._tmp = tempfile.mkdtemp(prefix="oc-exec-test-")

    def test_stdout_overflow_raises(self):
        runner = _write_fake_runner(self._tmp, """\
            import sys
            sys.stdout.buffer.write(b"X" * 200)
            sys.exit(0)
        """)
        plan = _make_plan(self._tmp, runner, stdout_limit=100)
        with self.assertRaises(executor.OutputOverflowError) as ctx:
            executor.execute_capability_plan(plan)
        self.assertEqual(ctx.exception.stream, "stdout")
        self.assertEqual(ctx.exception.limit, 100)
        self.assertEqual(ctx.exception.actual, 200)

    def test_stderr_overflow_raises(self):
        runner = _write_fake_runner(self._tmp, """\
            import sys
            sys.stderr.buffer.write(b"Y" * 300)
            sys.exit(0)
        """)
        plan = _make_plan(self._tmp, runner, stderr_limit=50)
        with self.assertRaises(executor.OutputOverflowError) as ctx:
            executor.execute_capability_plan(plan)
        self.assertEqual(ctx.exception.stream, "stderr")
        self.assertEqual(ctx.exception.limit, 50)
        self.assertEqual(ctx.exception.actual, 300)

    def test_exactly_at_limit_does_not_overflow(self):
        runner = _write_fake_runner(self._tmp, """\
            import sys
            sys.stdout.buffer.write(b"Z" * 100)
            sys.exit(0)
        """)
        plan = _make_plan(self._tmp, runner, stdout_limit=100)
        raw = executor.execute_capability_plan(plan)
        self.assertEqual(len(raw.stdout), 100)


class TestExecuteCapabilityPlanTimeout(unittest.TestCase):

    def setUp(self):
        self._tmp = tempfile.mkdtemp(prefix="oc-exec-test-")

    def test_hanging_child_raises_timeout_error(self):
        runner = _write_fake_runner(self._tmp, """\
            import time
            time.sleep(60)
        """)
        plan = _make_plan(self._tmp, runner, max_wall_seconds=0.5)
        with self.assertRaises(executor.RunnerTimeoutError) as ctx:
            executor.execute_capability_plan(plan)
        self.assertAlmostEqual(ctx.exception.limit, 0.5)
        self.assertGreaterEqual(ctx.exception.wall_seconds, 0.4)


class TestExecuteCapabilityPlanTypeGuard(unittest.TestCase):

    def test_non_plan_raises_type_error(self):
        with self.assertRaises(TypeError):
            executor.execute_capability_plan("not a plan")  # type: ignore[arg-type]

    def test_none_raises_type_error(self):
        with self.assertRaises(TypeError):
            executor.execute_capability_plan(None)  # type: ignore[arg-type]


class TestExecuteCapabilityPlanArgvPassthrough(unittest.TestCase):

    def setUp(self):
        self._tmp = tempfile.mkdtemp(prefix="oc-exec-test-")

    def test_argv0_is_runner_path(self):
        runner = _write_fake_runner(self._tmp, """\
            import sys
            sys.stdout.buffer.write(sys.argv[0].encode())
            sys.exit(0)
        """)
        plan = _make_plan(self._tmp, runner)
        raw = executor.execute_capability_plan(plan)
        # The plan is PROBE: argv is (runner_path,) only.
        self.assertEqual(raw.stdout, runner.encode())
        self.assertEqual(len(plan.argv), 1)


if __name__ == "__main__":
    unittest.main()
