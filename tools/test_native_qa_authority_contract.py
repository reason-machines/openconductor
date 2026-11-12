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


def steps(plan, denied=False):
    denied_index = 1 if plan[0][0] in ("same_volume_source", "absent_sibling", "symlink") else 0
    result = []
    for index, (stage, value) in enumerate(plan):
        if denied and index > denied_index:
            returned, error = None, None
        elif denied and index == denied_index:
            returned, error = -1, 13
        else:
            returned, error = 3 if value is None else value, 0
        result.append({"stage": stage, "return": returned, "errno": error})
    return result


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
        report["records"].append({"sequence": sequence, "kind": kind, "actor": who,
                                  "file": target, "operation": operation, "operand": operand,
                                  "steps": steps(plan, kind == "denial"),
                                  "before": before, "after": after})

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
        report["transfer"]["postdrop_witness"], report["transfer"]["capability_inventory"], "0" * 64)
    return report, context


def encode(report, context):
    raw = json.dumps(report, sort_keys=True, separators=(",", ":")).encode()
    # Semantic tests deliberately rebind this SYNTHETIC external witness so they
    # exercise the contract, not merely the outer report-digest mismatch check.
    return raw, replace(context, authenticated_report_sha256=hashlib.sha256(raw).hexdigest())


class AuthorityContractTests(unittest.TestCase):
    def setUp(self):
        self.report, self.context = fixture()

    def validate(self):
        return contract.validate_receipt(*encode(self.report, self.context))

    def refused(self):
        with self.assertRaises(contract.ContractRefusal):
            self.validate()

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
                if row["operation"] == "alias_write":
                    row["operand"]["alias_target_inode"] = 1
        self.row(operation="alias_write")["operand"]["alias_target_inode"] = True
        self.refused()

    def test_nonalias_operation_cannot_name_alias_target(self):
        self.row()["operand"]["alias_target_inode"] = 101
        self.refused()

    def test_calibration_cannot_reuse_replacement_result_as_baseline(self):
        replacement = self.row("calibration", "replace")["after"]["pin"]["inode"]
        row = self.row("calibration", "replace_parent")
        for state in ("before", "after"):
            row[state]["pin"]["inode"] = replacement
        row["operand"]["target_inode"] = replacement
        self.refused()

    def test_calibration_cannot_reuse_replacement_result_as_source(self):
        rows = [row for row in self.report["records"]
                if row["kind"] == "calibration" and row["operation"] == "replace"]
        reused = rows[0]["after"]["pin"]["inode"]
        rows[1]["operand"]["source_inode"] = reused
        rows[1]["after"]["pin"]["inode"] = reused
        self.refused()

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
