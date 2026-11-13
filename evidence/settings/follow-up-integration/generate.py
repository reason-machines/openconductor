"""Write the source-only binding from retained files, never from runtime results."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
COMPOSITION = Path("evidence/settings/follow-up-pending/composition")


def sha(path):
    return hashlib.sha256((ROOT / path).read_bytes()).hexdigest()


def main():
    record = json.loads((ROOT / COMPOSITION / "source.json").read_text())
    checked_main = record["checked_main"]
    paths = set(record["protected_product"])
    for packet in ("follow-up-pending", "send-key-save-feedback", "graphite-loading-hint",
                   "auto-run-availability", "user-env-file-editor"):
        paths.update(str(path.relative_to(ROOT)) for path in
                     (ROOT / "evidence/settings" / packet).rglob("*")
                     if path.is_file() and "__pycache__" not in path.parts)
    paths.update(("package.json", "package-lock.json", "tsconfig.json",
                  "tools/settings/validate-graphite-row.py"))
    for directory, names in {
        "src/settings": ("prefs.ts", "types.ts", "composerSettings.ts", "composerSettings.test.ts",
                         "notificationDenialFeedback.test.ts", "fullDiskAccess.test.ts", "notificationPermission.ts"),
        "src/keybindings": ("overrides.ts", "registry.ts", "types.ts", "shortcut.ts"),
    }.items():
        paths.update(directory + "/" + name for name in names)
    immutable = {path: sha(path) for path in sorted(paths)}
    tree = set(subprocess.check_output(
        ["git", "ls-tree", "-r", "--name-only", checked_main], cwd=ROOT, text=True
    ).splitlines())
    source_paths = [path for path in sorted(paths) if not path.startswith("evidence/")]
    main_files = {path: hashlib.sha256(subprocess.check_output(
        ["git", "show", checked_main + ":" + path], cwd=ROOT
    )).hexdigest() for path in source_paths if path in tree}
    node = ["nice", "-n", "19", "node", "--max-old-space-size=768", "--test",
            "--test-concurrency=1", "--test-reporter=tap"]
    strip = node[:5] + ["--experimental-strip-types"] + node[5:]
    env = {"NODE_OPTIONS": "--max-old-space-size=768", "NO_COLOR": "1"}

    def expected(count):
        return {"exit": 0, "tests": count, "fail": 0, "cancelled": 0, "skipped": 0, "todo": 0}

    def phase(name, command, seconds, result, overrides=None):
        return {"name": name, "max_seconds": seconds, "command": command,
                "env": env | (overrides or {}), "expected": result}

    phases = [
        phase("reference", node + [str(COMPOSITION / "reference.test.cjs")], 45, expected(6)),
        phase("baseline", node + ["--test-name-pattern=^Follow-up is disabled while its own save is pending$",
                                  str(COMPOSITION / "product.test.cjs")], 30,
              {"exit": 1, "tests": 9, "pass": 0, "fail": 1, "cancelled": 0, "skipped": 8, "todo": 0,
               "failed_names": ["Follow-up is disabled while its own save is pending"], "failure_code": "ERR_ASSERTION"},
              {"FOLLOW_UP_SOURCE": "evidence/settings/follow-up-pending/baseline/GeneralPage.tsx.txt"}),
        phase("integrated", node + [str(COMPOSITION / "product.test.cjs")], 45, expected(9),
              {"FOLLOW_UP_SOURCE": "src/settings/GeneralPage.tsx"}),
        phase("send_key", strip + ["src/settings/sendKeySaveFeedback.test.ts"], 45, expected(8)),
        phase("adjacent", strip + ["src/settings/composerSettings.test.ts",
                                   "src/settings/notificationDenialFeedback.test.ts",
                                   "src/settings/fullDiskAccess.test.ts"], 75, expected("positive_count_required")),
        phase("typecheck", node[:5] + ["node_modules/typescript/bin/tsc", "--noEmit"], 90, {"exit": 0}),
    ]
    lock = json.loads((ROOT / "package-lock.json").read_text())
    body = {
        "owner": "Conductor Rebuild / SAME49", "status": "SOURCE_ELIGIBILITY_ONLY",
        "runtime_grant": None, "candidate_applied": False,
        "request_message": "3a38e659-d8e8-4d44-80ed-a1b6f865a6ff",
        "existing_position": "SAME49; existing ACC order COPY26 -> 13519 -> 15 -> 64LAST unchanged",
        "checked_main": checked_main,
        "main_resolution": "GitHub repos_compare_commits(base=09b1c998,head=main) resolved identical in this pass; local origin/main matched. Re-resolve live main before future application.",
        "protected_checkpoint": "5d4e0c16ea20ccdd1680611ec08eb4b49a4fd542",
        "existing_contract": {"path": str(COMPOSITION / "README.md"), "sha256": sha(COMPOSITION / "README.md")},
        "composition_record": str(COMPOSITION / "source.json"),
        "ledger_disposition": "2e068345-1d23-4150-bf23-966889c45ed9",
        "general_page": {
            "baseline": "evidence/settings/follow-up-pending/baseline/GeneralPage.tsx.txt",
            "current": "src/settings/GeneralPage.tsx",
            "successor": str(COMPOSITION / "candidate/GeneralPage.tsx.txt"),
            "delta": str(COMPOSITION / "candidate.patch"),
            "main_sha256": record["composition"]["base_sha256"],
            "current_sha256": record["composition"]["send_key_sha256"],
            "successor_sha256": record["composition"]["candidate_sha256"],
            "scope": "Only GeneralPage local pending state, Follow-up Select disabled prop and existing save callback settlement. SendKeyRow tail unchanged.",
        },
        "immutable_files": immutable, "main_files": main_files,
        "main_absent": [path for path in source_paths if path not in tree],
        "dependency_prerequisite": {
            "location": "this checkout/node_modules only; no fallback to coordinator or another checkout",
            "disposition": "Coordinator restoration passed historically. This supplement makes no claim about local availability and authorizes no installation or cache write.",
            "lock_sha256": sha("package-lock.json"),
            "required_locked_versions": {name: lock["packages"]["node_modules/" + name]["version"]
                                         for name in ("react", "react-test-renderer", "typescript")},
            "node_requirement": "Node with --experimental-strip-types support; not invoked during source qualification",
        },
        "proposed_execution": {
            "admission": "NOT_GRANTED; exact successor application and execution require sole ACC matched bound at existing position",
            "total_seconds": 360, "termination_grace_seconds": 5,
            "processes_at_once": 1, "heap_mib": 768, "nice": 19,
            "unset_env_before_each_phase": ["FOLLOW_UP_SOURCE", "SEND_KEY_ROW_BASELINE", "GRAPHITE_ROW_BASELINE", "AUTO_RUN_ROW_SOURCE_ROOT"],
            "phase_timeout_rule": "Minimum of phase max_seconds and remaining total time. Terminate entire process group after timeout. No retry.",
            "application_between": "baseline and integrated; only retained delta under a future matched application allowance; verify full successor hash first",
            "frozen_manifest_rule": "Do not replace old whole-file hashes with successor hashes. Explicitly allow only general_page.current old-to-successor transition; every other immutable file and every old manifest stays byte-identical.",
            "phases": phases,
        },
        "behavioral_tests": "NOT_RUN", "typecheck": "NOT_RUN", "native_parity": "UNVERIFIED",
        "reference_limit": "Historical retained Conductor 0.87.6 shipped bytes only. No new native, app or browser observation.",
    }
    (HERE / "binding.json").write_text(json.dumps(body, indent=2) + "\n")
    (HERE / "frozen.sha256").write_text("".join(
        sha(HERE.relative_to(ROOT) / name) + "  " + name + "\n"
        for name in ("README.md", "binding.json", "qualify.py", "generate.py")
    ))
    print(json.dumps({"artifact_written": "binding.json", "immutable_files": len(immutable),
                      "main_files": len(main_files), "phases": len(phases), "runtime": "NOT_RUN"}))


if __name__ == "__main__":
    main()
