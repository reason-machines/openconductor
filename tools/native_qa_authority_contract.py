"""Pure inert-pair evidence contract. No transport, syscall probe or admission."""
from dataclasses import asdict, dataclass, replace
import hashlib
import itertools
import json
import re

VERSION = "OC_INERT_PAIR_CONTRACT_V1"
MAX_BYTES = 256 * 1024
SEED = b"OpenConductor inert pair contract only\n".ljust(4096, b".")
ROLES = ("supervisor", "consumer", "caller", "peer")
FILES = ("disk", "aux")
# Stage name and successful return; None means a nonnegative descriptor/address.
OPERATIONS = {
    "write": (("open", None), ("pwrite", 32)),
    "truncate": (("truncate", 0),),
    "mmap": (("open", None), ("mmap", None), ("store", 0), ("msync", 0)),
    "chmod": (("chmod", 0),),
    "replace": (("same_volume_source", 0), ("rename", 0)),
    "replace_parent": (("absent_sibling", 0), ("rename_parent", 0)),
    "alias_write": (("symlink", 0), ("open_alias", None), ("pwrite", 32)),
}
CONTROL = (("pread", 4096), ("pwrite", 32), ("fsync", 0), ("pread", 4096))


class ContractRefusal(ValueError):
    """Evidence does not satisfy this finite contract."""


@dataclass(frozen=True)
class Actor:
    boot: str
    pid: int
    birth: str
    image: str
    ruid: int
    euid: int
    suid: int
    groups: tuple[int, ...]
    authority: str


@dataclass(frozen=True)
class FilePin:
    volume: str
    kind: str
    inode: int
    uid: int
    gid: int
    mode: int
    nlink: int
    flags: int
    acl: str
    ancestry: str


@dataclass(frozen=True)
class ExternalContext:
    """Selected outside the report by a future authenticated native adapter.

    This module cannot authenticate or produce this context. A test-created
    context is only a structural fixture, never native evidence. The digest
    binds independently authenticated OS/probe observations, not just a signed
    forwarding of actor-provided errno. Callers must establish that trust first.
    """
    source: str
    config: str
    nonce: str
    os_build: str
    supervisor: Actor
    consumer: Actor
    caller: Actor
    peer: Actor
    disk: FilePin
    aux: FilePin
    bootstrap: str
    postdrop_witness: str
    capability_inventory: str
    authenticated_report_sha256: str


@dataclass(frozen=True)
class ContractReadback:
    report_sha256: str
    caller: Actor
    peer: Actor
    scope: str = "one-live-phase; two inert files; seven acquisition operations"

    @property
    def native_admission(self):
        return False

    @property
    def status(self):
        return "CONTRACT_CORRELATED_NOT_NATIVE_QUALIFIED"


def _require(condition, reason):
    if not condition:
        raise ContractRefusal(reason)


def _keys(value, keys):
    _require(type(value) is dict and set(value) == set(keys), "unexpected fields")
    return value


def _integer(value, minimum=0):
    _require(type(value) is int and minimum <= value <= 2**63 - 1, "invalid integer")
    return value


def _text(value):
    _require(type(value) is str and 0 < len(value) <= 256, "invalid text")
    return value


def _digest(value, size=64):
    _require(type(value) is str and re.fullmatch(f"[0-9a-f]{{{size}}}", value),
             "invalid digest")
    return value


def _actor(value):
    _keys(value, Actor.__dataclass_fields__)
    for name in ("boot", "birth"):
        _text(value[name])
    for name in ("image", "authority"):
        _digest(value[name])
    for name in ("pid", "ruid", "euid", "suid"):
        _integer(value[name], 1 if name == "pid" else 0)
    groups = value["groups"]
    _require(type(groups) is list and len(groups) <= 32, "invalid groups")
    for group in groups:
        _integer(group)
    _require(groups == sorted(set(groups)), "ambiguous groups")
    return Actor(**{**value, "groups": tuple(groups)})


def _pin(value):
    _keys(value, FilePin.__dataclass_fields__)
    _text(value["volume"])
    _require(value["kind"] == "REGULAR", "nonregular file")
    for name in ("inode", "uid", "gid", "mode", "nlink", "flags"):
        _integer(value[name], 1 if name in ("inode", "nlink") else 0)
    for name in ("acl", "ancestry"):
        _digest(value[name])
    _require(value["mode"] <= 0o7777, "invalid mode")
    return FilePin(**value)


def _snapshot(value, supervisor):
    _keys(value, ("pin", "size", "sha256", "entry", "observer"))
    pin = _pin(value["pin"])
    _integer(value["size"])
    _digest(value["sha256"])
    _require(value["entry"] in ("PRESENT", "MOVED"), "unknown entry state")
    _require(_actor(value["observer"]) == supervisor, "wrong observer lifetime")
    return pin


def _steps(value, plan, denied=False):
    _require(type(value) is list and len(value) == len(plan), "missing syscall stages")
    denied_index = 1 if plan[0][0] in ("same_volume_source", "absent_sibling", "symlink") else 0
    for index, (step, (name, expected)) in enumerate(zip(value, plan)):
        _keys(step, ("stage", "return", "errno"))
        _require(step["stage"] == name, "wrong syscall stage")
        result, error = step["return"], step["errno"]
        if denied and index > denied_index:
            _require(result is None and error is None, "unreached stage relabelled")
        elif denied and index == denied_index:
            _require(type(result) is int and result == -1 and type(error) is int
                     and error in (1, 13), "no permission denial at protected syscall")
        else:
            _require(type(result) is int and 0 <= result <= 2**63 - 1
                     and (expected is None or result == expected)
                     and type(error) is int and error == 0, "failed operation control")


def control_digest(nonce, target, position):
    """Fixed supervisor-selected bytes, not an actor-selected mutation payload."""
    marker = hashlib.sha256(f"{nonce}:{target}:{position}".encode()).digest()
    return hashlib.sha256(marker + SEED[32:]).hexdigest()


def _calibration(record, actor, target, supervisor, seen):
    before, after = record["before"], record["after"]
    pin = _snapshot(before, supervisor)
    other = _snapshot(after, supervisor)
    _require(pin.volume == target.volume and pin.inode != target.inode
             and pin.uid == actor.euid and pin.mode == 0o600 and pin.nlink == 1
             and pin.flags == 0 and pin.ancestry != target.ancestry,
             "calibration is not a separate same-volume owned object")
    identity = (pin.volume, pin.inode)
    _require(identity not in seen, "reused calibration object")
    seen.add(identity)
    _require(before["entry"] == "PRESENT" and before["size"] == len(SEED)
             and before["sha256"] == hashlib.sha256(SEED).hexdigest(),
             "invalid calibration baseline")
    operation = record["operation"]
    expected_pin = pin
    if operation == "chmod":
        expected_pin = replace(pin, mode=0o666)
    elif operation == "replace":
        _require(other.inode == record["operand"]["source_inode"] and other.inode != pin.inode
                 and (other.volume, other.inode) not in seen,
                 "replacement did not create the selected distinct object")
        expected_pin = replace(pin, inode=other.inode)
        seen.add((other.volume, other.inode))
    elif operation == "replace_parent":
        _require(other.ancestry != pin.ancestry and after["entry"] == "MOVED",
                 "parent rename was not observed")
        expected_pin = replace(pin, ancestry=other.ancestry)
    _require(other == expected_pin, "unexpected calibration metadata change")
    _require(after["entry"] == ("MOVED" if operation == "replace_parent" else "PRESENT"),
             "invalid calibration entry")
    if operation in ("write", "mmap", "alias_write", "replace"):
        _require(after["sha256"] != before["sha256"] and after["size"] == len(SEED),
                 "calibration mutation not observed")
    elif operation == "truncate":
        _require(after["size"] == 0 and after["sha256"] == hashlib.sha256(b"").hexdigest(),
                 "truncation not observed")
    else:
        _require(after["sha256"] == before["sha256"] and after["size"] == before["size"],
                 "unexpected calibration content change")


def _operands(record, pin):
    operand = _keys(record["operand"], ("volume", "target_inode", "source_volume",
                                       "source_inode", "alias_target_inode"))
    _require(operand["volume"] == pin.volume
             and _integer(operand["target_inode"], 1) == pin.inode, "wrong syscall target")
    operation = record["operation"]
    if operation in ("replace", "alias_write"):
        _require(operand["source_volume"] == pin.volume
                 and _integer(operand["source_inode"], 1) != pin.inode,
                 "invalid source/alias identity or volume")
    else:
        _require(operand["source_volume"] is None and operand["source_inode"] is None,
                 "unexpected source capability")
    if operation == "alias_write":
        _require(_integer(operand["alias_target_inode"], 1) == pin.inode,
                 "alias did not bind exact target")
    else:
        _require(operand["alias_target_inode"] is None, "unexpected alias target")


def _pairs(items):
    result = {}
    for name, value in items:
        _require(name not in result, "duplicate JSON key")
        result[name] = value
    return result


def validate_receipt(raw, context):
    """Correlate a strict finite report with externally authenticated context.

    No file/OS/network operations, signature verification, runner, or native
    admission is supplied. External authentication and actual syscall witnesses
    are required from an independently selected adapter, not from JSON fields.
    """
    _require(type(raw) is bytes and 0 < len(raw) <= MAX_BYTES, "report size/type")
    _require(type(context) is ExternalContext, "external observation context unavailable")
    digest = hashlib.sha256(raw).hexdigest()
    _require(digest == _digest(context.authenticated_report_sha256),
             "report differs from externally authenticated observations")
    try:
        report = json.loads(raw, object_pairs_hook=_pairs,
                            parse_constant=lambda _: (_ for _ in ()).throw(
                                ContractRefusal("non-finite JSON value")))
    except (ValueError, UnicodeError, RecursionError) as error:
        raise ContractRefusal("invalid JSON report") from error
    _keys(report, ("version", "source", "config", "nonce", "os_build", "phase",
                   "actors", "files", "transfer", "records", "terminal", "native_admission"))
    _require(report["version"] == VERSION and report["phase"] == "ACTIVE_QUIESCENT"
             and report["native_admission"] is False, "unsupported scope or admission claim")
    _digest(context.source, 40)
    _digest(context.config)
    _text(context.nonce)
    _text(context.os_build)
    for name in ("source", "config", "nonce", "os_build"):
        _require(report[name] == getattr(context, name), "deployment selection mismatch")
    actors = _keys(report["actors"], ROLES)
    actors = {role: _actor(actors[role]) for role in ROLES}
    for role in ROLES:
        selected = getattr(context, role)
        _require(type(selected) is Actor and type(selected.groups) is tuple,
                 "invalid selected actor")
        _actor({**asdict(selected), "groups": list(selected.groups)})
        _require(actors[role] == selected, "actor authority/lifetime mismatch")
    supervisor, consumer, caller, peer = (actors[role] for role in ROLES)
    _require(len({(a.boot, a.pid) for a in actors.values()}) == 4
             and len({a.boot for a in actors.values()}) == 1, "actors not distinct/live on same boot")
    _require(supervisor.ruid == supervisor.euid == supervisor.suid == 0,
             "independent supervisor authority unavailable")
    _require(caller.ruid == caller.euid == caller.suid != 0
             and peer.ruid == peer.euid == peer.suid == caller.euid
             and peer.groups == caller.groups, "unqualified denied credentials")
    _require(consumer.ruid == consumer.euid == consumer.suid != 0
             and consumer.euid != caller.euid and 0 not in consumer.groups
             and not set(consumer.groups).intersection(caller.groups),
             "consumer authority is not separated")
    files = _keys(report["files"], FILES)
    pins = {role: _pin(files[role]) for role in FILES}
    _require(pins == {role: getattr(context, role) for role in FILES}, "file/ancestor pin mismatch")
    _require(len({(p.volume, p.inode) for p in pins.values()}) == 2,
             "pair aliases one object")
    for pin in pins.values():
        _require(pin.uid == pin.gid == pin.flags == 0 and pin.mode == 0o600
                 and pin.nlink == 1, "unqualified protected file")
    transfer = _keys(report["transfer"], ("order", "mechanism", "fds", "bootstrap",
                     "postdrop_witness", "capability_inventory"))
    _require(transfer["order"] == ["separated", "created", "dropped", "observed_image",
             "granted", "acknowledged", "channel_closed"], "invalid creation/handoff ordering")
    _require(transfer["mechanism"] == "PRIVATE_POSTDROP_SCM_RIGHTS"
             and transfer["fds"] == ["disk:O_RDWR", "aux:O_RDWR"], "unqualified handoff")
    for name in ("bootstrap", "postdrop_witness", "capability_inventory"):
        _require(transfer[name] == _digest(getattr(context, name)), "transfer witness mismatch")
    records = report["records"]
    expected = [("control", "consumer", target, "before") for target in FILES]
    for actor, target, operation in itertools.product(("caller", "peer"), FILES, OPERATIONS):
        expected.extend([(kind, actor, target, operation) for kind in ("calibration", "denial")])
    expected.extend(("control", "consumer", target, "after") for target in FILES)
    _require(type(records) is list and len(records) == len(expected), "incomplete exact matrix")
    current = {role: hashlib.sha256(SEED).hexdigest() for role in FILES}
    seen = {(p.volume, p.inode) for p in pins.values()}
    for sequence, (record, key) in enumerate(zip(records, expected), 1):
        _keys(record, ("sequence", "kind", "actor", "file", "operation", "operand", "steps", "before", "after"))
        _require(_integer(record["sequence"], 1) == sequence, "invalid phase sequence")
        _require(tuple(record[name] for name in ("kind", "actor", "file", "operation")) == key,
                 "missing/duplicate/substituted matrix cell")
        kind, actor, target, operation = key
        _operands(record, _snapshot(record["before"], supervisor))
        if kind == "calibration":
            _steps(record["steps"], OPERATIONS[operation])
            _calibration(record, actors[actor], pins[target], supervisor, seen)
            continue
        for snapshot in (record["before"], record["after"]):
            _require(_snapshot(snapshot, supervisor) == pins[target]
                     and snapshot["entry"] == "PRESENT" and snapshot["size"] == len(SEED),
                     "protected object or ancestry changed")
        _require(record["before"]["sha256"] == current[target], "wrong quiescent baseline")
        if kind == "control":
            _steps(record["steps"], CONTROL)
            current[target] = control_digest(context.nonce, target, operation)
        else:
            _steps(record["steps"], OPERATIONS[operation], denied=True)
        _require(record["after"]["sha256"] == current[target], "unexpected observed contents")
    terminal = _keys(report["terminal"], ("sequence", "state", "consumer", "observer"))
    _require(_integer(terminal["sequence"], 1) == len(expected) + 1
             and terminal["state"] == "LIVE_QUIESCENT_RETAINED"
             and _actor(terminal["consumer"]) == consumer
             and _actor(terminal["observer"]) == supervisor, "lost final ownership/lifetime")
    return ContractReadback(digest, caller, peer)
