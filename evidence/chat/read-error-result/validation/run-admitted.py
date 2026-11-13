from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[4]
OUT = Path(__file__).resolve().parent
EVIDENCE = OUT.parent
MAIN = "6acd4f8f8b79ef5b79c4a98b15eab68174943487"
GRANT = "ACC_READ12_2CFF_20261113T0315"
started = time.monotonic()
receipt = {"admission": GRANT, "main": MAIN, "phases": [], "started_at": datetime.now(timezone.utc).isoformat(), "result": "IN_PROGRESS"}
owned = []
setup_started = False

def now():
    return datetime.now(timezone.utc).isoformat()

def save():
    (OUT / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")

def hashes():
    manifest = json.loads((EVIDENCE / "source-packet/main-manifest.json").read_text())
    paths = list(manifest["paths"]) + ["src/features/chat/readErrorResult.test.ts", "src/features/chat/readErrorResult.inputs.json"]
    return {path: hashlib.sha256((ROOT / path).read_bytes()).hexdigest() for path in paths}

def run(name, argv, heap=None):
    assert time.monotonic() - started < 1530, "Inclusive allocation exhausted"
    entry = {"name": name, "argv": argv, "NODE_OPTIONS": f"--max-old-space-size={heap}" if heap else None, "started_at": now()}
    env = os.environ.copy()
    if heap:
        env["NODE_OPTIONS"] = f"--max-old-space-size={heap}"
    with (OUT / f"{name}.stdout.txt").open("wb") as stdout, (OUT / f"{name}.stderr.txt").open("wb") as stderr:
        process = subprocess.Popen(argv, cwd=ROOT, env=env, stdout=stdout, stderr=stderr, start_new_session=True)
        owned.append(process.pid)
        entry["process_group"] = process.pid
        entry["exit_status"] = process.wait()
    entry["finished_at"] = now()
    receipt["phases"].append(entry)
    save()
    print(json.dumps(entry), flush=True)
    return entry, (OUT / f"{name}.stdout.txt").read_text()

def passed(name, argv, heap=None):
    entry, output = run(name, argv, heap)
    assert entry["exit_status"] == 0, f"{name} failed; no retry"
    return output

def counts(output):
    result = {}
    for name in ["tests", "pass", "fail", "cancelled", "skipped", "todo"]:
        match = re.search(rf"^# {name} (\d+)$", output, re.M)
        assert match, f"Missing TAP {name}"
        result[name] = int(match[1])
    return result

def test_argv(paths):
    return ["nice", "-n", "19", "timeout", "--signal=TERM", "--kill-after=5s", "180s", "node", "--max-old-space-size=768", "--experimental-strip-types", "--test", "--test-concurrency=1", *paths]

try:
    assert not (ROOT / "node_modules").exists(), "Setup authorized only for absent own node_modules"
    assert subprocess.check_output(["git", "rev-parse", "origin/main"], cwd=ROOT, text=True).strip() == MAIN
    assert subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip().startswith("541dbb6a")
    receipt["baseline_hashes"] = hashes()
    passed("source-baseline", ["timeout", "--signal=TERM", "--kill-after=5s", "60s", "python3", "evidence/chat/read-error-result/verify-source.py", "baseline"])
    setup_started = True
    passed("setup", ["nice", "-n", "19", "timeout", "--signal=TERM", "--kill-after=5s", "600s", "npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund"], 1024)
    versions = {name: json.loads((ROOT / "node_modules" / name / "package.json").read_text())["version"] for name in ["react", "react-test-renderer", "typescript"]}
    receipt["dependencies"] = versions
    assert versions == {"react": "18.3.1", "react-test-renderer": "18.3.1", "typescript": "5.9.3"}, versions
    assert receipt["baseline_hashes"] == hashes(), "Setup changed admitted source bytes"
    command = test_argv(["src/features/chat/readErrorResult.test.ts"])
    red, output = run("red", command, 768)
    red_counts = counts(output)
    receipt["red_counts"] = red_counts
    assert red["exit_status"] == 1 and red_counts == {"tests": 12, "pass": 7, "fail": 5, "cancelled": 0, "skipped": 0, "todo": 0}, "Unqualified RED"
    failures = re.findall(r"^not ok \d+ - Read error result: ([^\n]+)$", output, re.M)
    expected = {"failed-permission", "failed-numbered", "failed-literal", "failed-reminder", "failed-image"}
    assert set(failures) == expected and len(failures) == 5, failures
    assert output.count("code: 'ERR_ASSERTION'") == 5
    assert set(re.findall(r"READ_ERROR_LABEL_([a-z-]+)", output)) == expected
    receipt["qualified_red"] = True
    receipt["supplementary_baseline_controls_reached"] = False
    save()
    patches = ["evidence/chat/read-error-result/source-packet/read-only-result-selection-UNAPPLIED.patch", "evidence/chat/read-error-result/source-packet/historical-assertions-successor-UNAPPLIED.patch"]
    passed("patch-check", ["git", "apply", "--check", *patches])
    passed("apply-exact-patches", ["git", "apply", *patches])
    passed("source-candidate", ["python3", "evidence/chat/read-error-result/verify-source.py", "candidate"])
    output = passed("green", command, 768)
    receipt["green_counts"] = counts(output)
    assert receipt["green_counts"] == {"tests": 12, "pass": 12, "fail": 0, "cancelled": 0, "skipped": 0, "todo": 0}
    adjacent = ["readSyntaxHighlight", "readImageDisclosure", "conductorTools", "toolErrorRetry", "writeRows", "disclosureRemount", "imageGenerationFallbackDisclosure"]
    output = passed("adjacent", test_argv([f"src/features/chat/{name}.test.ts" for name in adjacent]), 768)
    receipt["adjacent_counts"] = counts(output)
    assert receipt["adjacent_counts"]["tests"] > 0 and all(receipt["adjacent_counts"][key] == 0 for key in ["fail", "cancelled", "skipped", "todo"])
    passed("typecheck", ["nice", "-n", "19", "timeout", "--signal=TERM", "--kill-after=5s", "180s", "npm", "run", "typecheck"], 1024)
    passed("diff-check", ["git", "diff", "--check"])
    receipt["candidate_hashes"] = hashes()
    receipt["result"] = "PASS"
except BaseException as error:
    receipt["result"] = "STOPPED"
    receipt["error"] = f"{type(error).__name__}: {error}"
    print(receipt["error"], flush=True)
finally:
    remaining = []
    for group in owned:
        try:
            os.killpg(group, 0)
        except ProcessLookupError:
            continue
        remaining.append(group)
        os.killpg(group, signal.SIGTERM)
    receipt["groups_remaining_before_cleanup"] = remaining
    if remaining:
        time.sleep(1)
        for group in remaining:
            try:
                os.killpg(group, signal.SIGKILL)
            except ProcessLookupError:
                pass
    if setup_started and (ROOT / "node_modules").exists():
        shutil.rmtree(ROOT / "node_modules")
    receipt["own_node_modules_removed"] = not (ROOT / "node_modules").exists()
    receipt["groups_absent_after_cleanup"] = []
    for group in owned:
        try:
            os.killpg(group, 0)
        except ProcessLookupError:
            receipt["groups_absent_after_cleanup"].append(group)
        else:
            receipt["result"] = "STOPPED"
            receipt["error"] = "Owned process group survived cleanup"
    receipt["finished_at"] = now()
    receipt["elapsed_seconds"] = time.monotonic() - started
    receipt["terminal"] = "RELEASE"
    save()
    print(json.dumps(receipt), flush=True)
sys.exit(0 if receipt["result"] == "PASS" else 1)
