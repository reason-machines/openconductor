#!/usr/bin/env python3
"""Prepare literal source evidence and an unapplied candidate. No app imports run."""
import difflib
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
RENDERER = ROOT / "artifacts/dialogs-icons-source-6013/renderApp-D_fmY7hW.js"
ASSET_HASH = "5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde"
MAIN = "a66b72e9fc3790a0c93ac614a901da727929c5d9"
COMPONENT = "src/features/chat/ResetChatDialog.tsx"
BASELINE_HASH = "c469a06fa9ba28320ce3a6d48b7c613fb7e42bcd0bedbc35dcac6304fe9e8514"
SPANS = [
    ("dDo", 8909638, 8912447, "a630468ca26d3946ce00e7a5c75b5c4dc103c03e9e4d16c329f277c2a524e311"),
    ("ri", 1946250, 1946886, "096119830cd7b23994d99b625ee93b8d755d563d31a6a7d269365ec6abe51130"),
    ("Kss", 1946886, 1947094, "b26153de791b7d8025ee795a9dce0a4d583dc9443a2f1ac8ae31cd70684fff9a"),
    ("SEe", 1779466, 1779679, "44da8c1796e9064019c1adf851979dca6e85bfe3fae83f5a96ae63b3441c857a"),
    ("GJr", 1779090, 1779466, "2678424aeb695114dad8136c201012d5e03165d49eda8c69ac592d8d5190e5c9"),
    ("KJr", 1779679, 1781979, "09723442b70b3582aaabaf76e0a5da703332a64b19fc164eb10ebe355a4fe929"),
    ("static-flag-and-sprite-registry", 1771732, 1772999, "4268034b165487e12e544d56ade36bde021b9c8d3a4388035d6c3493ac9027c1"),
]
PROTECTED = {
    "src/features/chat/resetChatFocus.test.ts": "ccc158b8e6241953e8018138921d97530ecdc772dd299bf5ad15924fff1e91bb",
    "src/features/chat/resetChatDismissal.test.ts": "eb0285baeed9a5ec52ac40cb703cf2d2099ee3cbce81a173d1518fc645e38ee6",
    "src/features/chat/chat.css": "d392d298dc9e08a6874f64ffadf389682b6b693af743cb13943d70f0c0ac837a",
    "src/components/RunSplitButton.tsx": "80662abb67e8018cfdf06eaedb61dddf1f9dd0e7ae52988063ac5aae2a972588",
    "src/components/pendingWorkspaceRow.css": "3ff46e80e33840f1576133d7c2f96bf353090c210c3536d2494d78648b1f8026",
    "src/styles.css": "39e0d91146ab47ef9cc1962dc4e27afb351466b715992391fd1a5da881e193eb",
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def at_main(path):
    return subprocess.check_output(["git", "show", f"{MAIN}:{path}"], cwd=ROOT)


assert subprocess.check_output(["git", "rev-parse", "origin/main"], cwd=ROOT, text=True).strip() == MAIN
asset = RENDERER.read_bytes()
assert len(asset) == 11600457 and sha(asset) == ASSET_HASH
spans = []
(HERE / "reference").mkdir(exist_ok=True)
for name, start, end, expected in SPANS:
    data = asset[start:end]
    assert sha(data) == expected, name
    target = HERE / "reference" / f"{name}.txt"
    target.write_bytes(data)
    spans.append({"name": name, "utf8_half_open": [start, end], "sha256": expected, "path": str(target.relative_to(HERE))})
assert b'p.jsx(ri,{type:"working",className:"h-4 w-4 mr-2"})' in asset[8909638:8912447]
assert b'{sprite:"working-loader"}' in asset[1946886:1947094]
assert b'"aria-hidden":"true"' in asset[1779090:1781979]
baseline = at_main(COMPONENT)
assert sha(baseline) == BASELINE_HASH
assert (ROOT / COMPONENT).read_bytes() == baseline, "Product source must remain unapplied"
for path, expected in PROTECTED.items():
    assert sha(at_main(path)) == expected, path
    assert sha((ROOT / path).read_bytes()) == expected, path
old = '            {busy ? "Resetting..." : "Reset"} {busy ? null : (\n'
new = '''            {busy && (
              <svg className="sb-ws-loader" width={16} height={16} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" style={{ width: 16, height: 16, border: 0, borderRadius: 0, flexShrink: 0 }}>
                <circle cx="3" cy="8" r="1.5" />
                <circle cx="8" cy="8" r="1.5" />
                <circle cx="13" cy="8" r="1.5" />
              </svg>
            )}
''' + old
text = baseline.decode()
assert text.count(old) == 1
candidate = text.replace(old, new).encode()
patch = "".join(difflib.unified_diff(text.splitlines(keepends=True), candidate.decode().splitlines(keepends=True), fromfile=f"a/{COMPONENT}", tofile=f"b/{COMPONENT}"))
(HERE / "candidate.patch").write_text(patch)
regression = HERE / "resetChatPendingIndicator.test.ts"
manifest = {
    "author": "Conductor Rebuild",
    "main": MAIN,
    "kind": "SOURCE_ONLY_UNAPPLIED_CANDIDATE_NOT_RUNTIME_INTAKE",
    "ownership_message": "bb5da51d-27cc-4bc8-9f2f-08be43c8071f",
    "reference": {
        "asset": RENDERER.name,
        "bytes": len(asset),
        "sha256": ASSET_HASH,
        "rea_evidence_id": "ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2",
    },
    "spans": spans,
    "baseline": {"path": COMPONENT, "sha256": BASELINE_HASH},
    "candidate": {"path": "candidate.patch", "sha256": sha(patch.encode()), "result_sha256": sha(candidate)},
    "regression": {"path": regression.name, "sha256": sha(regression.read_bytes()), "cases": 2, "execution": "NOT_RUN", "automatically_discovered": False},
    "protected": PROTECTED,
    "limits": [
        "Retained literal source is data, not executed vendor code.",
        "Historical renderer semantic analysis exhausted heap.",
        "SVG follows an existing OpenConductor precedent, not a proven pixel/animation match to the reference working-loader sprite.",
        "Inline size/border overrides isolate the global sb-ws-loader dimensions and ring; mounted tests do not load CSS.",
        "No application tests, typecheck, build, browser, package, workflow or native execution.",
        "No new runtime intake, registration, ordinal, provisioning, branch retarget or admission.",
    ],
}
(HERE / "source.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(f"PASS source-only: renderer, {len(spans)} spans, {len(PROTECTED)} protected counterparts, unapplied candidate generated")
