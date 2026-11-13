"""Synthetic document fixtures only. No native actors, probes or filesystem IO."""
import copy
from dataclasses import asdict, replace
import hashlib
import itertools
import json
import unittest

from tools import native_qa_authority_contract as contract


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def actor(role, pid, uid, group):
    return contract.Actor("fixture-boot", pid, f"fixture-birth-{pid}", digest(role),
                          uid, uid, uid, (group,), digest(f"authority:{role}"))


def steps(plan, lifetime, denied=False):
    denied_index = next((i for i, spec in enumerate(plan) if spec.denial), -1)
    result = []
    for index, spec in enumerate(plan):
        stage, value = spec.name, spec.result
        if denied and index > denied_index:
            returned, error = None, None
        elif denied and index == denied_index:
            returned, error = -1, 13
        else:
            returned, error = 3 if value is None else value, 0
        result.append({"stage": stage, "return": returned, "errno": error,
                       "actor_lifetime": lifetime if returned is not None else None})
    return result


def entry(pin, kind="REGULAR"):
    return {"volume": pin.volume, "inode": pin.inode, "kind": kind,
            "ancestry": pin.ancestry, "name": f"entry-{pin.inode}",
            "parent": {"volume": pin.volume, "inode": 30000 + pin.inode,
                       "ancestry": digest(f"directory:{pin.inode}")}}


def operand_plan(row, nonce):
    operand = row["operand"]
    target = operand["target_entry"]
    source = operand["source_entry"]
    parent = {**target["parent"], "kind": "DIRECTORY", "name": "parent",
              "parent": {"volume": target["volume"], "inode": 70000 + row["sequence"],
                         "ancestry": digest(f"grandparent:{row['sequence']}")}}
    absent = {"parent": parent["parent"], "name": "moved-parent", "entry": "ABSENT"}
    position = row["operation"] if row["kind"] == "control" else f"row:{row['sequence']}"
    marker = hashlib.sha256(f"{nonce}:{row['file']}:{position}".encode()).digest()
    fixed = {"zero": 0, "write_length": 32, "file_length": 4096, "mode": 0o666,
             "payload": hashlib.sha256(marker).hexdigest(),
             "open_flags": ["O_RDWR", "O_NOFOLLOW"], "alias_flags": ["O_RDWR"],
             "protection": ["PROT_READ", "PROT_WRITE"], "map_flags": ["MAP_SHARED"],
             "sync_flags": ["MS_SYNC"], "target": target, "source": source,
             "directory": parent, "absent": absent}
    plan = contract.CONTROL if row["kind"] == "control" else contract.OPERATIONS[row["operation"]]
    result = []
    for spec, step in zip(plan, row["steps"]):
        args = {}
        for name, kind in spec.arguments:
            if kind not in ("fd", "mapping"):
                args[name] = copy.deepcopy(fixed[kind])
                continue
            if step["return"] is None:
                args[name] = None
                continue
            if row["kind"] == "control":
                origin, sequence, value = "postdrop_transfer", 0, 4 if row["file"] == "disk" else 5
            else:
                origin = "mmap" if kind == "mapping" else ("open_alias" if row["operation"] == "alias_write" else "open")
                value = next(s["return"] for s in row["steps"] if s["stage"] == origin)
                sequence = row["sequence"]
            args[name] = {"value": value, "origin": origin, "sequence": sequence,
                          "actor_lifetime": row["actor_lifetime"],
                          "volume": operand["volume"], "inode": operand["target_inode"]}
        result.append(args)
    return result


def selected_rows(report, context):
    return tuple(contract.RowSelection(row["sequence"], row["kind"], row["actor"], row["file"],
        row["operation"], row["phase"], getattr(context, row["actor"]), row["actor_lifetime"],
        contract.canonical_digest(row["operand"], "operand"),
        contract.canonical_digest(row, "witness")) for row in report["records"])


def fixture():
    actors = {"supervisor": actor("supervisor", 10, 0, 0),
              "consumer": actor("consumer", 11, 62001, 62001),
              "caller": actor("caller", 12, 501, 20),
              "peer": actor("peer", 13, 501, 20)}
    pins = {role: contract.FilePin("fixture-local-volume", "REGULAR", 100 + index, 0, 0,
                                  0o600, 1, 0, digest("no-acl"), digest(f"ancestors:{role}"))
            for index, role in enumerate(contract.FILES, 1)}
    report = {"version": contract.VERSION, "source": "1" * 40, "config": digest("config"),
              "nonce": "fixture-nonce", "os_build": "fixture-not-an-OS-run",
              "phase": "ACTIVE_QUIESCENT", "actors": {r: asdict(a) for r, a in actors.items()},
              "files": {r: asdict(p) for r, p in pins.items()},
              "transfer": {"order": ["separated", "created", "dropped", "observed_image",
                                      "granted", "acknowledged", "channel_closed"],
                           "mechanism": "PRIVATE_POSTDROP_SCM_RIGHTS",
                           "fds": ["disk:O_RDWR", "aux:O_RDWR"],
                           "bootstrap": digest("bootstrap"),
                           "postdrop_witness": digest("postdrop"),
                           "capability_inventory": digest("inventory")},
              "records": [], "native_admission": False}
    seed = hashlib.sha256(contract.SEED).hexdigest()
    current = {role: seed for role in contract.FILES}

    def snapshot(pin, sha, size=4096, entry="PRESENT"):
        return {"pin": asdict(pin), "size": size, "sha256": sha, "entry": entry,
                "observer": asdict(actors["supervisor"])}

    def add(kind, who, target, operation):
        sequence = len(report["records"]) + 1
        pin = pins[target]
        if kind == "calibration":
            pin = replace(pin, inode=1000 + sequence, uid=actors[who].euid, gid=20,
                          ancestry=digest(f"own:{sequence}"))
            before = snapshot(pin, seed)
            after = snapshot(pin, seed)
            if operation in ("write", "mmap", "alias_write", "replace"):
                after["sha256"] = digest(f"mutation:{sequence}")
            if operation == "truncate":
                after.update(size=0, sha256=hashlib.sha256(b"").hexdigest())
            elif operation == "chmod":
                after["pin"]["mode"] = 0o666
            elif operation == "replace":
                after["pin"]["inode"] = 20000 + sequence
            elif operation == "replace_parent":
                after["pin"]["ancestry"] = digest(f"moved:{sequence}")
                after["entry"] = "MOVED"
        else:
            before = snapshot(pin, current[target])
            if kind == "control":
                current[target] = contract.control_digest(report["nonce"], target, operation)
            after = snapshot(pin, current[target])
        plan = contract.CONTROL if kind == "control" else contract.OPERATIONS[operation]
        has_source = operation in ("replace", "alias_write")
        operand = {"volume": pin.volume, "target_inode": pin.inode,
                   "source_volume": pin.volume if has_source else None,
                   "source_inode": 20000 + sequence if has_source else None,
                   "alias_target_inode": pin.inode if operation == "alias_write" else None}
        operand.update(target_entry=entry(pin), source_entry=None)
        if has_source:
            operand["source_entry"] = entry(replace(pin, inode=20000 + sequence),
                                            "SYMLINK" if operation == "alias_write" else "REGULAR")
        lifetime = digest(f"lifetime:{who}")
        row = {"sequence": sequence, "kind": kind, "actor": who,
               "file": target, "operation": operation, "phase": "ACTIVE_QUIESCENT",
               "actor_lifetime": lifetime, "operand": operand,
               "steps": steps(plan, lifetime, kind == "denial"), "before": before, "after": after}
        operand["plan"] = operand_plan(row, report["nonce"])
        report["records"].append(row)

    for target in contract.FILES:
        add("control", "consumer", target, "before")
    for who, target, operation in itertools.product(("caller", "peer"), contract.FILES,
                                                   contract.OPERATIONS):
        add("calibration", who, target, operation)
        add("denial", who, target, operation)
    for target in contract.FILES:
        add("control", "consumer", target, "after")
    report["terminal"] = {"sequence": len(report["records"]) + 1,
                          "state": "LIVE_QUIESCENT_RETAINED",
                          "consumer": asdict(actors["consumer"]),
                          "observer": asdict(actors["supervisor"])}
    context = contract.ExternalContext(report["source"], report["config"], report["nonce"],
        report["os_build"], *(actors[r] for r in contract.ROLES),
        *(pins[r] for r in contract.FILES), report["transfer"]["bootstrap"],
        report["transfer"]["postdrop_witness"], report["transfer"]["capability_inventory"], "0" * 64, ())
    return report, replace(context, rows=selected_rows(report, context))


def encode(report, context, rebind_rows=True):
    raw = json.dumps(report, sort_keys=True, separators=(",", ":")).encode()
    # Synthetic semantic fixtures rebind all correlation pins, never real trust.
    # Correlation tests disable row rebinding to exercise independently pinned rows.
    rows = selected_rows(report, context) if rebind_rows else context.rows
    return raw, replace(context, authenticated_report_sha256=hashlib.sha256(raw).hexdigest(), rows=rows)


class AuthorityContractTests(unittest.TestCase):
    def setUp(self):
        self.report, self.context = fixture()

    def validate(self, rebind_rows=True):
        return contract.validate_receipt(*encode(self.report, self.context, rebind_rows))

    def refused(self, reason=None, rebind_rows=True):
        with self.assertRaisesRegex(contract.ContractRefusal, reason or "."):
            self.validate(rebind_rows)

    def row(self, kind="denial", operation="write"):
        return next(r for r in self.report["records"]
                    if r["kind"] == kind and r["operation"] == operation)

    def test_complete_fixture_never_grants_native_admission(self):
        result = self.validate()
        self.assertFalse(result.native_admission)
        self.assertEqual(result.status, "CONTRACT_CORRELATED_NOT_NATIVE_QUALIFIED")
        with self.assertRaises((AttributeError, TypeError)):
            result.native_admission = True

    def test_exact_matrix_has_28_denials_28_calibrations_four_controls(self):
        self.assertEqual({kind: sum(r["kind"] == kind for r in self.report["records"])
                          for kind in ("denial", "calibration", "control")},
                         {"denial": 28, "calibration": 28, "control": 4})
        self.validate()

    def test_missing_external_context(self):
        raw, _ = encode(self.report, self.context)
        with self.assertRaises(contract.ContractRefusal):
            contract.validate_receipt(raw, None)

    def test_untrusted_report_digest(self):
        raw, _ = encode(self.report, self.context)
        with self.assertRaises(contract.ContractRefusal):
            contract.validate_receipt(raw, self.context)

    def test_self_attestation_is_not_context(self):
        self.report["authenticated"] = True
        self.refused()

    def test_duplicate_json_key(self):
        raw, context = encode(self.report, self.context)
        raw = raw[:-1] + b',"native_admission":false}'
        context = replace(context, authenticated_report_sha256=hashlib.sha256(raw).hexdigest())
        with self.assertRaises(contract.ContractRefusal):
            contract.validate_receipt(raw, context)

    def test_oversize_report(self):
        with self.assertRaises(contract.ContractRefusal):
            contract.validate_receipt(b" " * (contract.MAX_BYTES + 1), self.context)

    def test_wrong_source_selection(self):
        self.report["source"] = "2" * 40
        self.refused()

    def test_substituted_caller_lifetime(self):
        self.report["actors"]["caller"]["pid"] = 99
        self.refused()

    def test_same_authority_consumer_even_if_context_matches(self):
        who = replace(self.context.consumer, ruid=501, euid=501, suid=501, groups=(20,))
        self.context = replace(self.context, consumer=who)
        self.report["actors"]["consumer"] = asdict(who)
        self.refused()

    def test_privileged_caller_even_if_context_matches(self):
        who = replace(self.context.caller, ruid=0, euid=0, suid=0)
        self.context = replace(self.context, caller=who)
        self.report["actors"]["caller"] = asdict(who)
        self.refused()

    def test_caller_saved_privilege(self):
        who = replace(self.context.caller, suid=0)
        self.context = replace(self.context, caller=who)
        self.report["actors"]["caller"] = asdict(who)
        self.refused()

    def test_peer_not_distinct(self):
        self.context = replace(self.context, peer=self.context.caller)
        self.report["actors"]["peer"] = asdict(self.context.caller)
        self.refused()

    def test_boolean_pid_rejected(self):
        self.report["actors"]["caller"]["pid"] = True
        self.refused()

    def test_wrong_boot(self):
        who = replace(self.context.peer, boot="other-boot")
        self.context = replace(self.context, peer=who)
        self.report["actors"]["peer"] = asdict(who)
        self.refused()

    def test_ancestor_or_acl_drift(self):
        for field in ("ancestry", "acl"):
            original = copy.deepcopy(self.report)
            self.row()["after"]["pin"][field] = digest("changed")
            self.refused()
            self.report = original

    def test_same_bytes_different_inode(self):
        self.row()["after"]["pin"]["inode"] = 900
        self.refused()

    def test_wrong_transfer_witness(self):
        self.report["transfer"]["postdrop_witness"] = digest("pre-drop-is-not-postdrop")
        self.refused()

    def test_creation_before_separation(self):
        self.report["transfer"]["order"][0:2] = ["created", "separated"]
        self.refused()

    def test_extra_inherited_handle(self):
        self.report["transfer"]["fds"].append("directory:O_RDWR")
        self.refused()

    def test_unqualified_capability_inventory(self):
        self.report["transfer"]["capability_inventory"] = digest("leaked-map-or-mutation-rpc")
        self.refused()

    def test_missing_matrix_cell(self):
        self.report["records"].pop(3)
        self.refused()

    def test_duplicate_matrix_cell(self):
        self.report["records"][5] = copy.deepcopy(self.report["records"][3])
        self.refused()

    def test_preflight_denial(self):
        self.row()["steps"][0]["stage"] = "preflight"
        self.refused()

    def test_unrelated_errors_are_not_denials(self):
        for error in (2, 9, 18, 22, 30):
            self.row()["steps"][0]["errno"] = error
            self.refused()

    def test_mmap_not_reached_cannot_be_labelled_denied(self):
        self.row(operation="mmap")["steps"][1].update({"return": -1, "errno": 13})
        self.refused()

    def test_calibration_must_reach_real_mmap_store_and_sync(self):
        self.row("calibration", "mmap")["steps"][2].update({"return": None, "errno": None})
        self.refused()

    def test_calibration_must_mutate(self):
        row = self.row("calibration")
        row["after"]["sha256"] = row["before"]["sha256"]
        self.refused()

    def test_replacement_calibration_same_volume(self):
        self.row("calibration", "replace")["before"]["pin"]["volume"] = "other-volume"
        self.refused()

    def test_protected_replacement_source_on_wrong_volume(self):
        self.row(operation="replace")["operand"]["source_volume"] = "other-volume"
        self.refused()

    def test_alias_reopen_must_bind_exact_target(self):
        self.row(operation="alias_write")["operand"]["alias_target_inode"] = 999
        self.refused()

    def test_alias_identity_must_be_integer(self):
        row = self.row(operation="alias_write")
        row["operand"]["alias_target_inode"] = float(row["before"]["pin"]["inode"])
        self.refused()

    def test_alias_boolean_identity_even_if_equal(self):
        original = self.context.disk.inode
        self.context = replace(self.context, disk=replace(self.context.disk, inode=1))
        self.report["files"]["disk"]["inode"] = 1
        for row in self.report["records"]:
            if row["before"]["pin"]["inode"] == original:
                for state in ("before", "after"):
                    row[state]["pin"]["inode"] = 1
                row["operand"]["target_inode"] = 1
                row["operand"]["target_entry"]["inode"] = 1
                if row["operation"] == "alias_write":
                    row["operand"]["alias_target_inode"] = 1
                row["operand"]["plan"] = operand_plan(row, self.report["nonce"])
        self.row(operation="alias_write")["operand"]["alias_target_inode"] = True
        self.refused("invalid integer")

    def test_nonalias_operation_cannot_name_alias_target(self):
        self.row()["operand"]["alias_target_inode"] = 101
        self.refused()

    def test_calibration_cannot_reuse_replacement_result_as_baseline(self):
        replacement = self.row("calibration", "replace")["after"]["pin"]["inode"]
        row = self.row("calibration", "replace_parent")
        for state in ("before", "after"):
            row[state]["pin"]["inode"] = replacement
        row["operand"]["target_inode"] = replacement
        row["operand"]["target_entry"]["inode"] = replacement
        row["operand"]["plan"] = operand_plan(row, self.report["nonce"])
        self.refused("reused calibration object")

    def test_calibration_cannot_reuse_replacement_result_as_source(self):
        rows = [row for row in self.report["records"]
                if row["kind"] == "calibration" and row["operation"] == "replace"]
        reused = rows[0]["after"]["pin"]["inode"]
        rows[1]["operand"]["source_inode"] = reused
        rows[1]["after"]["pin"]["inode"] = reused
        rows[1]["operand"]["source_entry"]["inode"] = reused
        rows[1]["operand"]["plan"] = operand_plan(rows[1], self.report["nonce"])
        self.refused("replacement did not create the selected distinct object")

    def test_canonical_digest_is_order_stable_and_domain_separated(self):
        left = {"offset": 0, "length": 32}
        right = {"length": 32, "offset": 0}
        self.assertEqual(contract.canonical_digest(left, "operand"),
                         hashlib.sha256(b'OC_INERT_PAIR_CONTRACT_V2:operand\0{"length":32,"offset":0}').hexdigest())
        self.assertEqual(contract.canonical_digest(left, "operand"),
                         contract.canonical_digest(right, "operand"))
        self.assertNotEqual(contract.canonical_digest(left, "operand"),
                            contract.canonical_digest(left, "witness"))
        self.assertNotEqual(contract.canonical_digest(left, "operand"),
                            contract.canonical_digest({**left, "offset": False}, "operand"))

    def test_external_selection_collection_must_be_complete_immutable_and_ordered(self):
        rows = self.context.rows
        for selected in (rows[:-1], rows + rows[-1:], list(rows), (rows[1],) + rows[1:]):
            with self.subTest(selection_type=type(selected).__name__, length=len(selected)):
                self.context = replace(self.context, rows=selected)
                self.refused("external row selection", rebind_rows=False)

    def test_external_selection_cell_and_actor_are_independent(self):
        original = self.context.rows[0]
        changes = ({"sequence": True}, {"sequence": 2}, {"kind": "denial"},
                   {"role": "caller"}, {"file": "aux"}, {"operation": "after"},
                   {"phase": "STOPPED"}, {"actor": self.context.caller},
                   {"lifetime": digest("substituted-lifetime")})
        for change in changes:
            with self.subTest(change=change):
                selection = replace(original, **change)
                self.context = replace(self.context, rows=(selection,) + self.context.rows[1:])
                self.refused(rebind_rows=False)

    def test_row_selection_is_frozen(self):
        with self.assertRaises((AttributeError, TypeError)):
            self.context.rows[0].operand_sha256 = "0" * 64

    def test_report_cannot_supply_its_own_selection_or_trust_anchor(self):
        for key in ("rows", "operand_sha256", "witness_sha256", "trusted_key"):
            with self.subTest(key=key):
                self.report[key] = "actor-selected"
                self.refused("unexpected fields")
                del self.report[key]

    def test_wrong_independently_selected_plan_digest(self):
        rows = self.context.rows
        self.context = replace(self.context, rows=(replace(rows[0], operand_sha256="0" * 64),) + rows[1:])
        self.refused("externally selected operand plan mismatch", rebind_rows=False)

    def test_wrong_independently_selected_witness_digest(self):
        rows = self.context.rows
        self.context = replace(self.context, rows=(replace(rows[0], witness_sha256="0" * 64),) + rows[1:])
        self.refused("externally selected row witness mismatch", rebind_rows=False)

    def test_valid_changed_directory_plan_requires_external_selection(self):
        row = self.row()
        row["operand"]["target_entry"]["name"] = "other-selected-leaf"
        row["operand"]["plan"] = operand_plan(row, self.report["nonce"])
        self.refused("externally selected operand plan mismatch", rebind_rows=False)

    def test_changed_actual_result_requires_external_row_witness(self):
        self.row()["steps"][0]["errno"] = 1  # Both 1 and 13 are structurally valid denials.
        self.refused("externally selected row witness mismatch", rebind_rows=False)

    def test_changed_snapshot_requires_external_row_witness(self):
        self.row("calibration")["after"]["sha256"] = digest("different-observation")
        self.refused("externally selected row witness mismatch", rebind_rows=False)

    def test_per_row_phase_and_lifetime_substitution(self):
        row = self.row()
        for key, value in (("phase", "STOPPED"), ("actor_lifetime", digest("other-actor"))):
            with self.subTest(key=key):
                original = row[key]
                row[key] = value
                self.refused(rebind_rows=False)
                row[key] = original

    def test_stage_requires_actual_actor_lifetime(self):
        self.row()["steps"][0]["actor_lifetime"] = digest("other-actor")
        self.refused("stage actor lifetime mismatch")

    def test_not_reached_stage_cannot_claim_actor_or_capability(self):
        row = self.row(operation="mmap")
        row["steps"][1]["actor_lifetime"] = row["actor_lifetime"]
        self.refused("stage actor lifetime mismatch")
        row["steps"][1]["actor_lifetime"] = None
        row["operand"]["plan"][1]["fd"] = {"value": 3}
        self.refused("unreached stage has acquired capability")

    def test_actor_tokens_cannot_change_midphase_or_alias_other_actor(self):
        row = self.row()
        old = row["actor_lifetime"]
        for token in (digest("new-caller-lifetime"), self.report["records"][0]["actor_lifetime"]):
            with self.subTest(token=token):
                row["actor_lifetime"] = token
                self.refused("ambiguous actor lifetime token")
        row["actor_lifetime"] = old

    def test_unknown_and_missing_operand_fields(self):
        original = copy.deepcopy(self.row()["operand"])
        for container, key in (("operand", "extra"), ("argument", "extra")):
            with self.subTest(container=container):
                operand = self.row()["operand"]
                selected = operand if container == "operand" else operand["plan"][0]
                selected[key] = 1
                self.refused("unexpected fields")
                self.row()["operand"] = copy.deepcopy(original)
        del self.row()["operand"]["plan"][0]["flags"]
        self.refused("unexpected fields")

    def test_missing_operand_stage(self):
        self.row()["operand"]["plan"].pop()
        self.refused("incomplete operand plan")

    def test_wrong_open_flags(self):
        self.row()["operand"]["plan"][0]["flags"] = ["O_RDONLY"]
        self.refused("wrong fixed operand")

    def test_numeric_operands_reject_equal_valued_float_and_bool(self):
        row = self.row("calibration")
        for value in (False, 0.0):
            with self.subTest(value=value):
                row["operand"]["plan"][1]["offset"] = value
                self.refused("invalid integer")
        row["operand"]["plan"][1]["offset"] = 0
        row["operand"]["plan"][1]["length"] = 32.0
        self.refused("invalid integer")

    def test_wrong_write_range_and_payload(self):
        row = self.row("calibration")
        for key, value in (("offset", 1), ("length", 0), ("sha256", digest("actor-payload"))):
            with self.subTest(key=key):
                original = row["operand"]["plan"][1][key]
                row["operand"]["plan"][1][key] = value
                self.refused("wrong fixed operand")
                row["operand"]["plan"][1][key] = original

    def test_wrong_truncation_length_and_mode(self):
        self.row(operation="truncate")["operand"]["plan"][0]["length"] = 4096
        self.refused("wrong fixed operand")
        self.row(operation="truncate")["operand"]["plan"][0]["length"] = 0
        self.row(operation="chmod")["operand"]["plan"][0]["mode"] = 0o600
        self.refused("wrong fixed operand")

    def test_fd_number_origin_row_actor_and_file_binding(self):
        row = self.row("calibration")
        descriptor = row["operand"]["plan"][1]["fd"]
        for key, value in (("value", 4), ("origin", "postdrop_transfer"), ("sequence", 1),
                           ("actor_lifetime", digest("other")), ("inode", 999), ("volume", "elsewhere")):
            with self.subTest(key=key):
                original = descriptor[key]
                descriptor[key] = value
                self.refused("descriptor/mapping provenance mismatch")
                descriptor[key] = original
        descriptor["value"] = 3.0
        self.refused("invalid integer")

    def test_mapping_requires_its_acquisition_and_exact_shared_range(self):
        row = self.row("calibration", "mmap")
        args = row["operand"]["plan"]
        for key, value in (("offset", 1), ("length", 32), ("flags", ["MAP_PRIVATE"]),
                           ("protection", ["PROT_READ"])):
            with self.subTest(key=key):
                original = args[1][key]
                args[1][key] = value
                self.refused("wrong fixed operand")
                args[1][key] = original
        args[2]["mapping"]["origin"] = "open"
        self.refused("descriptor/mapping provenance mismatch")

    def test_sync_requires_same_mapping_and_sync_flag(self):
        args = self.row("calibration", "mmap")["operand"]["plan"]
        args[3]["mapping"]["value"] = 4
        self.refused("descriptor/mapping provenance mismatch")
        args[3]["mapping"]["value"] = 3
        args[3]["flags"] = ["MS_ASYNC"]
        self.refused("wrong fixed operand")

    def test_alias_source_object_is_distinct_from_resolved_target(self):
        row = self.row(operation="alias_write")
        row["operand"]["plan"][1]["entry"] = copy.deepcopy(row["operand"]["target_entry"])
        self.refused("wrong operand entry kind")

    def test_alias_cannot_resolve_another_target(self):
        self.row(operation="alias_write")["operand"]["plan"][0]["target"]["inode"] = 999
        self.refused("stage entry mismatch")

    def test_parent_rename_source_is_actual_containing_directory(self):
        row = self.row(operation="replace_parent")
        for args in row["operand"]["plan"]:
            args["source"]["inode"] = 999
        self.refused("rename source is not target parent")

    def test_parent_rename_destination_is_same_parent_absent_distinct_sibling(self):
        row = self.row(operation="replace_parent")
        original = copy.deepcopy(row["operand"]["plan"])
        for key, value in (("entry", "PRESENT"), ("name", "parent")):
            with self.subTest(key=key):
                for args in row["operand"]["plan"]:
                    args["destination"][key] = value
                self.refused("rename destination is not selected absent sibling")
                row["operand"]["plan"] = copy.deepcopy(original)
        row["operand"]["plan"][1]["destination"]["parent"]["inode"] = 999
        self.refused("rename destination is not selected absent sibling")

    def test_entry_name_and_directory_identity_are_strict(self):
        target = self.row()["operand"]["target_entry"]
        for name in ("..", ".", "a/b", "a\0b"):
            with self.subTest(name=name):
                target["name"] = name
                self.refused("invalid entry name")
        target["name"] = "disk"
        target["parent"]["inode"] = float(target["parent"]["inode"])
        self.refused("invalid integer")

    def test_consumer_control_operands_cannot_be_omitted(self):
        self.report["records"][0]["operand"]["plan"][0]["length"] = 32
        self.refused("wrong fixed operand")

    def test_consumer_descriptor_must_be_stable_within_control(self):
        self.report["records"][0]["operand"]["plan"][1]["fd"]["value"] += 1
        self.refused("consumer descriptor changed within control")

    def test_consumer_descriptor_cannot_change_after_phase(self):
        for args in self.report["records"][-2]["operand"]["plan"]:
            args["fd"]["value"] = 9
        self.refused("consumer transfer descriptor binding changed")

    def test_boolean_external_row_actor_identity_is_not_equal_integer(self):
        who = replace(self.context.consumer, ruid=1, euid=1, suid=1)
        self.context = replace(self.context, consumer=who)
        self.report["actors"]["consumer"] = asdict(who)
        rows = selected_rows(self.report, self.context)
        invalid = replace(rows[0], actor=replace(who, euid=True))
        self.context = replace(self.context, rows=(invalid,) + rows[1:])
        self.refused("invalid integer", rebind_rows=False)

    def test_numeric_stage_and_entry_identities_remain_strict(self):
        args = self.row("calibration")["operand"]["plan"][1]
        args["fd"]["sequence"] = float(args["fd"]["sequence"])
        self.refused("invalid integer")

    def test_legacy_version_and_unselected_context_dictionary_are_refused(self):
        self.report["version"] = "OC_INERT_PAIR_CONTRACT_V1"
        self.refused("unsupported scope")
        raw, _ = encode(self.report, self.context)
        with self.assertRaisesRegex(contract.ContractRefusal, "external observation context unavailable"):
            contract.validate_receipt(raw, asdict(self.context))

    def test_nonregular_target(self):
        self.report["files"]["disk"]["kind"] = "FIFO"
        self.refused()

    def test_failed_consumer_control(self):
        self.report["records"][0]["steps"][1].update({"return": -1, "errno": 13})
        self.refused()

    def test_unknown_phase_or_stop_claim(self):
        self.report["terminal"]["state"] = "STOP_REQUESTED"
        self.refused()

    def test_lost_observer(self):
        self.row()["after"]["observer"]["birth"] = "new-observer"
        self.refused()

    def test_native_or_gui_admission_claim(self):
        self.report["native_admission"] = True
        self.refused()
        self.report["native_admission"] = False
        self.report["gui_target_verified"] = True
        self.refused()


if __name__ == "__main__":
    unittest.main()
