"""Verify the proposed source binding without applying a patch or running JS."""
import difflib
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def main():
    record = json.loads((HERE / "binding.json").read_text())
    assert record["runtime_grant"] is None
    assert record["candidate_applied"] is False
    assert record["checked_main"] == subprocess.check_output(
        ["git", "rev-parse", "origin/main"], cwd=ROOT, text=True
    ).strip(), "main moved; requalify before application"
    for path, expected in record["immutable_files"].items():
        assert digest((ROOT / path).read_bytes()) == expected, path
    for path, expected in record["main_files"].items():
        raw = subprocess.check_output(
            ["git", "show", record["checked_main"] + ":" + path], cwd=ROOT
        )
        assert digest(raw) == expected, path
    tree = set(subprocess.check_output(
        ["git", "ls-tree", "-r", "--name-only", record["checked_main"]], cwd=ROOT, text=True
    ).splitlines())
    assert all(path not in tree for path in record["main_absent"])
    binding = record["general_page"]
    baseline = (ROOT / binding["baseline"]).read_bytes()
    before = (ROOT / binding["current"]).read_bytes()
    after = (ROOT / binding["successor"]).read_bytes()
    main_blob = subprocess.check_output(
        ["git", "show", record["checked_main"] + ":" + binding["current"]], cwd=ROOT
    )
    assert baseline == main_blob
    assert digest(baseline) == binding["main_sha256"]
    assert digest(before) == binding["current_sha256"]
    assert digest(after) == binding["successor_sha256"]
    actual_patch = "".join(difflib.unified_diff(
        before.decode().splitlines(keepends=True),
        after.decode().splitlines(keepends=True),
        fromfile="a/" + binding["current"], tofile="b/" + binding["current"],
    ))
    assert actual_patch.encode() == (ROOT / binding["delta"]).read_bytes()
    marker = b"function SendKeyRow("
    assert before[before.index(marker):] == after[after.index(marker):]
    composition = json.loads((ROOT / record["composition_record"]).read_text())
    assert composition["composition"]["both_orders_equal"] is True
    assert composition["composition"]["candidate_sha256"] == digest(after)
    for path, expected in composition["protected_product"].items():
        assert record["immutable_files"][path] == expected
    phases = record["proposed_execution"]["phases"]
    assert [phase["name"] for phase in phases] == [
        "reference", "baseline", "integrated", "send_key", "adjacent", "typecheck"
    ]
    assert phases[2]["env"]["FOLLOW_UP_SOURCE"] == binding["current"]
    assert sum(phase["max_seconds"] for phase in phases) <= record["proposed_execution"]["total_seconds"]
    assert phases[1]["expected"]["failed_names"] == [
        "Follow-up is disabled while its own save is pending"
    ]
    assert phases[1]["expected"]["skipped"] == 8
    for phase in phases:
        assert phase["command"][:3] == ["nice", "-n", "19"]
        assert "--max-old-space-size=768" in phase["command"]
        assert phase["env"]["NODE_OPTIONS"] == "--max-old-space-size=768"
    for line in (HERE / "frozen.sha256").read_text().splitlines():
        expected, path = line.split("  ", 1)
        assert digest((HERE / path).read_bytes()) == expected, path
    print(json.dumps({
        "status": "SOURCE_BINDING_PASS", "checked_main": record["checked_main"],
        "immutable_files": len(record["immutable_files"]),
        "main_files": len(record["main_files"]),
        "successor_sha256": digest(after), "delta": "EXACT_RETAINED_PATCH",
        "send_key_tail": "UNCHANGED", "candidate_applied": False,
        "runtime_grant": None, "behavioral_tests": "NOT_RUN",
        "typecheck": "NOT_RUN", "native_parity": "UNVERIFIED",
    }))


if __name__ == "__main__":
    main()
