"""Manually selected hosted macOS direct-syscall observations, never admission."""
from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass, field
import errno
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import platform
import subprocess
import sys
import tempfile

from tools import inert_storage_probe as probe


SCOPE = "hosted_inert_direct_syscalls_only"
GAPS = ["administrative_escalation", "permanent_uid_namespace_nonreuse",
        "concurrent_or_transient_mutation", "service_api_and_inherited_capabilities",
        "app_sandbox_gui_bootstrap", "vz_helper_and_guest_lifecycle"]
PRINCIPAL_QUERY = """import json,os,pwd,sys
print(json.dumps(dict(uid=os.getuid(),euid=os.geteuid(),gid=os.getgid(),
 groups=os.getgroups(),platform=sys.platform,name=pwd.getpwuid(os.getuid()).pw_name)))
"""


@dataclass
class HostedObservation:
    expected_head: str
    status: str = "UNAVAILABLE"
    principals: dict = field(default_factory=dict)
    selection: dict = field(default_factory=dict)
    plan_json: str | None = None
    checkout_head: str | None = None
    snapshots: list = field(default_factory=list)
    invocations: list = field(default_factory=list)
    source_sha256: str | None = None
    host: dict = field(default_factory=dict)
    reason: str | None = None

    def payload(self):
        return {**asdict(self), "scope": SCOPE, "runtime_admission": False,
                "native_admission": False, "lifecycle_cases_exercised": [],
                "lifecycle_case_status": "NOT_RUN", "unexercised": GAPS}


def require(condition, reason):
    if not condition:
        raise probe.Unavailable(reason)


def json_object(text):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result, "duplicate JSON key")
            result[key] = value
        return result
    require(len(text.encode()) <= probe.LIMIT, "oversized role output")
    value = json.loads(text, object_pairs_hook=unique)
    require(type(value) is dict, "expected one JSON object")
    return value


def principal():
    uid = probe.principal()
    return {"uid": uid, "euid": os.geteuid(), "gid": os.getgid(),
            "groups": os.getgroups(), "platform": sys.platform,
            "name": pwd.getpwuid(uid).pw_name}


def prerequisites(expected_head):
    require(sys.platform == "darwin", "hosted macOS is required")
    require(os.environ.get("GITHUB_ACTIONS") == "true"
            and os.environ.get("RUNNER_ENVIRONMENT") == "github-hosted",
            "requires an explicitly selected fresh GitHub-hosted job")
    require(re.fullmatch(r"[0-9a-f]{40}", expected_head or "") is not None
            and os.environ.get("GITHUB_SHA") == expected_head,
            "exact dispatched commit selection is required")
    caller = principal()
    daemon = pwd.getpwnam("daemon")
    require(daemon.pw_uid == 1 and daemon.pw_gid == 1
            and daemon.pw_shell in ("/usr/bin/false", "/usr/sbin/nologin", "/sbin/nologin")
            and caller["uid"] != 1, "existing non-login daemon UID/GID 1 required")
    for uid in (caller["uid"], 1):
        path = probe.BASE / f"oc-inert-storage-state-{uid}"
        try:
            path.lstat()
        except FileNotFoundError:
            continue
        raise probe.Unavailable("stale principal state; retire worker, never reset it")
    return caller


class HostedController:
    def __init__(self, evidence, caller):
        self.evidence = evidence
        self.evidence.principals["caller"] = caller
        self.source = Path(probe.__file__).resolve()
        self.original = self.source.read_bytes()
        self.evidence.source_sha256 = hashlib.sha256(self.original).hexdigest()
        stage = Path(tempfile.mkdtemp(prefix="oc-hosted-inert-code-", dir=probe.BASE))
        with probe.directory(stage) as fd:
            probe.write_new(fd, "probe.py", self.original, mode=0o444)
            os.fchmod(fd, 0o755)
        self.staged = stage / "probe.py"
        self.python = str(Path(sys.executable).resolve())

    def invoke(self, role, arguments, *, query=False):
        require(self.source.read_bytes() == self.original
                and self.staged.read_bytes() == self.original, "probe source changed")
        argv = [self.python, "-I", *(["-c", PRINCIPAL_QUERY] if query else
                                    [str(self.staged), *arguments])]
        if role == "consumer":
            argv = ["/usr/bin/sudo", "-n", "-u", "#1", "-g", "#1", "--", *argv]
        else:
            require(role == "caller", "unknown hosted role")
        record = {"role": role, "arguments": arguments, "query": query, "argv": argv}
        self.evidence.invocations.append(record)
        try:
            result = subprocess.run(argv, stdin=subprocess.DEVNULL,
                                    capture_output=True, text=True, timeout=20,
                                    close_fds=True, cwd="/", env={
                                        "PATH": "/usr/bin:/bin:/usr/sbin:/sbin", "LC_ALL": "C"})
            record.update(returncode=result.returncode, stdout=result.stdout, stderr=result.stderr)
        except (OSError, subprocess.TimeoutExpired) as exc:
            record["error"] = str(exc)
            raise probe.Unavailable("principal invocation unavailable; no fallback") from exc
        finally:
            require(self.source.read_bytes() == self.original
                    and self.staged.read_bytes() == self.original, "probe source changed")
        return record

    def retain_plan(self):
        selected = self.evidence.selection
        with probe.directory(probe.root_path(selected["probe_id"])) as fd:
            data = probe.read_file(fd, "plan.json")
        self.evidence.plan_json = data.decode("utf-8")
        require(probe.digest(data) == selected["plan_sha256"], "retained plan bytes changed")

    def snapshot(self, phase, point):
        selection = self.evidence.selection
        with probe.load_plan(selection["probe_id"], selection["plan_sha256"]) as (plan, fd):
            require(plan.consumer_uid == 1
                    and plan.caller_uid == self.evidence.principals["caller"]["uid"],
                    "plan principal identity mismatch")
            resources = {}
            for resource in probe.RESOURCES:
                probe.check_identity(fd, plan, resource)
                info = os.stat(resource + ".marker", dir_fd=fd, follow_symlinks=False)
                resources[resource] = {**asdict(probe.Identity.of(info)), "links": info.st_nlink}
            snapshot = {"phase": phase, "point": point, "namespace": list(plan.namespace),
                        "plan_sha256": selection["plan_sha256"], "resources": resources}
            self.evidence.snapshots.append(snapshot)
            return plan, snapshot

    def run(self):
        consumer = decode(self.invoke("consumer", [], query=True), role_report=False)
        require(consumer.get("uid") == 1 and type(consumer["uid"]) is int
                and consumer.get("euid") == 1 and type(consumer["euid"]) is int
                and consumer.get("gid") == 1 and type(consumer["gid"]) is int
                and consumer.get("name") == "daemon" and consumer.get("platform") == "darwin"
                and type(consumer.get("groups")) is list
                and all(type(group) is int for group in consumer["groups"]),
                "consumer launcher did not establish the selected actual identity")
        self.evidence.principals["consumer"] = consumer
        caller = self.evidence.principals["caller"]
        initialized = decode(self.invoke("consumer", ["consumer-init", "--caller-uid", str(caller["uid"])]))
        require(initialized.get("status") == "PREPARED", "consumer initialization unavailable")
        probe.root_path(initialized["probe_id"])
        require(re.fullmatch(r"[0-9a-f]{64}", initialized.get("plan_sha256", "")) is not None,
                "missing independent plan digest")
        self.evidence.selection = {key: initialized[key] for key in ("probe_id", "plan_sha256")}
        selected = self.evidence.selection
        self.retain_plan()
        for phase in probe.PHASES:
            args = ["--probe-id", selected["probe_id"], "--plan-sha256", selected["plan_sha256"],
                    "--phase", phase]
            positive = decode(self.invoke("consumer", ["consumer-check", *args]))
            plan, before = self.snapshot(phase, "before_caller")
            validate_role(positive, plan, phase, consumer, "consumer")
            try:
                negative = self.invoke("caller", ["caller-check", *args])
            finally:
                verified = self.invoke("consumer", ["consumer-verify", *args])
            _, after = self.snapshot(phase, "after_caller")
            require({k: v for k, v in before.items() if k != "point"}
                    == {k: v for k, v in after.items() if k != "point"}, "pre/post objects changed")
            validate_role(decode(verified), plan, phase, consumer, "consumer-verify")
            validate_role(decode(negative), plan, phase, caller, "caller")
        self.evidence.status = "BOUNDED_SYSCALL_OBSERVATIONS"


def decode(record, *, role_report=True):
    require(type(record.get("returncode")) is int and record["returncode"] == 0,
            "role invocation failed; see retained actual output")
    value = json_object(record["stdout"])
    if role_report:
        require(value.get("scope") == probe.SCOPE and value.get("runtime_admission") is False,
                "wrong role scope or admission field")
    return value


def validate_role(value, plan, phase, identity, role):
    require(value.get("scope") == probe.SCOPE and value.get("runtime_admission") is False,
            "wrong role scope or admission field")
    require(value.get("probe_id") == plan.probe_id and value.get("phase") == phase
            and value.get("role") == role, "wrong selected role, plan or phase")
    for name in ("uid", "euid", "gid"):
        require(type(value.get(name)) is int and value[name] == identity[name], "actual principal mismatch")
    require(value.get("platform") == "darwin" and type(value.get("groups")) is list
            and all(type(group) is int for group in value["groups"])
            and sorted(value["groups"]) == sorted(identity["groups"]), "actual groups/platform mismatch")
    observations = value.get("observations")
    require(type(observations) is list and all(type(o) is dict for o in observations),
            "missing resource observations")
    if role != "caller":
        verify = role == "consumer-verify"
        require(value.get("status") == ("INTACT" if verify else "AUTHORIZED_CONTROL_OK")
                and len(observations) == 2, "missing positive or final consumer result")
        require({o.get("resource") for o in observations} == set(probe.RESOURCES), "missing consumer resource")
        for observation in observations:
            expected = asdict(plan.resources[observation["resource"]])
            require(observation.get("read") is True and observation.get("write") is (not verify)
                    and observation.get("identity") == expected
                    and all(type(v) is int for v in observation["identity"].values()),
                    "consumer read/write or object identity mismatch")
        return
    require(value.get("status") == "DENIALS_OBSERVED", "caller aggregate did not observe all denials")
    pairs = {(resource, operation) for resource in probe.RESOURCES for operation in probe.OPERATIONS}
    require(len(observations) == len(pairs)
            and {(o.get("resource"), o.get("operation")) for o in observations} == pairs,
            "missing or duplicate caller operation")
    for observation in observations:
        calibration = observation.get("calibration")
        negative = observation.get("negative")
        require(type(calibration) is dict and type(negative) is dict, "missing syscall result")
        completed = {"replace": ["replace"], "link": ["link"], "reopen": ["open", "open"]}.get(
            observation["operation"], ["open"])
        require(calibration.get("returned") is True and calibration.get("errno") is None
                and calibration.get("errno_name") is None and calibration.get("completed") == completed,
                "missing successful writable-twin syscall calibration")
        require(observation.get("status") == "DENIED" and negative.get("returned") is False
                and type(negative.get("errno")) is int and negative["errno"] in probe.DENIALS
                and negative.get("errno_name") == errno.errorcode[negative["errno"]]
                and negative.get("completed") == [], "missing actual denial or partial caller access")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execute-hosted-prerequisite", action="store_true", required=True)
    parser.add_argument("--expected-head", required=True)
    args = parser.parse_args(argv)
    evidence = HostedObservation(args.expected_head)
    try:
        caller = prerequisites(args.expected_head)
        evidence.host = {"macos": platform.mac_ver()[0], "kernel": platform.release(),
                         "machine": platform.machine(), "run_id": os.environ.get("GITHUB_RUN_ID"),
                         "attempt": os.environ.get("GITHUB_RUN_ATTEMPT")}
        checkout = subprocess.run(["git", "rev-parse", "HEAD"], check=True, capture_output=True, text=True)
        evidence.checkout_head = checkout.stdout.strip()
        require(evidence.checkout_head == args.expected_head, "checkout does not match dispatched commit")
        subprocess.run(["git", "diff", "--quiet", "HEAD", "--"], check=True)
        HostedController(evidence, caller).run()
        code = 0
    except (probe.Unavailable, OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError) as exc:
        evidence.reason = str(exc)
        evidence.status = "FAILED" if evidence.invocations else "UNAVAILABLE"
        code = 1 if evidence.invocations else 2
    print(json.dumps(evidence.payload(), sort_keys=True))
    return code


if __name__ == "__main__":
    raise SystemExit(main())
