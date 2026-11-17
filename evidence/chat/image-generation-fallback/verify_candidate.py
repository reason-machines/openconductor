"""Source-only scope and frozen-input verification; executes no JavaScript."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = ROOT / "evidence/chat/image-generation-fallback"
TEST = "src/features/chat/imageGenerationFallbackDisclosure.test.ts"
TOOL_ROWS = "src/features/chat/ToolRows.tsx"
BASE = "649f47b9d80eb1d7510c2b405b25e026ffddf78b"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT)


freeze = json.loads((EVIDENCE / "freeze.json").read_text())
repair = json.loads((EVIDENCE / "typecheck-repair.json").read_text())
for path, identity in freeze["files"].items():
    expected = repair["repaired_test_sha256"] if path == TEST else identity["sha256"]
    assert digest((ROOT / path).read_bytes()) == expected, f"Frozen bytes changed: {path}"
assert git("hash-object", TEST).decode().strip() == repair["repaired_test_blob"]
for path, identity in freeze["production_unchanged"].items():
    historical = git("show", f"{freeze['main']}:{path}")
    assert digest(historical) == identity["sha256"], f"Original source pin changed: {path}"
    if path != TOOL_ROWS:
        current_main = git("show", f"{BASE}:{path}")
        assert (ROOT / path).read_bytes() == current_main, f"Excluded production differs from merged main: {path}"

baseline = git("show", f"{BASE}:{TOOL_ROWS}")
assert git("rev-parse", f"{BASE}:{TOOL_ROWS}").decode().strip().startswith("f4cdf841")
expected = baseline.decode()
changes = [
    ('  content?: ReactNode;\n', '  content?: ReactNode;\n  isCollapsible?: boolean;\n'),
    ('align = "baseline", content, bareContent = false', 'align = "baseline", content, isCollapsible = true, bareContent = false'),
    ('  const opens = content !== undefined && content !== null && content !== false;\n  const collapsed = !opens || !open;', '  const hasContent = content !== undefined && content !== null && content !== false;\n  const opens = hasContent && isCollapsible;\n  const collapsed = !hasContent || !open;'),
    ('{opens && open ? <div className={bareContent', '{hasContent && open ? <div className={bareContent'),
    ('      const path = result === undefined ? "" : resultText(result).trim();\n', '      const path = result === undefined ? "" : resultText(result).trim();\n      const imageExtensions = { png: true, jpg: true, jpeg: true, gif: true, webp: true, tif: true, tiff: true, avif: true, bmp: true };\n      const extension = path.split(".").pop()?.toLowerCase();\n      const isCollapsible = extension !== undefined && Object.prototype.hasOwnProperty.call(imageExtensions, extension);\n'),
    ('left={<span>{result === undefined ? "Generating image" : "Generated image"}</span>}\n          keepRight', 'left={<span>{result === undefined ? "Generating image" : "Generated image"}</span>}\n          isCollapsible={isCollapsible}\n          keepRight'),
]
for old, new in changes:
    assert expected.count(old) == 1, "Candidate boundary is no longer unique"
    expected = expected.replace(old, new)
assert (ROOT / TOOL_ROWS).read_text() == expected, "Product change exceeds the exact shell/image correction"

red = json.loads((EVIDENCE / "hosted-red.json").read_text())
assert [case["assertion"] for case in red["failed"]] == freeze["required_red"]
assert red["controls_passed"] == freeze["required_controls"]
assert red["suite"] == dict(tests=3237, passed=3235, failed=2, cancelled=0, skipped=0, todo=0)
assert red["test_sha256"] == repair["repaired_test_sha256"]
assert red["test_blob"] == repair["repaired_test_blob"]
log = (EVIDENCE / "hosted-red.log").read_text()
for assertion in freeze["required_red"]:
    assert log.count(assertion) == 1
for case in freeze["required_controls"]:
    assert any(" ok " in line and f"generated-image disclosure: {case}" in line for line in log.splitlines())
assert sum(" not ok " in line for line in log.splitlines()) == 2

changed = git("diff", "--name-only", BASE).decode().splitlines()
assert set(changed) <= {TOOL_ROWS, TEST} | {path for path in changed if path.startswith("evidence/chat/image-generation-fallback/")}
print("PASS: frozen five inputs/test/reference bytes; excluded production; exact shell/image-only correction; hosted RED receipt; bounded diff")
print("Behavioral GREEN, build and native/visual acceptance are not established by this source-only check.")
