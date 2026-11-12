"""Verify the explicit V1-to-V2 expectation delta, not runtime behavior."""
import hashlib
import json
from pathlib import Path
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
V1_SHA256 = "97c62299ab7cae93bfe17379e56254c01a977cf5d66b06f93e9e38bd761783e2"
SOURCE = "src/features/diff/filePathChipAlacritty.test.ts"
BASE = "cf602c25"
v1 = (HERE / "filePathChipAlacritty.v1.test.ts.txt").read_bytes()
assert hashlib.sha256(v1).hexdigest() == V1_SHA256
assert v1 == subprocess.check_output(["git", "show", BASE + ":" + SOURCE], cwd=ROOT)
old = '      assert.deepEqual(view.calls, [invocation(saved, "/tmp/open-in-workspace/src/example.ts")]);'
new = '''      const expected = saved === "vscode"
        ? JSON.stringify({ command: "open_in_app", args: {
          appId: saved, path: "/tmp/open-in-workspace/src/example.ts",
          fileContext: { workspacePath: "/tmp/open-in-workspace" },
        } })
        : invocation(saved, "/tmp/open-in-workspace/src/example.ts");
      assert.deepEqual(view.calls, [expected]);'''
text = v1.decode()
assert text.count(old) == 1
v2 = text.replace(old, new).encode()
assert (ROOT / SOURCE).read_bytes() == v2, "V2 exceeds the one expected-payload delta"
for path in [
    "src/features/diff/deletedFinderContext.test.ts",
    "src/features/diff/FileDiffView.tsx",
    "src/features/openIn/apps.ts",
    "src-tauri/src/open_in/deleted_finder_ipc.rs",
    "evidence/open-in/alacritty-diff-primary/source-v1/source-pins.json",
    "evidence/open-in/icon-menu-numbering-caller/manifest.json",
    "evidence/open-in/deleted-finder/source.json",
    "evidence/open-in/alacritty-diff-primary/verify_source.py",
    "evidence/open-in/deleted-finder/verify_candidate.py",
    "evidence/open-in/icon-menu-numbering-caller/verify_source.py",
    "evidence/diff/moved-comment-anchors/source.json",
    "evidence/diff/hidden-whitespace-editing/execution-source-manifest.json",
]:
    assert (ROOT / path).read_bytes() == subprocess.check_output(["git", "show", BASE + ":" + path], cwd=ROOT), path
contract = json.loads((HERE.parent / "preparation/contract-v1.json").read_text())
for name, digest in contract["files"].items():
    assert hashlib.sha256((HERE.parent / "preparation" / name).read_bytes()).hexdigest() == digest
for name, destination in contract["destinations"].items():
    assert (ROOT / destination).read_bytes() == (HERE.parent / "preparation" / name).read_bytes()
print(json.dumps({"result": "PASS exact V1 archive, one V2 expected-payload delta, frozen 10+3 and historical pins", "v1_sha256": V1_SHA256, "v2_sha256": hashlib.sha256(v2).hexdigest(), "behavior": "NOT_RUN", "native": "NOT_RUN"}))
