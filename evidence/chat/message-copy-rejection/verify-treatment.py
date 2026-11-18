#!/usr/bin/env python3
"""Static source/receipt custody only; never executes JavaScript."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument("--parent", type=Path, required=True)
args = parser.parse_args()
here = Path(__file__).resolve().parent
root = here.parents[2]
manifest = json.loads((here / "source-manifest.json").read_text())
checks = []

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def check(condition, label):
    if not condition:
        raise AssertionError(label)
    checks.append(label)

parent = args.parent.read_bytes()
check(len(parent) == manifest["parent"]["bytes"], "complete retained parent byte length")
check(sha(parent) == manifest["parent"]["sha256"], "complete retained parent SHA-256")
for entry in manifest["spans"]:
    raw = json.loads((here / entry["file"]).read_text())["raw_utf8"].encode()
    check(len(raw) == entry["bytes"] == entry["end"] - entry["start"], entry["symbol"] + " exact span width")
    check(sha(raw) == entry["sha256"], entry["symbol"] + " decoded span digest")
    check(parent[entry["start"]:entry["end"]] == raw, entry["symbol"] + " lossless parent range")

main = "3e54efdd71f44ab888ebd18d8fe37870e806a4ba"
product = "src/features/chat/Transcript.tsx"
code_fixture = "src/features/chat/copyCodeFeedback.test.ts"
for entry in manifest["baseline"]["files"]:
    path = entry["path"]
    raw = (here / entry["snapshot"]).read_bytes()
    check(len(raw) == entry["bytes"] and sha(raw) == entry["sha256"], path + " historical baseline digest")
    check(raw == subprocess.check_output(["git", "show", manifest["baseline"]["commit"] + ":" + path], cwd=root), path + " historical Git blob identity")
    fresh = subprocess.check_output(["git", "show", main + ":" + path], cwd=root)
    if path == code_fixture:
        check(sha(fresh) == "720e650d15b131230353f0673cb307fe1a935e0d8ece4415379ef8df96de91c2", "independent #1473 five-case fixture on main")
    else:
        check(fresh == raw, path + " fresh-main RED baseline identity")
    if path != product:
        check((root / path).read_bytes() == fresh, path + " current delivery preserves fresh main")

fixture = manifest["fixture"]
check(sha((root / fixture["path"]).read_bytes()) == fixture["sha256"], "identical frozen component fixture")
check(sha((root / product).read_bytes()) == "4ba9fe4df5a852934890e19ac7de61f14fe8cdcbcf3652e60bbd18e925b271b4", "executed treatment product identity")
red = (here / "runtime/red.log").read_text()
green = (here / "runtime/green.log").read_text()
check(re.findall(r"^not ok (\d+) -", red, re.M) == ["1", "2", "4", "5", "6", "8"], "RED exact six semantic failure cases")
check(re.findall(r"^ok (\d+) -", red, re.M) == ["3", "7"], "RED both ordinary-success controls pass")
check("# fail 6\n" in red and "# pass 2\n" in red, "RED count receipt")
check(re.findall(r"^ok (\d+) -", green, re.M) == [str(i) for i in range(1, 9)], "GREEN all eight frozen cases pass")
check("# fail 0\n" in green and "# pass 8\n" in green, "GREEN count receipt")
for name, code in [("red", 1), ("green", 0)]:
    check(f"{name.upper()} exit={code} " in (here / f"runtime/{name}-meta.txt").read_text(), name + " actual exit receipt")
    for label in ["cancelled", "skipped", "todo"]:
        check(f"# {label} 0\n" in (red if name == "red" else green), name + " no " + label)
release = json.loads((here / "runtime/release.json").read_text())
check(release["fixture_sha256"] == fixture["sha256"], "release frozen fixture identity")
check(release["lock_sha256"] == sha((root / "package-lock.json").read_bytes()), "release lock identity")
check(release["product_sha256"] == sha((root / product).read_bytes()), "release product identity")
check(release["node_npm_processes"] == [], "release no own Node/npm process")
check(release["dependencies_removed"] and release["cache_temp_removed"], "release cleanup receipt")
print(json.dumps({"kind": "STATIC_ONLY_NOT_JS_EXECUTION", "candidate": manifest["candidate"], "fresh_main": main, "checks_passed": len(checks), "checks": checks}, indent=2))
