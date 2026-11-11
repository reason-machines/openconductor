"""Check frozen bytes and the single source-qualified renderer insertion, without running it."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parents[3]
here = Path(__file__).resolve().parent
frozen = json.loads((here / "frozen-source.json").read_text())
fixture = root / frozen["frozen_test"]["path"]
assert hashlib.sha256(fixture.read_bytes()).hexdigest() == frozen["frozen_test"]["sha256"]
baseline = (here / "baseline/ToolRows.tsx.txt").read_bytes()
assert hashlib.sha256(baseline).hexdigest() == frozen["baseline_toolrows_sha256"]
receipt = json.loads((here / "reference/qualification-receipt.json").read_text())
for name in ["AI", "F0o", "hpo"]:
    span = receipt["spans"][name]
    data = (here / "reference" / span["file"]).read_bytes()
    assert hashlib.sha256(data).hexdigest() == span["sha256"], name
    assert data.decode() == span["text"], name
anchor = 'function ErrorRow({ text }: { text: string }) {\n  const [open, setOpen] = useState(false);\n'
insertion = '''  if (text.includes("File has not been read yet. Read it first before writing to it.")) {
    return (
      <div className="oc-tool-aside" style={{ paddingLeft: 20, paddingTop: 8, borderRadius: 8 }}>
        Claude Code has to retry the file edit because of a bug in its permissions logic. Just a moment!
      </div>
    );
  }
'''
assert baseline.decode().count(anchor) == 1
expected = baseline.decode().replace(anchor, anchor + insertion, 1)
assert (root / "src/features/chat/ToolRows.tsx").read_text() == expected
red = json.loads((here / "hosted-red.json").read_text())
assert red["qualified"] and red["fixture_tests"] == 16
assert red["intended_failures"] == 6 and red["passing_controls"] == 10
assert red["fixture_sha256"] == frozen["frozen_test"]["sha256"]
print("PASS: frozen fixture/baseline, three REA spans, exact post-hook-only insertion, and qualified hosted RED")
