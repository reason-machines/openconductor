import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tarfile

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[2]
SOURCE = json.loads((ROOT / "source.json").read_text())


def digest(body):
    return hashlib.sha256(body).hexdigest()


def identity(body, expected):
    assert digest(body) == expected, "Source identity differs"


fixture = SOURCE["fixture"]
identity((REPO / fixture["path"]).read_bytes(), fixture["sha256"])
main_sources = {}
for pin in SOURCE["source_pins"]:
    body = subprocess.check_output([
        "git", "-c", "maintenance.auto=false", "show", SOURCE["baseline_main_commit"] + ":" + pin["path"],
    ], cwd=REPO)
    identity(body, pin["sha256"])
    main_sources[pin["path"]] = body.decode()
    if pin["snapshot"] is not None:
        assert body == (ROOT / pin["snapshot"]).read_bytes()

literals = {}
for span in SOURCE["reference_spans"]:
    body = (ROOT / "reference" / span["path"]).read_bytes()
    identity(body, span["sha256"])
    literals[span["name"]] = body.decode()
checks = [
    'containerRef:B,focusTerminal:F' in literals["ONi"],
    '"data-terminal":!0,onClick:F' in literals["ONi"],
    'g.current?.querySelector("textarea")' in literals["w9e"],
    've instanceof HTMLTextAreaElement&&ve.focus()' in literals["w9e"],
    'focusTerminal:he' in literals["w9e"],
    'p.jsx(ONi,' in literals["Met"],
    'p.jsx(Met,' in literals["jpa"] and 'loginCommandLabel:"claude /login"' in literals["jpa"],
    'data-terminal ref={mount}' in (ROOT / "baseline/parts.tsx.txt").read_text(),
    '.ag-term-body { height: 288px; padding: 12px;' in main_sources['src/settings/agents/agents.css'],
]
assert all(checks), "Reference or current-main source join differs"
xterm = SOURCE["xterm"]
xterm_text = {}
for span in xterm["spans"]:
    body = (ROOT / "reference" / span["path"]).read_bytes()
    identity(body, span["sha256"])
    xterm_text[span["path"]] = body.decode()
assert 'parent.appendChild(this.element)' in xterm_text['xterm-child-element.txt']
assert 'const el = this.element!;' in xterm_text['xterm-mouse-target.txt']
assert "addDisposableListener(el, 'mousedown'" in xterm_text['xterm-child-mousedown-focus.txt']
assert 'this.focus();' in xterm_text['xterm-child-mousedown-focus.txt']
if len(sys.argv) > 2:
    import base64
    archive = Path(sys.argv[2]).read_bytes()
    assert 'sha512-' + base64.b64encode(hashlib.sha512(archive).digest()).decode() == xterm['integrity']
    with tarfile.open(sys.argv[2]) as tar:
        body = tar.extractfile(xterm['source_member']).read()
    identity(body, xterm['source_sha256'])
    for span in xterm['spans']:
        start, end = span['utf8_half_open']
        assert body[start:end] == (ROOT / 'reference' / span['path']).read_bytes()
if len(sys.argv) > 1:
    archive = Path(sys.argv[1])
    identity(archive.read_bytes(), SOURCE["source_archive"]["sha256"])
    with tarfile.open(archive) as tar:
        members = [m for m in tar.getmembers() if m.isfile() and Path(m.name).name == SOURCE["asset"]["name"]]
        assert len(members) == 1
        renderer = tar.extractfile(members[0]).read()
    identity(renderer, SOURCE["asset"]["sha256"])
    for span in SOURCE["reference_spans"]:
        start, end = span["utf8_half_open"]
        assert renderer[start:end] == (ROOT / "reference" / span["path"]).read_bytes()
        assert span["utf16_half_open"] == [
            len(renderer[:start].decode().encode("utf-16-le")) // 2,
            len(renderer[:end].decode().encode("utf-16-le")) // 2,
        ]
try:
    identity((REPO / fixture["path"]).read_bytes() + b"changed", fixture["sha256"])
except AssertionError:
    pass
else:
    raise AssertionError("Changed fixture identity was accepted")
print(json.dumps({
    "result": "PASS", "baseline_main": SOURCE["baseline_main_commit"],
    "reference_spans": len(literals), "main_pins": len(SOURCE["source_pins"]),
    "static_joins": len(checks) + 4, "xterm_spans": len(xterm['spans']),
    "fixture_identity": "PASS", "changed_identity_control": "PASS",
    "behavior": "NOT_RUN by this source verifier",
}))
