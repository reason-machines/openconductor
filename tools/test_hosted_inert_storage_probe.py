"""Portable controller/oracle fixtures. No principal switching or native execution."""
from contextlib import contextmanager
import copy
import errno
import hashlib
import io
import json
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest.mock import patch

from tools import hosted_inert_storage_probe as hosted
from tools import inert_storage_probe as probe


HEAD = "a" * 40
CALLER = dict(uid=501, euid=501, gid=20, groups=[20, 80], platform="darwin", name="runner")
CONSUMER = dict(uid=1, euid=1, gid=1, groups=[1], platform="darwin", name="daemon")
PLAN = probe.ProbePlan("5aa28ef6-88dc-4c3c-bcd3-a4b99ff3707a", 1, 501, (1, 2),
                       probe.StorageDirectory(1, 3, 1, 0o700), {
    resource: probe.Identity(1, 10 + i, 1, 0o600, 4096)
    for i, resource in enumerate(probe.RESOURCES)})


def role_result(role, phase="initial"):
    identity = CALLER if role == "caller" else CONSUMER
    result = {"scope": probe.SCOPE, "runtime_admission": False,
              "probe_id": PLAN.probe_id, "phase": phase, "role": role,
              **{k: v for k, v in identity.items() if k != "name"}, "observations": []}
    if role == "caller":
        result["status"] = "DENIALS_OBSERVED"
        for resource in probe.RESOURCES:
            for operation in probe.OPERATIONS:
                completed = {"replace": ["replace"], "link": ["link"],
                             "reopen": ["open", "open"]}.get(operation, ["open"])
                result["observations"].append({"resource": resource, "operation": operation,
                    "status": "DENIED", "calibration": {"returned": True, "errno": None,
                    "errno_name": None, "completed": completed},
                    "negative": {"returned": False, "errno": errno.EACCES,
                    "errno_name": "EACCES", "completed": []}})
    else:
        verify = role == "consumer-verify"
        result["status"] = "INTACT" if verify else "AUTHORIZED_CONTROL_OK"
        result.update(namespace=list(PLAN.namespace), storage=hosted.asdict(PLAN.storage))
        result["observations"] = [{"resource": resource, "read": True, "write": not verify,
            "identity": hosted.asdict(PLAN.resources[resource]), "links": 1} for resource in probe.RESOURCES]
    return result


class HostedControllerFixtures(unittest.TestCase):
    def validate(self, result, role):
        hosted.validate_role(result, PLAN, "initial", CALLER if role == "caller" else CONSUMER, role)

    def test_original_hosted_alias_breach_is_retained_without_repair(self):
        data = Path("evidence/qa/inert-storage-alias-failure/observations.json").read_bytes()
        self.assertEqual(hashlib.sha256(data).hexdigest(),
                         "f22215f4bd631259dfd608e39ad750571145c4b57fe7856e95d692ba05676727")
        result = json.loads(data)
        self.assertEqual(result["status"], "FAILED")
        self.assertEqual(len(result["invocations"]), 5)
        self.assertEqual(len(result["snapshots"]), 1)
        caller = result["invocations"][3]
        value = json.loads(caller["stdout"])
        links = [o for o in value["observations"] if o["operation"] == "link"]
        self.assertEqual(len(links), 2)
        self.assertTrue(all(o["status"] == "BREACH" and o["negative"]["returned"] is True
                            and o["negative"]["completed"] == ["link"] for o in links))
        with self.assertRaises(probe.Unavailable):
            hosted.decode(caller)
        self.assertEqual(result["invocations"][-1]["returncode"], 2)
        self.assertIs(result["runtime_admission"], False)
        self.assertIs(result["native_admission"], False)
        self.assertEqual(result["lifecycle_cases_exercised"], [])

    def test_complete_role_contracts_are_only_bounded_observations(self):
        for role in ("consumer", "caller", "consumer-verify"):
            self.validate(role_result(role), role)
        payload = hosted.HostedObservation(HEAD).payload()
        self.assertIs(payload["runtime_admission"], False)
        self.assertIs(payload["native_admission"], False)
        self.assertEqual(payload["lifecycle_cases_exercised"], [])
        self.assertEqual(payload["lifecycle_case_status"], "NOT_RUN")
        self.assertIn("administrative_escalation", payload["unexercised"])
        self.assertIn("permanent_uid_namespace_nonreuse", payload["unexercised"])

    def test_missing_each_resource_and_operation_refused(self):
        for role in ("consumer", "caller", "consumer-verify"):
            baseline = role_result(role)
            for index in range(len(baseline["observations"])):
                result = copy.deepcopy(baseline)
                result["observations"].pop(index)
                with self.subTest(role=role, index=index), self.assertRaises(probe.Unavailable):
                    self.validate(result, role)

    def test_duplicate_pair_and_wrong_aggregate_refused(self):
        result = role_result("caller")
        result["observations"][-1] = result["observations"][0]
        with self.assertRaises(probe.Unavailable):
            self.validate(result, "caller")
        result = role_result("caller")
        result["status"] = "FAILED"
        with self.assertRaises(probe.Unavailable):
            self.validate(result, "caller")

    def test_every_operation_needs_calibration_and_no_partial_or_full_access(self):
        for index in range(12):
            for mutation in ("calibration", "completed", "returned", "errno", "errno_name", "status"):
                result = role_result("caller")
                observation = result["observations"][index]
                if mutation == "calibration":
                    observation[mutation]["returned"] = False
                elif mutation == "completed":
                    observation["negative"][mutation] = ["open"]
                elif mutation == "returned":
                    observation["negative"][mutation] = True
                elif mutation == "errno":
                    observation["negative"][mutation] = errno.ENOENT
                elif mutation == "errno_name":
                    observation["negative"][mutation] = "EPERM"
                else:
                    observation[mutation] = "BREACH"
                with self.subTest(index=index, mutation=mutation), self.assertRaises(probe.Unavailable):
                    self.validate(result, "caller")

    def test_consumer_both_objects_and_read_write_must_match(self):
        for role in ("consumer", "consumer-verify"):
            for index in range(2):
                for field, value in (("read", False), ("write", role == "consumer-verify"),
                                     ("identity", {"inode": 999}), ("links", 2), ("links", True),
                                     ("links", None)):
                    result = role_result(role)
                    result["observations"][index][field] = value
                    with self.subTest(role=role, index=index, field=field), self.assertRaises(probe.Unavailable):
                        self.validate(result, role)

    def test_consumer_private_boundary_and_single_link_metadata_are_mandatory(self):
        for role in ("consumer", "consumer-verify"):
            for field, value in (("namespace", None), ("namespace", [1, True]),
                                 ("storage", None), ("storage", {}),
                                 ("storage", {**hosted.asdict(PLAN.storage), "mode": 0o711}),
                                 ("storage", {**hosted.asdict(PLAN.storage), "uid": True}),
                                 ("storage", {**hosted.asdict(PLAN.storage), "inode": 999})):
                result = role_result(role)
                result[field] = value
                with self.subTest(role=role, field=field, value=value), self.assertRaises(probe.Unavailable):
                    self.validate(result, role)

    def test_snapshot_uses_validated_consumer_report_not_caller_file_stat(self):
        @contextmanager
        def selected(*args):
            yield PLAN, 77

        with tempfile.TemporaryDirectory() as temp:
            controller = self.controller(temp)
            controller.evidence.selection = dict(probe_id=PLAN.probe_id, plan_sha256="c" * 64)
            controller.evidence.principals["consumer"] = CONSUMER
            with patch.object(probe, "load_plan", side_effect=selected), \
                    patch.object(probe, "check_storage", return_value=PLAN.storage), \
                    patch.object(probe, "check_identity", side_effect=AssertionError("caller resource stat")), \
                    patch.object(probe.os, "stat", side_effect=AssertionError("caller resource stat")):
                plan, snapshot = controller.snapshot("initial", "before_caller", role_result("consumer"))
                self.assertEqual(plan, PLAN)
                self.assertEqual(snapshot["storage"], hosted.asdict(PLAN.storage))
                self.assertEqual(snapshot["resource_measurement"], "consumer_role_report")
                self.assertTrue(all(resource["links"] == 1 for resource in snapshot["resources"].values()))
                wrong = role_result("consumer")
                wrong["observations"][0]["links"] = 2
                with self.assertRaises(probe.Unavailable):
                    controller.snapshot("initial", "before_caller", wrong)
            self.assertEqual(len(controller.evidence.snapshots), 1)

    def test_exact_actual_principal_and_selection_required(self):
        for field, value in (("uid", True), ("uid", 0), ("euid", 1), ("gid", 1),
                             ("groups", [20]), ("platform", "linux"), ("phase", "retained"),
                             ("role", "consumer"), ("probe_id", "wrong"),
                             ("runtime_admission", 0), ("scope", "native")):
            result = role_result("caller")
            result[field] = value
            with self.subTest(field=field, value=value), self.assertRaises(probe.Unavailable):
                self.validate(result, "caller")

    def test_missing_or_nonobject_syscall_results_are_refused(self):
        for field in ("negative", "calibration"):
            for value in (None, [], True):
                result = role_result("caller")
                result["observations"][0][field] = value
                with self.subTest(field=field, value=value), self.assertRaises(probe.Unavailable):
                    self.validate(result, "caller")

    def test_json_and_exit_are_not_success_substitutes(self):
        for text in ('{"runtime_admission":false,"runtime_admission":true}', '[]', '{}\n{}',
                     '"' + "x" * probe.LIMIT + '"'):
            with self.subTest(text=text[:50]), self.assertRaises((probe.Unavailable, ValueError)):
                hosted.json_object(text)
        for exit_code in (False, 1, 2, 78):
            with self.assertRaises(probe.Unavailable):
                hosted.decode(dict(returncode=exit_code, stdout=json.dumps(role_result("caller"))))
        with self.assertRaises(probe.Unavailable):
            hosted.decode(dict(returncode=0, stdout='{"scope":"inert_file_prerequisite_only","runtime_admission":0}'))

    def test_host_and_sha_refuse_before_any_launch(self):
        for platform, sha, environment in (("linux", HEAD, "github-hosted"),
                                            ("darwin", "b" * 40, "github-hosted"),
                                            ("darwin", HEAD, "self-hosted")):
            with patch.object(hosted.sys, "platform", platform), patch.dict(hosted.os.environ, {
                "GITHUB_ACTIONS": "true", "RUNNER_ENVIRONMENT": environment, "GITHUB_SHA": sha}), \
                    patch.object(hosted.subprocess, "run") as launch:
                with self.assertRaises(probe.Unavailable):
                    hosted.prerequisites(HEAD)
                launch.assert_not_called()

    def test_missing_wrong_principal_and_stale_state_refused(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(probe, "BASE", Path(temp)), \
                patch.object(hosted.sys, "platform", "darwin"), patch.dict(hosted.os.environ, {
                    "GITHUB_ACTIONS": "true", "RUNNER_ENVIRONMENT": "github-hosted", "GITHUB_SHA": HEAD}), \
                patch.object(hosted, "principal", return_value=CALLER), \
                patch.object(hosted.pwd, "getpwnam", return_value=SimpleNamespace(
                    pw_uid=1, pw_gid=1, pw_shell="/usr/bin/false")) as account:
            self.assertEqual(hosted.prerequisites(HEAD), CALLER)
            account.side_effect = KeyError("missing daemon")
            with self.assertRaises(KeyError):
                hosted.prerequisites(HEAD)
            account.side_effect = None
            account.return_value.pw_uid = 4294967294
            with self.assertRaises(probe.Unavailable):
                hosted.prerequisites(HEAD)
            account.return_value.pw_uid = 1
            (Path(temp) / "oc-inert-storage-state-1").symlink_to("missing")
            with self.assertRaisesRegex(probe.Unavailable, "stale"):
                hosted.prerequisites(HEAD)

    def controller(self, temp):
        with patch.object(probe, "BASE", Path(temp)):
            return hosted.HostedController(hosted.HostedObservation(HEAD), CALLER)

    def test_fixed_external_launcher_and_missing_launcher_fail_without_fallback(self):
        with tempfile.TemporaryDirectory() as temp:
            controller = self.controller(temp)
            with patch.object(hosted.subprocess, "run", side_effect=FileNotFoundError) as launch:
                with self.assertRaisesRegex(probe.Unavailable, "no fallback"):
                    controller.invoke("consumer", [], query=True)
                argv = launch.call_args.args[0]
                self.assertEqual(argv[:8], ["/usr/bin/sudo", "-n", "-u", "#1", "-g", "#1", "--", controller.python])
                self.assertEqual(launch.call_count, 1)
                self.assertEqual(launch.call_args.kwargs["cwd"], "/")
                self.assertTrue(launch.call_args.kwargs["close_fds"])
                self.assertIn("error", controller.evidence.invocations[0])
                self.assertEqual(controller.evidence.invocations[0]["argv"], argv)

    def test_source_change_refused_before_external_invocation(self):
        with tempfile.TemporaryDirectory() as temp:
            controller = self.controller(temp)
            controller.staged.chmod(0o600)
            controller.staged.write_bytes(b"changed")
            with patch.object(hosted.subprocess, "run") as launch:
                with self.assertRaisesRegex(probe.Unavailable, "source changed"):
                    controller.invoke("caller", [])
                launch.assert_not_called()

    def test_five_inert_labels_are_correlated_with_final_consumer_verification(self):
        with tempfile.TemporaryDirectory() as temp:
            controller = self.controller(temp)
            calls = []
            def invoke(role, args, *, query=False):
                calls.append((role, args, query))
                if query:
                    value = CONSUMER
                elif args[0] == "consumer-init":
                    value = dict(scope=probe.SCOPE, runtime_admission=False, status="PREPARED",
                                 probe_id=PLAN.probe_id, plan_sha256="c" * 64)
                else:
                    role = {"consumer-check": "consumer", "caller-check": "caller",
                            "consumer-verify": "consumer-verify"}[args[0]]
                    value = role_result(role, args[-1])
                return dict(returncode=0, stdout=json.dumps(value))
            def snapshot(phase, point, value):
                result = dict(phase=phase, point=point, namespace=list(PLAN.namespace))
                controller.evidence.snapshots.append(result)
                return PLAN, result
            with patch.object(controller, "invoke", side_effect=invoke), \
                    patch.object(controller, "retain_plan"), \
                    patch.object(controller, "snapshot", side_effect=snapshot):
                controller.run()
            self.assertEqual(controller.evidence.status, "BOUNDED_SYSCALL_OBSERVATIONS")
            self.assertEqual(len(calls), 17)
            self.assertEqual(len(controller.evidence.snapshots), 10)
            self.assertEqual(sum(bool(args) and args[0] == "consumer-verify" for _, args, _ in calls), 5)

    def test_failed_caller_still_triggers_final_consumer_verification(self):
        with tempfile.TemporaryDirectory() as temp:
            controller = self.controller(temp)
            calls = []
            def invoke(role, args, *, query=False):
                calls.append(args)
                if query:
                    value = CONSUMER
                elif args[0] == "consumer-init":
                    value = dict(scope=probe.SCOPE, runtime_admission=False, status="PREPARED",
                                 probe_id=PLAN.probe_id, plan_sha256="c" * 64)
                elif args[0] == "caller-check":
                    raise probe.Unavailable("failed caller transport")
                else:
                    value = role_result("consumer" if args[0] == "consumer-check" else "consumer-verify")
                return dict(returncode=0, stdout=json.dumps(value))
            with patch.object(controller, "invoke", side_effect=invoke), \
                    patch.object(controller, "retain_plan"), \
                    patch.object(controller, "snapshot", return_value=(PLAN, {})):
                with self.assertRaisesRegex(probe.Unavailable, "caller transport"):
                    controller.run()
            self.assertEqual(calls[-1][0], "consumer-verify")

    def test_raw_plan_bytes_are_retained_and_digest_checked(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(probe, "BASE", Path(temp)):
            controller = self.controller(temp)
            data = probe.encoded(PLAN.payload())
            root = probe.root_path(PLAN.probe_id)
            root.mkdir()
            (root / "plan.json").write_bytes(data)
            controller.evidence.selection = dict(probe_id=PLAN.probe_id, plan_sha256=probe.digest(data))
            controller.retain_plan()
            self.assertEqual(controller.evidence.plan_json.encode(), data)
            (root / "plan.json").write_bytes(data + b" ")
            with self.assertRaisesRegex(probe.Unavailable, "plan bytes changed"):
                controller.retain_plan()
            self.assertEqual(controller.evidence.plan_json.encode(), data + b" ")

    def test_wrong_consumer_identity_stops_before_initialization(self):
        for field, value in (("uid", 501), ("uid", True), ("euid", 0), ("gid", 20),
                             ("name", "nobody"), ("platform", "linux"), ("groups", [True])):
            with tempfile.TemporaryDirectory() as temp:
                controller = self.controller(temp)
                actual = {**CONSUMER, field: value}
                with patch.object(controller, "invoke", return_value=dict(
                        returncode=0, stdout=json.dumps(actual))) as invoke:
                    with self.assertRaises(probe.Unavailable):
                        controller.run()
                    self.assertEqual(invoke.call_count, 1)
                    self.assertNotEqual(controller.evidence.status, "BOUNDED_SYSCALL_OBSERVATIONS")

    def test_native_workflow_is_dispatch_only_and_does_not_register_principals(self):
        workflow = Path(".github/workflows/hosted-inert-storage-probe.yml").read_text()
        self.assertIn("  workflow_dispatch:", workflow)
        self.assertNotIn("  push:", workflow)
        self.assertNotIn("  pull_request:", workflow)
        self.assertIn("persist-credentials: false", workflow)
        self.assertIn("--expected-head \"$OC_EXPECTED_HEAD\"", workflow)
        self.assertNotIn("dscl", workflow)
        self.assertNotIn("sudoers", workflow)
        self.assertNotIn("launchctl", workflow)

    def test_main_started_failure_retains_no_admission_and_nonzero_exit(self):
        def fail(controller):
            controller.evidence.invocations.append(dict(role="consumer", returncode=2))
            raise probe.Unavailable("consumer refused")
        with tempfile.TemporaryDirectory() as temp, patch.object(probe, "BASE", Path(temp)), \
                patch.object(hosted, "prerequisites", return_value=CALLER), \
                patch.object(hosted.subprocess, "run", return_value=SimpleNamespace(stdout=HEAD)), \
                patch.object(hosted.HostedController, "run", fail), patch("sys.stdout", new_callable=io.StringIO) as output:
            status = hosted.main(["--execute-hosted-prerequisite", "--expected-head", HEAD])
        result = json.loads(output.getvalue())
        self.assertEqual(status, 1)
        self.assertEqual(result["status"], "FAILED")
        self.assertEqual(result["invocations"][0]["returncode"], 2)
        self.assertIs(result["runtime_admission"], False)
        self.assertIs(result["native_admission"], False)

    def test_main_missing_host_is_unavailable_with_no_admission(self):
        output = io.StringIO()
        with patch.object(hosted.sys, "platform", "linux"), patch("sys.stdout", output), \
                patch.object(hosted.subprocess, "run") as launch:
            status = hosted.main(["--execute-hosted-prerequisite", "--expected-head", HEAD])
        result = json.loads(output.getvalue())
        self.assertEqual(status, 2)
        self.assertEqual(result["status"], "UNAVAILABLE")
        self.assertIs(result["runtime_admission"], False)
        self.assertIs(result["native_admission"], False)
        launch.assert_not_called()


if __name__ == "__main__":
    unittest.main()
