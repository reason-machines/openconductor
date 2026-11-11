"""Revalidate retained app bytes and current-main editor declarations without executing them."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tarfile

parser = argparse.ArgumentParser()
parser.add_argument("archive", type=Path)
parser.add_argument("--main-ref", default="3a3199233be3f2ec17e40b7a888561d08f95e7ec")
args = parser.parse_args()
root = Path(__file__).resolve().parent
sha256 = lambda value: hashlib.sha256(value).hexdigest()
archive = args.archive.read_bytes()
assert sha256(archive) == "f3ef2620ab60b431a02b3b92c78b7d349fb311af77d532d6012c8d9ed3986084"
with tarfile.open(args.archive) as handle:
    matches = [member for member in handle.getmembers() if member.isfile() and member.name.endswith("renderApp-D_fmY7hW.js")]
    assert len(matches) == 1
    renderer = handle.extractfile(matches[0]).read()
assert sha256(renderer) == "5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde"
expected = {
    "YWt": (10252774, 1652, "e9c696637b6b19c5adf28ba025a7a8c026476840976293b67635917a95eda869"),
    "n$i": (10248914, 1647, "9ce4d9ed2540c2120b38bbce3b03730e84c132f8ef64097843ee39a06a9f2035"),
    "Zla": (10250685, 2064, "6538f2eac6a963a669d3a2d9f6c949c8728d2c7ce3405472a9c8f87ed05abf20"),
}
spans = []
for name, (start, length, digest) in expected.items():
    filename = {"YWt": "YWt.literal.txt", "n$i": "input.literal.txt", "Zla": "masked-row.literal.txt"}[name]
    literal = (root / filename).read_bytes()
    assert len(literal) == length
    assert sha256(literal) == digest
    assert renderer[start:start + length] == literal
    spans.append({"name": name, "utf8_half_open": [start, start + length], "bytes": length, "sha256": digest, "matched_original": True})
reference_editor = (root / "YWt.literal.txt").read_text()
reference_input = (root / "input.literal.txt").read_text()
assert 'r!==void 0&&p.jsxs("button"' in reference_editor
assert 'v&&p.jsx(tt,{type:"button",size:"sm",variant:"ghost",disabled:d,onClick:()=>u(!1),children:"Cancel"})' in reference_editor
assert 'F.preventDefault();const H=h.trim();!H||u||i(H)' in reference_input
assert 'onSubmit:x' in reference_input
main = subprocess.check_output(["git", "rev-parse", args.main_ref], text=True).strip()
source = subprocess.check_output(["git", "show", main + ":src/settings/agents/kit.tsx"])
assert source == (root / "baseline-kit.tsx.txt").read_bytes(), "Current-main kit changed; re-read before qualification"
text = source.decode()
editor = text.split("export function SecretRow(", 1)[1].split("function SecretInput(", 1)[0]
input_leaf = text.split("function SecretInput(", 1)[1].split("export function OptionRow(", 1)[0]
assert 'if (!configured || editing)' in editor
assert '{getKeyUrl && !configured && (' in editor
assert 'onCancel={configured ? () => setEditing(false) : undefined}' in editor
assert 'await onSave(v);' in editor
assert 'e.preventDefault();' in input_leaf
assert 'const v = value.trim();' in input_leaf
assert 'if (v && !pending) onSubmit(v);' in input_leaf
for leaf in [reference_editor, reference_input, editor, input_leaf]:
    assert not re.search(r"onKeyDown|onKeyUp|onBlur", leaf), "Keyboard/blur declaration changed; re-read scope"
receipt = {
    "kind": "retained-source-editor-comparison-not-behavior",
    "author": "Conductor Rebuild",
    "checked_main": main,
    "source": {"path": "src/settings/agents/kit.tsx", "sha256": sha256(source)},
    "original_archive_sha256": sha256(archive),
    "renderer_sha256": sha256(renderer),
    "retained_REA_lineage": "ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2",
    "retained_REA_limit": "Earlier semantic renderer analysis exhausted heap; exact shipped-byte slices used, no reference JavaScript executed.",
    "spans": spans,
    "cancel_commit_disposition": "No distinct defect in bounded leaf declarations. Explicit Cancel closes the editor without writing, form submit trims and guards empty/pending input. Escape/blur app-wide semantics remain insufficiently evidenced.",
    "candidate_gap_key": "settings-secret-editor-get-key-64",
    "candidate_source_mismatch": "Reference YWt keeps Get key whenever its URL exists, including editing an existing key. Current SecretRow adds !configured inside the editor branch, hiding the provider link in that state.",
    "dedupe": "Ledger ddfc6518 reserved only the SecretRow editor getKeyUrl condition and new dedicated regression/evidence for SAME64; no competing hunk found in its partial search.",
    "qualification_stage": "Source-before-test-first-publication",
    "runtime": "NOT_RUN",
    "behavioral_RED_GREEN": "NOT_RUN",
    "provider_credentials_native_IPC_browser": "NOT_RUN",
    "new_native_acquisition": False,
    "tracked_product_or_fixture_edits": False,
    "limits": "Static identity and declarations only. Global keyboard handlers, actual browser opening, persistence, native rendering and provider authentication were not exercised. No same-input runtime result or final parity acceptance is claimed.",
}
(root / "source-comparison-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps(receipt, indent=2))
