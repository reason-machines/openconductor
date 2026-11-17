#!/usr/bin/env python3
"""Check retained source and diff integrity, not mounted behavior."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
CONTAINING_MAIN = "27663930d063a4c0d73ee7c79774facb7302d69e"
BEFORE = '    edit: (c, body) => run(store.edit(c.id, body)),\n'
AFTER = '''    edit: (c, body) => run(store.edit(c.id, body).catch((e: unknown) => {
      notify?.("error", `Failed to save comment: ${e instanceof Error ? e.message : String(e)}`);
      throw e;
    })),
'''


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--assets", type=Path)
    args = parser.parse_args()
    frozen = json.loads((HERE / "freeze.json").read_text())
    source = json.loads((HERE / "source.json").read_text())
    checks = []
    for name, expected in frozen["unchanged_inputs"].items():
        baseline = subprocess.check_output(["git", "show", f"{CONTAINING_MAIN}:{name}"], cwd=ROOT)
        assert sha(baseline) == expected, name
        current = (ROOT / name).read_bytes()
        if name == "src/features/diff/ReviewComments.tsx":
            assert baseline.count(BEFORE.encode()) == 1
            assert current == baseline.replace(BEFORE.encode(), AFTER.encode()), name
        else:
            assert current == baseline, name
        checks.append("baseline and candidate: " + name)
    for name, expected in [(frozen["fixture"], frozen["fixture_sha256"]),
                           ("package-lock.json", frozen["package_lock_sha256"])]:
        assert sha((ROOT / name).read_bytes()) == expected, name
        checks.append("frozen: " + name)
    for name in ["src/features/diff/comments.test.ts", "src/features/diff/commentStore.test.ts"]:
        baseline = subprocess.check_output(["git", "show", f"{CONTAINING_MAIN}:{name}"], cwd=ROOT)
        assert (ROOT / name).read_bytes() == baseline, name
        checks.append("unchanged adjacent fixture: " + name)
    assets = {}
    if args.assets:
        for name, expected in source["assets"].items():
            data = (args.assets / name).read_bytes()
            assert len(data) == expected["bytes"] and sha(data) == expected["sha256"], name
            assets[name] = data
            checks.append("whole original asset: " + name)
    for span in source["reference_spans"]:
        data = (HERE / span["path"]).read_bytes()
        assert len(data) == span["end"] - span["start"], span["path"]
        assert sha(data) == span["sha256"], span["path"]
        if args.assets:
            assert assets[span["asset"]][span["start"]:span["end"]] == data, span["path"]
        checks.append("retained span: " + span["path"])
    print(json.dumps({"static_integrity": "PASS", "containing_main": CONTAINING_MAIN,
                      "original_asset_readback": "PASS" if args.assets else "NOT_RUN",
                      "checks": checks, "behavioral_proof": "See red.tap and green.tap"}, indent=2))


if __name__ == "__main__":
    main()
