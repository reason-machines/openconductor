"""Pure inert-pair evidence contract. No transport, syscall probe or admission.

Consumer bridge (parse_authority_contract / consume_authority_contract /
verify_contract_identity) connects CapabilityResult.stdout to
verify_identity_through_use, completing the Python pipeline from bundle staging
to identity verification.  No subprocess, native framework call, or OS admission.
"""
from dataclasses import asdict, dataclass, replace
import hashlib
import itertools
import json
import re

VERSION = "OC_INERT_PAIR_CONTRACT_V2"
MAX_BYTES = 256 * 1024
SEED = b"OpenConductor inert pair contract only\n".ljust(4096, b".")
ROLES = ("supervisor", "consumer", "caller", "peer")
FILES = ("disk", "aux")


@dataclass(frozen=True)
class Stage:
    """Closed argument schema and successful result; None denotes an FD/address."""
    name: str
    result: int | None
    arguments: tuple[tuple[str, str], ...]
    denial: bool = False


OPEN = (("entry", "target"), ("flags", "open_flags"))
WRITE = (("fd", "fd"), ("offset", "zero"), ("length", "write_length"),
         ("sha256", "payload"))
READ = (("fd", "fd"), ("offset", "zero"), ("length", "file_length"))
OPERATIONS = {
    "write": (Stage("open", None, OPEN, True), Stage("pwrite", 32, WRITE)),
    "truncate": (Stage("truncate", 0, (("entry", "target"), ("length", "zero")), True),),
    "mmap": (Stage("open", None, OPEN, True),
             Stage("mmap", None, (("fd", "fd"), ("offset", "zero"),
                   ("length", "file_length"), ("protection", "protection"),
                   ("flags", "map_flags"))),
             Stage("store", 0, (("mapping", "mapping"), ("offset", "zero"),
                   ("length", "write_length"), ("sha256", "payload"))),
             Stage("msync", 0, (("mapping", "mapping"), ("length", "file_length"),
                   ("flags", "sync_flags")))),
    "chmod": (Stage("chmod", 0, (("entry", "target"), ("mode", "mode")), True),),
    "replace": (Stage("same_volume_source", 0, (("entry", "source"),)),
                Stage("rename", 0, (("source", "source"), ("destination", "target")), True)),
    "replace_parent": (Stage("absent_sibling", 0, (("source", "directory"),
                              ("destination", "absent"))),
                       Stage("rename_parent", 0, (("source", "directory"),
                              ("destination", "absent")), True)),
    "alias_write": (Stage("symlink", 0, (("entry", "source"), ("target", "target"))),
                    Stage("open_alias", None, (("entry", "source"),
                          ("target", "target"), ("flags", "alias_flags")), True),
                    Stage("pwrite", 32, WRITE)),
}
CONTROL = (Stage("pread", 4096, READ), Stage("pwrite", 32, WRITE),
           Stage("fsync", 0, (("fd", "fd"),)), Stage("pread", 4096, READ))


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
class RowSelection:
    """Independently selected row identity and correlation pins, not credentials."""
    sequence: int
    kind: str
    role: str
    file: str
    operation: str
    phase: str
    actor: Actor
    lifetime: str
    operand_sha256: str
    witness_sha256: str


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
    rows: tuple[RowSelection, ...]


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
    denied_index = next((i for i, spec in enumerate(plan) if spec.denial), -1)
    _require(not denied or denied_index >= 0, "operation has no denial stage")
    for index, (step, spec) in enumerate(zip(value, plan)):
        _keys(step, ("stage", "return", "errno", "actor_lifetime"))
        _require(step["stage"] == spec.name, "wrong syscall stage")
        expected = spec.result
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


def canonical_digest(value, domain):
    """Correlation hash only; canonicalizing or hashing never authenticates data."""
    _require(domain in ("operand", "witness"), "unknown digest domain")
    try:
        raw = json.dumps(value, sort_keys=True, separators=(",", ":"),
                         ensure_ascii=True, allow_nan=False).encode("ascii")
    except (TypeError, ValueError, RecursionError) as error:
        raise ContractRefusal("invalid canonical value") from error
    return hashlib.sha256(f"{VERSION}:{domain}\0".encode() + raw).hexdigest()


def _directory(value):
    _keys(value, ("volume", "inode", "ancestry"))
    _text(value["volume"])
    _integer(value["inode"], 1)
    _digest(value["ancestry"])
    return value


def _name(value):
    _text(value)
    _require(value not in (".", "..") and "/" not in value and "\0" not in value,
             "invalid entry name")
    return value


def _entry(value, kind):
    _keys(value, ("volume", "inode", "kind", "ancestry", "parent", "name"))
    _text(value["volume"])
    _integer(value["inode"], 1)
    _require(value["kind"] == kind, "wrong operand entry kind")
    _digest(value["ancestry"])
    _directory(value["parent"])
    _name(value["name"])
    _require(value["volume"] == value["parent"]["volume"], "cross-volume entry")
    _require(value["inode"] != value["parent"]["inode"], "entry aliases its parent")
    return value


def _operands(record, pin, plan, selection, context):
    operand = _keys(record["operand"], ("volume", "target_inode", "source_volume",
                   "source_inode", "alias_target_inode", "target_entry", "source_entry", "plan"))
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
    target = _entry(operand["target_entry"], "REGULAR")
    _require((target["volume"], target["inode"], target["ancestry"])
             == (pin.volume, pin.inode, pin.ancestry), "target entry pin mismatch")
    source = operand["source_entry"]
    if operation in ("replace", "alias_write"):
        _entry(source, "SYMLINK" if operation == "alias_write" else "REGULAR")
        _require((source["volume"], source["inode"])
                 == (operand["source_volume"], operand["source_inode"]), "source entry pin mismatch")
    else:
        _require(source is None, "unexpected source entry")
    arguments = operand["plan"]
    _require(type(arguments) is list and len(arguments) == len(plan), "incomplete operand plan")
    marker_position = operation if record["kind"] == "control" else f"row:{record['sequence']}"
    marker = hashlib.sha256(f"{context.nonce}:{record['file']}:{marker_position}".encode()).digest()
    fixed = {"zero": 0, "write_length": 32, "file_length": len(SEED), "mode": 0o666,
             "payload": hashlib.sha256(marker).hexdigest(),
             "open_flags": ["O_RDWR", "O_NOFOLLOW"], "alias_flags": ["O_RDWR"],
             "protection": ["PROT_READ", "PROT_WRITE"], "map_flags": ["MAP_SHARED"],
             "sync_flags": ["MS_SYNC"]}
    for args, spec, step in zip(arguments, plan, record["steps"]):
        _keys(args, (name for name, _ in spec.arguments))
        reached = step["return"] is not None
        _require(step["actor_lifetime"] == (selection.lifetime if reached else None),
                 "stage actor lifetime mismatch")
        for name, kind in spec.arguments:
            value = args[name]
            if kind in fixed:
                expected = fixed[kind]
                if type(expected) is int:
                    _integer(value)
                _require(type(value) is type(expected) and value == expected, "wrong fixed operand")
            elif kind in ("target", "source"):
                _entry(value, "REGULAR" if kind == "target" or operation == "replace" else "SYMLINK")
                _require(value == (target if kind == "target" else source), "stage entry mismatch")
            elif kind in ("fd", "mapping"):
                if not reached:
                    _require(value is None, "unreached stage has acquired capability")
                    continue
                _keys(value, ("value", "origin", "sequence", "actor_lifetime", "volume", "inode"))
                _integer(value["value"])
                _integer(value["sequence"])
                _integer(value["inode"], 1)
                if record["kind"] == "control":
                    origin, sequence, acquired = "postdrop_transfer", 0, value["value"]
                else:
                    origin = "mmap" if kind == "mapping" else ("open_alias" if operation == "alias_write" else "open")
                    acquired = next(s["return"] for s in record["steps"] if s["stage"] == origin)
                    sequence = record["sequence"]
                _require(value == {"value": acquired, "origin": origin, "sequence": sequence,
                         "actor_lifetime": selection.lifetime, "volume": pin.volume, "inode": pin.inode},
                         "descriptor/mapping provenance mismatch")
            elif kind == "directory":
                _entry(value, "DIRECTORY")
                _require({k: value[k] for k in ("volume", "inode", "ancestry")} == target["parent"],
                         "rename source is not target parent")
                _require(value == arguments[0]["source"], "rename source changed after preflight")
            elif kind == "absent":
                _keys(value, ("parent", "name", "entry"))
                _directory(value["parent"])
                _name(value["name"])
                directory = arguments[0]["source"]
                _require(value["entry"] == "ABSENT" and value["parent"] == directory["parent"]
                         and value["name"] != directory["name"] and value == arguments[0]["destination"],
                         "rename destination is not selected absent sibling")
            else:
                raise ContractRefusal("unknown operand schema")
    if record["kind"] == "control":
        _require(all(args["fd"] == arguments[0]["fd"] for args in arguments),
                 "consumer descriptor changed within control")
    _require(canonical_digest(operand, "operand") == _digest(selection.operand_sha256),
             "externally selected operand plan mismatch")
    _require(canonical_digest(record, "witness") == _digest(selection.witness_sha256),
             "externally selected row witness mismatch")


def _selection(value, sequence, key, actors):
    _require(type(value) is RowSelection, "missing external row selection")
    _require(_integer(value.sequence, 1) == sequence
             and (value.kind, value.role, value.file, value.operation) == key
             and value.phase == "ACTIVE_QUIESCENT", "external row selection mismatch")
    _require(type(value.actor) is Actor and type(value.actor.groups) is tuple,
             "invalid external row actor")
    _actor({**asdict(value.actor), "groups": list(value.actor.groups)})
    _require(value.actor == actors[key[1]], "external row actor mismatch")
    _digest(value.lifetime)
    return value


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
    for role in FILES:
        selected = getattr(context, role)
        _require(type(selected) is FilePin, "invalid selected file pin")
        _pin(asdict(selected))
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
    _require(type(context.rows) is tuple and len(context.rows) == len(expected),
             "incomplete external row selections")
    lifetimes = {}
    consumer_fds = {}
    current = {role: hashlib.sha256(SEED).hexdigest() for role in FILES}
    seen = {(p.volume, p.inode) for p in pins.values()}
    for sequence, (record, key) in enumerate(zip(records, expected), 1):
        _keys(record, ("sequence", "kind", "actor", "file", "operation", "phase",
                       "actor_lifetime", "operand", "steps", "before", "after"))
        _require(_integer(record["sequence"], 1) == sequence, "invalid phase sequence")
        _require(tuple(record[name] for name in ("kind", "actor", "file", "operation")) == key,
                 "missing/duplicate/substituted matrix cell")
        kind, actor, target, operation = key
        selection = _selection(context.rows[sequence - 1], sequence, key, actors)
        _require(record["phase"] == selection.phase and record["actor_lifetime"] == selection.lifetime,
                 "row phase/actor lifetime mismatch")
        _require(lifetimes.setdefault(actor, selection.lifetime) == selection.lifetime
                 and all(role == actor or token != selection.lifetime for role, token in lifetimes.items()),
                 "ambiguous actor lifetime token")
        plan = CONTROL if kind == "control" else OPERATIONS[operation]
        _steps(record["steps"], plan, denied=kind == "denial")
        _operands(record, _snapshot(record["before"], supervisor), plan, selection, context)
        if kind == "calibration":
            _calibration(record, actors[actor], pins[target], supervisor, seen)
            continue
        for snapshot in (record["before"], record["after"]):
            _require(_snapshot(snapshot, supervisor) == pins[target]
                     and snapshot["entry"] == "PRESENT" and snapshot["size"] == len(SEED),
                     "protected object or ancestry changed")
        _require(record["before"]["sha256"] == current[target], "wrong quiescent baseline")
        if kind == "control":
            fd = record["operand"]["plan"][0]["fd"]["value"]
            _require(consumer_fds.setdefault(target, fd) == fd
                     and all(role == target or other != fd for role, other in consumer_fds.items()),
                     "consumer transfer descriptor binding changed")
            current[target] = control_digest(context.nonce, target, operation)
        _require(record["after"]["sha256"] == current[target], "unexpected observed contents")
    terminal = _keys(report["terminal"], ("sequence", "state", "consumer", "observer"))
    _require(_integer(terminal["sequence"], 1) == len(expected) + 1
             and terminal["state"] == "LIVE_QUIESCENT_RETAINED"
             and _actor(terminal["consumer"]) == consumer
             and _actor(terminal["observer"]) == supervisor, "lost final ownership/lifetime")
    return ContractReadback(digest, caller, peer)


# ---------------------------------------------------------------------------
# Consumer bridge: CapabilityResult → AuthorityContractDocument → identity
# ---------------------------------------------------------------------------
# No subprocess, native framework call, OS admission, or file I/O.  All
# verification is deterministic and purely document-based.  The JSON allowlist
# below is the sole accepted schema; unknown fields are refused at every level.

from tools import native_qa_identity_through_use as _itu

AUTHORITY_CONTRACT_SCHEMA = "OC_VM_AUTHORITY_CONTRACT_V1"

# The JSON document the runner writes to stdout does NOT carry stdout_sha256;
# parse_authority_contract computes it from the raw bytes and stores it in the
# returned AuthorityContractDocument.  The field is therefore absent from the
# JSON allowlist so that an actor-supplied value is refused.
_AC_DOC_FIELDS = frozenset((
    "schema", "operation",
    "caller", "caller_stages",
    "consumer", "consumer_stages",
))
_AC_ACTOR_FIELDS = frozenset(("role", "uid", "pid", "boot", "birth", "image", "authority"))
_AC_STAGE_FIELDS = frozenset(("stage", "return", "errno"))


class AuthorityContractRefusal(ValueError):
    """stdout does not conform to the authority contract document schema."""


@dataclass(frozen=True)
class AuthorityContractDocument:
    """Parsed JSON authority contract produced by the native QA VM runner on exit 0.

    Fields
    ------
    schema          : always AUTHORITY_CONTRACT_SCHEMA.
    operation       : operation key (e.g. "write", "mmap") exercised in this run.
    stdout_sha256   : sha256 hex of the raw stdout bytes that were parsed;
                      populated by parse_authority_contract, absent from the JSON.
    caller          : ActorIdentityClaim for the caller principal (uid 501).
    caller_stages   : ordered StageRecords from the caller's operation sequence.
    consumer        : ActorIdentityClaim for the consumer principal (uid 1).
    consumer_stages : ordered StageRecords from the consumer's operation sequence.
    """
    schema: str
    operation: str
    stdout_sha256: str
    caller: _itu.ActorIdentityClaim
    caller_stages: tuple
    consumer: _itu.ActorIdentityClaim
    consumer_stages: tuple


@dataclass(frozen=True)
class ContractIdentityResult:
    """Result of verify_contract_identity: verdicts for caller and consumer.

    both_proven is True iff both caller_verdict and consumer_verdict are PROVEN.
    """
    caller_verdict: _itu.IdentityVerdict
    consumer_verdict: _itu.IdentityVerdict
    both_proven: bool


def _ac_require(condition, reason):
    if not condition:
        raise AuthorityContractRefusal(reason)


def _ac_parse_actor(value, *, expected_role, expected_uid):
    """Parse and validate an actor dict from the authority contract document."""
    _ac_require(isinstance(value, dict) and not isinstance(value, type)
                and set(value) == _AC_ACTOR_FIELDS,
                f"actor must be an object with exactly these fields: {sorted(_AC_ACTOR_FIELDS)}")
    role = value["role"]
    _ac_require(isinstance(role, str) and role == expected_role,
                f"actor role must be {expected_role!r}")
    uid = value["uid"]
    _ac_require(isinstance(uid, int) and not isinstance(uid, bool) and uid == expected_uid,
                f"actor uid must be {expected_uid} (integer, not bool)")
    pid = value["pid"]
    _ac_require(isinstance(pid, int) and not isinstance(pid, bool) and pid >= 1,
                "actor pid must be a positive integer")
    for field_name in ("boot", "birth", "image", "authority"):
        v = value[field_name]
        _ac_require(isinstance(v, str) and v,
                    f"actor {field_name!r} must be a non-empty string")
    return _itu.ActorIdentityClaim(
        role=role, uid=uid, pid=pid,
        boot=value["boot"], birth=value["birth"],
        image=value["image"], authority=value["authority"],
    )


def _ac_parse_stages(value):
    """Parse a list of stage dicts from the authority contract document."""
    _ac_require(isinstance(value, list),
                "stages must be a JSON array")
    result = []
    for item in value:
        _ac_require(isinstance(item, dict) and set(item) == _AC_STAGE_FIELDS,
                    f"stage must be an object with exactly these fields: {sorted(_AC_STAGE_FIELDS)}")
        name = item["stage"]
        _ac_require(isinstance(name, str) and name,
                    "stage 'stage' must be a non-empty string")
        returned = item["return"]
        errno = item["errno"]
        absent = returned is None and not errno
        denied = (not absent) and bool(errno)
        result.append(_itu.StageRecord(stage=name, denied=denied, absent=absent))
    return tuple(result)


def parse_authority_contract(stdout):
    """Parse *stdout* bytes as an authority contract document.

    Parameters
    ----------
    stdout : bytes
        Raw stdout captured from the native QA VM runner on exit 0.

    Returns
    -------
    AuthorityContractDocument

    Raises
    ------
    AuthorityContractRefusal
        If *stdout* is not bytes, is empty, is not valid JSON, or does not
        conform to the strict AUTHORITY_CONTRACT_SCHEMA allowlist.
    """
    _ac_require(isinstance(stdout, bytes) and stdout,
                "stdout must be non-empty bytes")
    actual_sha256 = hashlib.sha256(stdout).hexdigest()
    try:
        doc = json.loads(stdout)
    except (ValueError, UnicodeError) as exc:
        raise AuthorityContractRefusal("stdout is not valid JSON") from exc
    _ac_require(isinstance(doc, dict) and set(doc) == _AC_DOC_FIELDS,
                f"document must be a JSON object with exactly these fields: {sorted(_AC_DOC_FIELDS)}")
    _ac_require(doc["schema"] == AUTHORITY_CONTRACT_SCHEMA,
                f"document schema must be {AUTHORITY_CONTRACT_SCHEMA!r}")
    operation = doc["operation"]
    _ac_require(isinstance(operation, str) and operation,
                "operation must be a non-empty string")
    caller = _ac_parse_actor(
        doc["caller"],
        expected_role=_itu.CALLER_ROLE,
        expected_uid=_itu.CANONICAL_UID[_itu.CALLER_ROLE],
    )
    consumer = _ac_parse_actor(
        doc["consumer"],
        expected_role=_itu.CONSUMER_ROLE,
        expected_uid=_itu.CANONICAL_UID[_itu.CONSUMER_ROLE],
    )
    caller_stages = _ac_parse_stages(doc["caller_stages"])
    consumer_stages = _ac_parse_stages(doc["consumer_stages"])
    return AuthorityContractDocument(
        schema=doc["schema"],
        operation=operation,
        stdout_sha256=actual_sha256,
        caller=caller,
        caller_stages=caller_stages,
        consumer=consumer,
        consumer_stages=consumer_stages,
    )


def consume_authority_contract(result):
    """Bridge a CapabilityResult to an AuthorityContractDocument.

    Requires ``result.outcome == CapabilityOutcome.SUCCESS``; raises
    AuthorityContractRefusal for any other outcome (including
    NOT_YET_IMPLEMENTED), because the authority contract document is only
    produced when the runner exits 0.

    The document's stdout_sha256 is cross-checked against
    result.stdout_sha256 as an additional binding.

    Parameters
    ----------
    result : CapabilityResult
        A structured result token from the capability broker's
        consume_capability_output.

    Returns
    -------
    AuthorityContractDocument

    Raises
    ------
    TypeError
        If *result* is not a CapabilityResult.
    AuthorityContractRefusal
        If the outcome is not SUCCESS, or the parsed document fails
        any structural or sha256 check.
    """
    # Lazy import to keep this module independent of the broker at module load.
    from tools.native_qa_vm_broker import CapabilityResult, CapabilityOutcome
    if not isinstance(result, CapabilityResult):
        raise TypeError(f"result must be a CapabilityResult, got {type(result).__name__!r}")
    if result.outcome != CapabilityOutcome.SUCCESS:
        raise AuthorityContractRefusal(
            f"CapabilityResult outcome is {result.outcome.value!r}, not 'success'; "
            "the authority contract document is only produced on exit 0"
        )
    doc = parse_authority_contract(result.stdout)
    _ac_require(doc.stdout_sha256 == result.stdout_sha256,
                "document stdout_sha256 does not match CapabilityResult.stdout_sha256")
    return doc


def verify_contract_identity(doc, operation_name):
    """Verify caller and consumer identities from an authority contract document.

    Calls verify_identity_through_use for both the caller (uid 501) and the
    consumer (uid 1) using the stage records in *doc*.

    Parameters
    ----------
    doc            : AuthorityContractDocument
    operation_name : str
        The operation key to associate with the stage evidence (e.g. "write").
        Typically ``doc.operation``; callers may supply it independently.

    Returns
    -------
    ContractIdentityResult
        both_proven is True iff both verdicts are IdentityVerdict.PROVEN.

    Raises
    ------
    TypeError
        If *doc* is not an AuthorityContractDocument or *operation_name* is
        not a str.
    _itu.ThroughUseContractError
        If the evidence structure is internally inconsistent.
    """
    if not isinstance(doc, AuthorityContractDocument):
        raise TypeError(f"doc must be an AuthorityContractDocument, got {type(doc).__name__!r}")
    if not isinstance(operation_name, str):
        raise TypeError(f"operation_name must be a str, got {type(operation_name).__name__!r}")
    caller_evidence = _itu.ThroughUseEvidence(
        actor=doc.caller,
        stages=doc.caller_stages,
        operation_name=operation_name,
    )
    consumer_evidence = _itu.ThroughUseEvidence(
        actor=doc.consumer,
        stages=doc.consumer_stages,
        operation_name=operation_name,
    )
    caller_verdict = _itu.verify_identity_through_use(
        caller_evidence, expected_role=_itu.CALLER_ROLE
    )
    consumer_verdict = _itu.verify_identity_through_use(
        consumer_evidence, expected_role=_itu.CONSUMER_ROLE
    )
    both_proven = (
        caller_verdict == _itu.IdentityVerdict.PROVEN
        and consumer_verdict == _itu.IdentityVerdict.PROVEN
    )
    return ContractIdentityResult(
        caller_verdict=caller_verdict,
        consumer_verdict=consumer_verdict,
        both_proven=both_proven,
    )
