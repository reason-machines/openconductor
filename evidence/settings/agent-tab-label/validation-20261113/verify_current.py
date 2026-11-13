"""Source and metadata guards only. Does not execute product or tests."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path.cwd().resolve()
BASE = ROOT / ".rea-work/settings-tab-label64/source-v1"
HERE = Path(__file__).resolve().parent
EXPECTED_MAIN = "ee120e2a0ecfd668efad398bef71f41e6d6e0047"
EXPECTED_TREE = "424996ff88df7948a38a42d405301cc3276bd640"
EXPECTED_BINDING = "58e84ba4d2e661aff40b84fffd160235aad03d10ae43e51df704cc67e0d6b24e"
EXPECTED_ARCHIVE = "1e51cafc003c2fd7ad8abd2da8de964224c54480dedb27f6567ba0653529731a"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def git(*args):
    return subprocess.check_output(["git", *args], text=True).strip()


def require(condition, message):
    if not condition:
        raise SystemExit(message)


parser = argparse.ArgumentParser()
parser.add_argument("--phase", choices=["baseline", "candidate"], required=True)
args = parser.parse_args()
require(sha(BASE / "binding.json") == EXPECTED_BINDING, "Original binding changed")
require(sha(BASE.parent / "source-v1-ready.tar.gz") == EXPECTED_ARCHIVE, "Original packet changed")
binding = json.loads((BASE / "binding.json").read_text())
require(git("branch", "--show-current") == binding["assigned_branch"], "Assigned branch mismatch")
require(git("rev-parse", "origin/main") == EXPECTED_MAIN, "Fresh main requires another explicit rebind")
require(git("rev-parse", "HEAD^{tree}") == EXPECTED_TREE, "Committed whole-tree mismatch")
require(git("rev-parse", "origin/main^{tree}") == EXPECTED_TREE, "Main whole-tree mismatch")
require(not git("diff", "--cached", "--name-only"), "Unexpected staged changes")
changed = sorted(binding["candidate_sources"]) if args.phase == "candidate" else []
require(sorted(git("diff", "--name-only").splitlines()) == changed, "Unexpected tracked changes")
for path, expected in binding["source_pins"].items():
    if args.phase == "candidate" and path in binding["candidate_sources"]:
        expected = binding["candidate_sources"][path]
    require(sha(ROOT / path) == expected, "Source mismatch: " + path)
    original = subprocess.check_output(["git", "show", EXPECTED_MAIN + ":" + path])
    require(hashlib.sha256(original).hexdigest() == binding["source_pins"][path], "Main source pin changed: " + path)
for path, expected in binding["protected"].items():
    require(sha(ROOT / path) == expected, "Protected bytes changed: " + path)
for path, expected in binding["proposal_files"].items():
    require(sha(BASE / path) == expected, "Original proposal changed: " + path)
for name, expected in binding["root_versions"].items():
    path = ROOT / "node_modules" / name / "package.json"
    require(sha(path) == expected["sha256"], "Root metadata mismatch: " + name)
    require(json.loads(path.read_text())["version"] == expected["version"], "Root version mismatch: " + name)
prefix = ROOT / binding["isolated_prefix"]
require(prefix.resolve() == prefix and prefix.is_dir(), "Own exact isolated prefix missing or redirected")
metadata = {p.relative_to(prefix).as_posix(): sha(p) for p in sorted((prefix / "node_modules").rglob("package.json"))}
require(metadata == binding["isolated_package_metadata"], "Retained isolated metadata mismatch")
require(len(metadata) == 44, "Retained metadata count mismatch")
require(json.loads((prefix / "node_modules/jsdom/package.json").read_text())["version"] == "26.1.0", "jsdom version mismatch")
print(json.dumps({
    "author": "Conductor Rebuild",
    "kind": "SOURCE_REBIND_ONLY_NOT_RUNTIME_ADMISSION",
    "status": "SOURCE_GUARDS_PASS",
    "phase": args.phase,
    "main": EXPECTED_MAIN,
    "head": git("rev-parse", "HEAD"),
    "tree": EXPECTED_TREE,
    "original_main": binding["main"],
    "original_packet_sha256": EXPECTED_ARCHIVE,
    "original_binding_sha256": EXPECTED_BINDING,
    "source_pins_unchanged": len(binding["source_pins"]),
    "protected_unchanged": len(binding["protected"]),
    "proposal_files_unchanged": len(binding["proposal_files"]),
    "isolated_metadata_unchanged": len(metadata),
    "fixture_sha256": binding["proposal_files"]["agentTabLabel.dom.test.mjs"],
    "product_patch_sha256": binding["proposal_files"]["product.patch"],
    "publication_wrapper_sha256": binding["proposal_files"]["agentTabLabel.test.ts.txt"],
    "tests_run": False,
    "runtime_admitted": False,
    "product_applied": args.phase == "candidate"
}, indent=2))
