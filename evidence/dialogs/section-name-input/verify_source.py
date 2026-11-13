"""Verify retained source and this isolated fix as data; never execute target JS."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tarfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--archive", type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parent
repo = root.parents[2]
reference = json.loads((root / "reference.json").read_text())
digest = lambda data: hashlib.sha256(data).hexdigest()
archive_bytes = args.archive.read_bytes()
assert digest(archive_bytes) == reference["archive_sha256"] == "c007a6ac77d57b56cdfe8158817ffbcffee6a8f5e7f4a63e2eaef65cbf21b30d"
with tarfile.open(args.archive, "r:") as archive:
    member = archive.getmember(".rea-work/retained-reference/renderApp-D_fmY7hW.js")
    assert member.isfile()
    renderer = archive.extractfile(member).read()
assert len(renderer) == reference["renderer"]["bytes"] == 11600457
assert digest(renderer) == reference["renderer"]["sha256"] == "5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde"
print("PASS exact original archive and complete renderer identity")
spans = {}
for span in reference["spans"]:
    start, end = span["utf8_half_open"]
    raw = renderer[start:end]
    assert len(raw) == span["bytes"]
    assert digest(raw) == span["sha256"]
    assert raw.decode() == span["text"]
    spans[span["name"]] = raw
    print(f"PASS complete {span['name']} [{start},{end})")
wrapper = spans["Qo-native-input-wrapper"]
field = spans["section-name-input"]
assert field in spans["Aya"]
for prop in (b'autoCorrect:"off"', b'autoCapitalize:"off"'):
    assert prop in field and prop in wrapper
assert b'({className:i,type:o,...r}=t' in wrapper
assert b'p.jsx("input",{' in wrapper
assert b'className:a,ref:e,...r}' in wrapper
print("PASS explicit section attributes and complete native-input forwarding chain (source only)")
baselines = {}
for name, identity in reference["baseline_files"].items():
    raw = subprocess.check_output(["git", "show", reference["implementation_base"] + ":" + name], cwd=repo)
    assert digest(raw) == identity["sha256"]
    assert hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest() == identity["git_blob"]
    baselines[name] = raw
component_name = "src/components/SectionDialog.tsx"
component = baselines[component_name]
anchor = b'            autoComplete="off"\n            spellCheck={false}\n'
replacement = b'            autoComplete="off"\n            autoCorrect="off"\n            autoCapitalize="off"\n            spellCheck={false}\n'
assert component.count(anchor) == 1
assert (repo / component_name).read_bytes() == component.replace(anchor, replacement, 1)
for name, raw in baselines.items():
    if name != component_name:
        assert (repo / name).read_bytes() == raw, name
assert b'node --test "src/**/*.test.ts"' in baselines[".github/workflows/ci.yml"]
print("PASS current-main baseline identities; only two product attributes changed; workflow includes fixture")
fixture = (repo / "src/components/sectionNameInput.test.ts").read_bytes()
assert digest(fixture) == reference["fixture_sha256"] == "006cabec6907c845ca308f3a258e64085fa196b84bc5a8b892e079d5f05701c3"
for name, expected in reference["receipts_sha256"].items():
    assert digest((root / name).read_bytes()) == expected, name
red = (root / "historical-red.tap").read_text()
assert red.count("\nnot ok ") == 2 and "# pass 8\n# fail 2\n" in red
assert (root / "historical-red.exit").read_text().strip() == "1"
assert "# pass 10\n# fail 0\n" in (root / "green.tap").read_text()
assert "# pass 34\n# fail 0\n" in (root / "neighbors.tap").read_text()
print("PASS unchanged accepted fixture and sealed historical RED/new GREEN/neighbor receipts")
print("NOT VERIFIED: native correction/capitalization, raster, side-by-side or runtime behavior")
