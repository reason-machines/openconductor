"""Inert two-principal file prerequisite. Never a VZ/native admission receipt."""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from dataclasses import asdict, dataclass
import errno
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import stat
import sys
import tempfile
import uuid


BASE = Path("/tmp").resolve()
STORAGE = "resources"
RESOURCES = ("disk", "auxiliary")
PHASES = ("initial", "repeat", "reopened", "finished", "retained")
OPERATIONS = ("open", "write", "truncate", "replace", "link", "reopen")
DENIALS = (errno.EACCES, errno.EPERM)
LIMIT = 32768
SCOPE = "inert_file_prerequisite_only"


class Unavailable(ValueError):
    pass


def encoded(value):
    return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()


def digest(data):
    return hashlib.sha256(data).hexdigest()


@dataclass(frozen=True)
class Identity:
    device: int
    inode: int
    uid: int
    mode: int
    size: int

    @classmethod
    def of(cls, info):
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
            raise Unavailable("expected a regular, single-link synthetic file")
        return cls(info.st_dev, info.st_ino, info.st_uid,
                   stat.S_IMODE(info.st_mode), info.st_size)


@dataclass(frozen=True)
class StorageDirectory:
    device: int
    inode: int
    uid: int
    mode: int

    @classmethod
    def of(cls, info):
        if not stat.S_ISDIR(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o700:
            raise Unavailable("resources require a private, non-symlink directory")
        return cls(info.st_dev, info.st_ino, info.st_uid, stat.S_IMODE(info.st_mode))


@dataclass(frozen=True)
class ProbePlan:
    probe_id: str
    consumer_uid: int
    caller_uid: int
    namespace: tuple[int, int]
    storage: StorageDirectory
    resources: dict[str, Identity]

    def payload(self):
        return {"kind": SCOPE, "version": 2, **asdict(self)}

    def marker(self, resource):
        return (f"OPENCONDUCTOR-INERT-ONLY:{self.probe_id}:{resource}\n".encode()).ljust(4096, b".")


def principal(expected=None):
    uid = os.getuid()
    if uid == 0 or uid != os.geteuid():
        raise Unavailable("requires an existing non-root real/effective UID, without privilege switching")
    try:
        pwd.getpwuid(uid)
    except KeyError as exc:
        raise Unavailable("current principal is not registered") from exc
    if expected is not None and uid != expected:
        raise Unavailable("wrong principal for this role")
    return uid


def write_new(directory, name, data, mode=0o600):
    fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                 mode, dir_fd=directory)
    with os.fdopen(fd, "wb") as stream:
        os.fchmod(stream.fileno(), mode)
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    os.fsync(directory)


@contextmanager
def directory(path, *, dir_fd=None):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=dir_fd)
    try:
        yield fd
    finally:
        os.close(fd)


def read_file(directory_fd, name, *, owner=None):
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory_fd)
    with os.fdopen(fd, "rb") as stream:
        info = os.fstat(stream.fileno())
        Identity.of(info)
        if owner is not None and (info.st_uid != owner or info.st_mode & 0o022):
            raise Unavailable("untrusted file ownership or write permissions")
        data = stream.read(LIMIT + 1)
        if len(data) > LIMIT:
            raise Unavailable("oversized probe data")
        return data


@contextmanager
def state(uid):
    path = BASE / f"oc-inert-storage-state-{uid}"
    try:
        path.mkdir(mode=0o700)
    except FileExistsError:
        pass
    with directory(path) as fd:
        info = os.fstat(fd)
        if info.st_uid != uid or stat.S_IMODE(info.st_mode) != 0o700:
            raise Unavailable("state directory must be private and owned by the actual principal")
        yield fd


def reserve_uid(fd, probe_id, role):
    reservation = encoded({"probe_id": probe_id, "role": role})
    try:
        write_new(fd, "uid-reserved.json", reservation)
    except FileExistsError:
        if read_file(fd, "uid-reserved.json") != reservation:
            raise Unavailable("UID already reserved for another fixture or role")


def phase_name(phase):
    if phase not in PHASES:
        raise Unavailable("unknown inert phase")
    return phase


def root_path(probe_id):
    try:
        if str(uuid.UUID(probe_id)) != probe_id:
            raise ValueError()
    except ValueError as exc:
        raise Unavailable("invalid generated probe ID") from exc
    return BASE / f"oc-inert-storage-{probe_id}"


def initialize(caller_uid):
    consumer_uid = principal()
    if type(caller_uid) is not int or caller_uid <= 0 or caller_uid == consumer_uid:
        raise Unavailable("requires a distinct, existing non-root caller UID")
    try:
        pwd.getpwuid(caller_uid)
    except KeyError as exc:
        raise Unavailable("caller principal is not registered") from exc
    probe_id = str(uuid.uuid4())
    with state(consumer_uid) as journal:
        reserve_uid(journal, probe_id, "consumer")
        root = root_path(probe_id)
        root.mkdir(mode=0o700)
        with directory(root) as fd:
            os.fchmod(fd, 0o755)
            os.mkdir(STORAGE, mode=0o700, dir_fd=fd)
            with directory(STORAGE, dir_fd=fd) as storage_fd:
                os.fchmod(storage_fd, 0o700)
                storage = StorageDirectory.of(os.fstat(storage_fd))
                resources = {}
                provisional = ProbePlan(probe_id, consumer_uid, caller_uid, (0, 0), storage, {})
                for resource in RESOURCES:
                    name = resource + ".marker"
                    write_new(storage_fd, name, provisional.marker(resource))
                    resources[resource] = Identity.of(os.stat(name, dir_fd=storage_fd, follow_symlinks=False))
            info = os.fstat(fd)
            plan = ProbePlan(probe_id, consumer_uid, caller_uid,
                             (info.st_dev, info.st_ino), storage, resources)
            data = encoded(plan.payload())
            write_new(fd, "plan.json", data, mode=0o444)
    return {"probe_id": probe_id, "plan_sha256": digest(data),
            "status": "PREPARED", "scope": SCOPE, "runtime_admission": False}


@contextmanager
def load_plan(probe_id, plan_sha256):
    if not re.fullmatch(r"[0-9a-f]{64}", plan_sha256):
        raise Unavailable("an independently retained plan digest is required")
    with directory(root_path(probe_id)) as fd:
        data = read_file(fd, "plan.json")
        if digest(data) != plan_sha256:
            raise Unavailable("plan digest mismatch")
        raw = json.loads(data)
        if set(raw) != {"kind", "version", "probe_id", "consumer_uid", "caller_uid", "namespace", "storage", "resources"}:
            raise Unavailable("unexpected plan fields")
        if raw["kind"] != SCOPE or type(raw["version"]) is not int or raw["version"] != 2 or raw["probe_id"] != probe_id:
            raise Unavailable("wrong synthetic plan")
        if any(type(raw[key]) is not int or raw[key] <= 0 for key in ("consumer_uid", "caller_uid")):
            raise Unavailable("invalid principal IDs")
        if raw["consumer_uid"] == raw["caller_uid"] or set(raw["resources"]) != set(RESOURCES):
            raise Unavailable("requires two distinct principals and both resources")
        if (type(raw["namespace"]) is not list or len(raw["namespace"]) != 2
                or any(type(value) is not int or value < 0 for value in raw["namespace"])):
            raise Unavailable("invalid namespace identity")
        storage = StorageDirectory(**raw["storage"])
        resources = {name: Identity(**value) for name, value in raw["resources"].items()}
        if any(type(value) is not int for identity in (storage, *resources.values())
               for value in asdict(identity).values()):
            raise Unavailable("invalid object identity fields")
        if storage.uid != raw["consumer_uid"] or storage.mode != 0o700 or storage.device != raw["namespace"][0]:
            raise Unavailable("invalid private storage identity")
        plan = ProbePlan(probe_id, raw["consumer_uid"], raw["caller_uid"],
                         tuple(raw["namespace"]), storage, resources)
        info = os.fstat(fd)
        if (info.st_dev, info.st_ino) != plan.namespace or info.st_uid != plan.consumer_uid:
            raise Unavailable("namespace identity mismatch")
        if stat.S_IMODE(info.st_mode) != 0o755:
            raise Unavailable("inert namespace must allow caller directory access but not mutation")
        check_storage(fd, plan)
        for identity in plan.resources.values():
            if identity.uid != plan.consumer_uid or identity.mode != 0o600 or identity.size != 4096:
                raise Unavailable("invalid synthetic resource identity")
        yield plan, fd


def check_storage(fd, plan):
    actual = StorageDirectory.of(os.stat(STORAGE, dir_fd=fd, follow_symlinks=False))
    if actual != plan.storage:
        raise Unavailable("private storage identity mismatch")
    return actual


@contextmanager
def resource_directory(fd, plan):
    check_storage(fd, plan)
    with directory(STORAGE, dir_fd=fd) as storage_fd:
        if StorageDirectory.of(os.fstat(storage_fd)) != plan.storage:
            raise Unavailable("opened a different private storage directory")
        yield storage_fd


def check_identity(fd, plan, resource):
    actual = Identity.of(os.stat(resource + ".marker", dir_fd=fd, follow_symlinks=False))
    if actual != plan.resources[resource]:
        raise Unavailable("synthetic target changed; refusing further operations")


def consumer_check(probe_id, plan_sha256, phase, *, verify=False):
    phase_name(phase)
    with load_plan(probe_id, plan_sha256) as (plan, fd):
        uid = principal(plan.consumer_uid)
        name = ("verify-" if verify else "consumer-") + phase
        previous = PHASES.index(phase) - 1
        if previous >= 0:
            read_file(fd, "verify-" + PHASES[previous] + ".json", owner=uid)
        if verify:
            read_file(fd, "consumer-" + phase + ".json", owner=uid)
        with state(uid) as journal:
            reserve_uid(journal, probe_id, "consumer")
            write_new(journal, name + ".claimed", encoded({"probe_id": probe_id}))
        observations = []
        with resource_directory(fd, plan) as storage_fd:
            for resource in RESOURCES:
                check_identity(storage_fd, plan, resource)
                handle = os.open(resource + ".marker", os.O_RDWR | os.O_NOFOLLOW | os.O_NONBLOCK,
                                 dir_fd=storage_fd)
                try:
                    if Identity.of(os.fstat(handle)) != plan.resources[resource]:
                        raise Unavailable("opened a different resource")
                    marker = plan.marker(resource)
                    if os.pread(handle, 4097, 0) != marker:
                        raise Unavailable("synthetic marker was modified")
                    if not verify:
                        if os.pwrite(handle, marker, 0) != len(marker):
                            raise Unavailable("short authorized write")
                        os.fsync(handle)
                        if os.pread(handle, 4097, 0) != marker:
                            raise Unavailable("authorized write readback mismatch")
                    check_identity(storage_fd, plan, resource)
                    actual = os.fstat(handle)
                    if Identity.of(actual) != plan.resources[resource]:
                        raise Unavailable("opened resource identity changed")
                finally:
                    os.close(handle)
                observations.append({"resource": resource, "read": True, "write": not verify,
                                     "identity": asdict(Identity.of(actual)), "links": actual.st_nlink})
            storage = StorageDirectory.of(os.fstat(storage_fd))
            if storage != check_storage(fd, plan):
                raise Unavailable("private storage changed during consumer operation")
        result = report(plan, phase, "consumer-verify" if verify else "consumer", observations)
        info = os.fstat(fd)
        result.update(namespace=[info.st_dev, info.st_ino], storage=asdict(storage))
        result["status"] = "INTACT" if verify else "AUTHORIZED_CONTROL_OK"
        write_new(fd, name + ".json", encoded(result), mode=0o444)
        return result


def operation(name, target_fd, target, scratch_fd, completed):
    if name == "replace":
        os.replace("replacement", target, src_dir_fd=scratch_fd, dst_dir_fd=target_fd)
        completed.append("replace")
    elif name == "link":
        os.link(target, "alias", src_dir_fd=target_fd, dst_dir_fd=scratch_fd, follow_symlinks=False)
        completed.append("link")
    else:
        flags = {"open": os.O_RDONLY, "write": os.O_WRONLY,
                 "truncate": os.O_WRONLY | os.O_TRUNC, "reopen": os.O_RDWR}[name]
        for _ in range(2 if name == "reopen" else 1):
            handle = os.open(target, flags | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=target_fd)
            completed.append("open")
            try:
                if name == "open":
                    if len(os.read(handle, 1)) != 1:
                        raise Unavailable("empty open calibration")
                elif name == "write":
                    if os.pwrite(handle, b"!", 0) != 1:
                        raise Unavailable("short write calibration")
            finally:
                os.close(handle)


def attempt(name, target_fd, target, scratch_fd):
    completed = []
    try:
        operation(name, target_fd, target, scratch_fd, completed)
        return {"returned": True, "errno": None, "errno_name": None, "completed": completed}
    except OSError as exc:
        return {"returned": False, "errno": exc.errno,
                "errno_name": errno.errorcode.get(exc.errno, "UNKNOWN"), "completed": completed}


def report(plan, phase, role, observations):
    return {"scope": SCOPE, "runtime_admission": False, "probe_id": plan.probe_id,
            "phase": phase, "role": role, "uid": os.getuid(), "euid": os.geteuid(),
            "gid": os.getgid(), "groups": os.getgroups(), "platform": sys.platform,
            "observations": observations}


def caller_check(probe_id, plan_sha256, phase):
    phase_name(phase)
    with load_plan(probe_id, plan_sha256) as (plan, fd):
        uid = principal(plan.caller_uid)
        read_file(fd, "consumer-" + phase + ".json", owner=plan.consumer_uid)
        with state(uid) as journal:
            reserve_uid(journal, probe_id, "caller")
            write_new(journal, "caller-" + phase + ".claimed", encoded({"probe_id": probe_id}))
            scratch = Path(tempfile.mkdtemp(prefix="oc-inert-caller-", dir=BASE))
            observations = []
            for resource in RESOURCES:
                for name in OPERATIONS:
                    case = scratch / (resource + "-" + name)
                    case.mkdir(mode=0o700)
                    with directory(case) as control:
                        if os.fstat(control).st_dev != plan.namespace[0]:
                            raise Unavailable("control and protected targets must share a filesystem")
                        write_new(control, "twin", plan.marker(resource))
                        write_new(control, "replacement", plan.marker(resource))
                        calibrated = attempt(name, control, "twin", control)
                    attack = case / "attack"
                    attack.mkdir(mode=0o700)
                    with directory(attack) as staged:
                        write_new(staged, "replacement", plan.marker(resource))
                        if not calibrated["returned"]:
                            outcome = {"status": "UNAVAILABLE", "negative": None}
                        else:
                            try:
                                check_storage(fd, plan)
                                negative = attempt(name, fd, STORAGE + "/" + resource + ".marker", staged)
                                outcome = {"status": "BREACH" if negative["returned"] or negative["completed"] else
                                           ("DENIED" if negative["errno"] in DENIALS else "UNAVAILABLE"),
                                           "negative": negative}
                            except (Unavailable, OSError) as exc:
                                outcome = {"status": "UNAVAILABLE", "negative": None,
                                           "reason": str(exc), "preflight_errno": getattr(exc, "errno", None)}
                    observations.append({"resource": resource, "operation": name,
                                         "calibration": calibrated, **outcome})
            result = report(plan, phase, "caller", observations)
            result["status"] = "DENIALS_OBSERVED" if all(o["status"] == "DENIED" for o in observations) else "FAILED"
            result["scratch"] = str(scratch)
            write_new(journal, "caller-" + phase + ".json", encoded(result))
            return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    init = commands.add_parser("consumer-init")
    init.add_argument("--caller-uid", type=int, required=True)
    for command in ("consumer-check", "caller-check", "consumer-verify"):
        sub = commands.add_parser(command)
        sub.add_argument("--probe-id", required=True)
        sub.add_argument("--plan-sha256", required=True)
        sub.add_argument("--phase", choices=PHASES, required=True)
    args = parser.parse_args(argv)
    try:
        if args.command == "consumer-init":
            result = initialize(args.caller_uid)
        elif args.command == "caller-check":
            result = caller_check(args.probe_id, args.plan_sha256, args.phase)
        else:
            result = consumer_check(args.probe_id, args.plan_sha256, args.phase,
                                    verify=args.command == "consumer-verify")
        print(json.dumps(result, sort_keys=True))
        return 1 if result["status"] == "FAILED" else 0
    except (Unavailable, OSError, ValueError, TypeError, KeyError) as exc:
        print(json.dumps({"status": "UNAVAILABLE", "scope": SCOPE, "runtime_admission": False,
                          "reason": str(exc), "errno": getattr(exc, "errno", None)}, sort_keys=True))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
