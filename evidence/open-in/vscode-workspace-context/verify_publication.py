import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[2]

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def main():
    binding = json.loads((ROOT / "fresh-main-binding.json").read_text())
    contract = json.loads((ROOT / "preparation/contract-v1.json").read_text())
    checks = {}
    checks["sealed_contract"] = sha((ROOT / "preparation/contract-v1.json").read_bytes()) == binding["frozen_contract_sha256"]
    for name, checksum in contract["files"].items():
        checks["sealed:" + name] = sha((ROOT / "preparation" / name).read_bytes()) == checksum
    for name, target in contract["destinations"].items():
        checks["installed:" + target] = (REPO / target).read_bytes() == (ROOT / "preparation" / name).read_bytes()
    for path, identity in binding["files"].items():
        source = subprocess.check_output(["git", "show", binding["base_main"] + ":" + path], cwd=REPO)
        blob = subprocess.check_output(["git", "rev-parse", binding["base_main"] + ":" + path], cwd=REPO, text=True).strip()
        checks["baseline:" + path] = source == (ROOT / "baseline" / path).read_bytes() and sha(source) == identity["sha256"] and blob == identity["git_blob"]
    original = json.loads((ROOT / "receipt.json").read_text())
    for path, checksum in original["frozen"].items():
        checks["excluded_frozen:" + path] = sha((REPO / path).read_bytes()) == checksum
    for name, spec in original["spans"].items():
        raw = (ROOT / "reference" / (name + ".txt")).read_bytes()
        checks["rea_span:" + name] = len(raw) == spec["bytes"] and sha(raw) == spec["sha256"]
    subprocess.run(["git", "merge-base", "--is-ancestor", binding["pr1100_merge"], binding["base_main"]], cwd=REPO, check=True)
    checks["main_contains_1100"] = True
    failures = [name for name, ok in checks.items() if not ok]
    print(json.dumps({"checks": checks, "passed": sum(checks.values()), "failed": failures, "behavior": "NOT_RUN"}, indent=2))
    if failures:
        raise SystemExit(1)

if __name__ == "__main__":
    main()
