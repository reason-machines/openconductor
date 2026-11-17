from pathlib import Path
import hashlib
import json
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = Path(__file__).resolve().parent
mode = sys.argv[1] if len(sys.argv) == 2 else "baseline"
assert mode in {"baseline", "candidate"}
binding = json.loads((EVIDENCE / "source-binding.json").read_text())
manifest = json.loads((EVIDENCE / "source-packet/main-manifest.json").read_text())
successor = json.loads((EVIDENCE / "source-packet/successor-manifest.json").read_text())


def digest(data):
    return hashlib.sha256(data).hexdigest()


def pinned(path):
    return subprocess.check_output(["git", "show", binding["checked_main"] + ":" + path], cwd=ROOT)


changed = {
    "src/features/chat/ToolRows.tsx",
    "src/features/chat/readSyntaxHighlight.test.ts",
    "src/features/chat/readImageDisclosure.inputs.json",
    "src/features/chat/readImageDisclosure.test.ts",
}
for path, metadata in manifest["paths"].items():
    baseline = pinned(path)
    assert digest(baseline) == metadata["sha256"] and len(baseline) == metadata["bytes"], path
    expected = successor["successor"][path] if mode == "candidate" and path in changed else metadata
    actual = (ROOT / path).read_bytes()
    assert digest(actual) == expected["sha256"] and len(actual) == expected["bytes"], path

for path in (EVIDENCE / "archive").iterdir():
    assert path.read_bytes() == pinned("src/features/chat/" + path.name), path.name
for name in ("readErrorResult.test.ts", "readErrorResult.inputs.json"):
    path = "src/features/chat/" + name
    data = (ROOT / path).read_bytes()
    expected = successor["successor"][path]
    assert digest(data) == expected["sha256"] and len(data) == expected["bytes"], path

original = json.loads((EVIDENCE / "archive/readImageDisclosure.inputs.json").read_text())
current = json.loads((ROOT / "src/features/chat/readImageDisclosure.inputs.json").read_text())
assert len(original["cases"]) == len(current["cases"]) == 28
assert sum(a == b for a, b in zip(original["cases"], current["cases"])) == (27 if mode == "candidate" else 28)
if mode == "candidate":
    expected = json.loads(json.dumps(original))
    next(case for case in expected["cases"] if case["id"] == "failed-text")["expected"] = {
        "expandable": True, "lines": [{"number": "7", "text": "Cannot read text"}], "errorRows": 0,
    }
    assert current == expected
    old_hash = digest((EVIDENCE / "archive/readImageDisclosure.inputs.json").read_bytes())
    new_hash = digest((ROOT / "src/features/chat/readImageDisclosure.inputs.json").read_bytes())
    assert (ROOT / "src/features/chat/readImageDisclosure.test.ts").read_text().replace(new_hash, old_hash) == (EVIDENCE / "archive/readImageDisclosure.test.ts").read_text()
    before = pinned("src/features/chat/ToolRows.tsx").decode()
    expected = before.replace(
        '      const text = output === undefined ? undefined : readContent(output);',
        '      const readResult = name === "Read" ? result : output;\n      const text = readResult === undefined ? undefined : readContent(readResult);',
    ).replace('readLabel(path, output)', 'readLabel(path, readResult)')
    assert (ROOT / "src/features/chat/ToolRows.tsx").read_text() == expected

reference = json.loads((EVIDENCE / "reference/source-receipt.json").read_text())
for name, span in reference["reference_spans"].items():
    assert digest((EVIDENCE / "reference" / (name + ".txt")).read_bytes()) == span["sha256"], name
for name, expected in successor["patches"].items():
    data = (EVIDENCE / "source-packet" / name).read_bytes()
    assert digest(data) == expected["sha256"] and len(data) == expected["bytes"], name
assert len(json.loads((ROOT / "src/features/chat/readErrorResult.inputs.json").read_text())["cases"]) == 12
print(f"PASS {mode}: 18 pinned sources, originals, exact successor bytes, 28 image controls, 14 retained REA spans")
print("Source checks only. No JavaScript, native app, provider, package or installed behavior executed.")
