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
OUT = Path(__file__).resolve().parent / "remaining"
OUT.mkdir(exist_ok=True)
started = time.monotonic()
receipt = {"admission": "ACC_READ12_2CFF_ADJ_TSC_20261113T0321", "started_at": datetime.now(timezone.utc).isoformat(), "phases": [], "result": "IN_PROGRESS", "prior_receipt_preserved": True}
owned = []
setup_started = False

def now():
    return datetime.now(timezone.utc).isoformat()

def save():
    (OUT / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")

def run(name, argv, heap):
    assert time.monotonic() - started < 1020
    entry = {"name": name, "argv": argv, "NODE_OPTIONS": f"--max-old-space-size={heap}", "started_at": now()}
    env = {**os.environ, "NODE_OPTIONS": entry["NODE_OPTIONS"]}
    with (OUT / f"{name}.stdout.txt").open("wb") as stdout, (OUT / f"{name}.stderr.txt").open("wb") as stderr:
        process = subprocess.Popen(argv, cwd=ROOT, env=env, stdout=stdout, stderr=stderr, start_new_session=True)
        owned.append(process.pid)
        entry["process_group"] = process.pid
        entry["exit_status"] = process.wait()
    entry["finished_at"] = now()
    receipt["phases"].append(entry)
    save()
    print(json.dumps(entry), flush=True)
    assert entry["exit_status"] == 0, f"{name} failed; no retry"
    return (OUT / f"{name}.stdout.txt").read_text()

try:
    assert not (ROOT / "node_modules").exists()
    main = subprocess.check_output(["git", "rev-parse", "origin/main"], cwd=ROOT, text=True).strip()
    assert main == "6acd4f8f8b79ef5b79c4a98b15eab68174943487", main
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    assert head.startswith("467e672b"), head
    receipt["main"] = main
    receipt["head"] = head
    entries = subprocess.check_output(["git", "ls-tree", "-rz", "HEAD", "--", "src"], cwd=ROOT).split(b"\0")
    blobs = {}
    for entry in filter(None, entries):
        metadata, path = entry.split(b"\t")
        mode, kind, expected = metadata.split()
        assert kind == b"blob" and mode in [b"100644", b"100755"]
        data = (ROOT / path.decode()).read_bytes()
        actual = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
        assert actual == expected.decode(), path
        blobs[path.decode()] = actual
    assert len(blobs) == 1146
    assert not subprocess.check_output(["git", "ls-files", "--others", "--exclude-standard", "--", "src"], cwd=ROOT)
    receipt["source_blobs"] = blobs
    subprocess.run(["python3", "evidence/chat/read-error-result/verify-source.py", "candidate"], cwd=ROOT, check=True)
    manifest = json.loads((OUT.parent.parent / "source-packet/main-manifest.json").read_text())
    for path in ["package.json", "package-lock.json"]:
        assert hashlib.sha256((ROOT / path).read_bytes()).hexdigest() == manifest["paths"][path]["sha256"]
    receipt["source_check_finished_at"] = now()
    setup_started = True
    run("setup", ["nice", "-n", "19", "timeout", "--signal=TERM", "--kill-after=5s", "600s", "npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund"], 1024)
    receipt["dependencies"] = {name: json.loads((ROOT / "node_modules" / name / "package.json").read_text())["version"] for name in ["react", "react-test-renderer", "typescript"]}
    assert receipt["dependencies"] == {"react": "18.3.1", "react-test-renderer": "18.3.1", "typescript": "5.9.3"}
    adjacent = ["readSyntaxHighlight", "readImageDisclosure", "conductorTools", "toolErrorRetry", "writeRows", "disclosureRemount", "imageGenerationFallbackDisclosure"]
    command = ["nice", "-n", "19", "timeout", "--signal=TERM", "--kill-after=5s", "180s", "node", "--max-old-space-size=768", "--experimental-strip-types", "--test", "--test-concurrency=1", *[f"src/features/chat/{name}.test.ts" for name in adjacent]]
    output = run("adjacent", command, 768)
    counts = {name: int(re.search(rf"^# {name} (\d+)$", output, re.M)[1]) for name in ["tests", "pass", "fail", "cancelled", "skipped", "todo"]}
    receipt["adjacent_counts"] = counts
    assert counts == {"tests": 106, "pass": 106, "fail": 0, "cancelled": 0, "skipped": 0, "todo": 0}, counts
    run("typecheck", ["nice", "-n", "19", "timeout", "--signal=TERM", "--kill-after=5s", "180s", "npm", "run", "typecheck"], 1024)
    assert subprocess.run(["git", "diff", "--exit-code", "--", "src", "package.json", "package-lock.json"], cwd=ROOT).returncode == 0
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
    receipt["terminal"] = "RELEASE"
    receipt["finished_at"] = now()
    receipt["elapsed_seconds"] = time.monotonic() - started
    save()
    print(json.dumps({key: value for key, value in receipt.items() if key != "source_blobs"}), flush=True)
sys.exit(0 if receipt["result"] == "PASS" else 1)
