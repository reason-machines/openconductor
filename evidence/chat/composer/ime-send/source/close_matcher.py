#!/usr/bin/env python3
"""Read retained bundles as data; retain the configured send-matcher closure."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[4]
EXPECTED = {
    "renderApp-D_fmY7hW.js": "5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde",
    "index-BGEQ8YjU.js": "b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3",
}
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("originals", type=Path)
parser.add_argument("--main", required=True)
args = parser.parse_args()
sha = lambda b: hashlib.sha256(b).hexdigest()
sources = {}
for name, digest in EXPECTED.items():
    raw = (args.originals / name).read_bytes()
    assert sha(raw) == digest, name
    sources[name] = raw.decode()
spans = []


def retain(name, symbol, start, end, include_end=False):
    source = sources[name]
    a = source.index(start)
    b = source.index(end, a + len(start)) + (len(end) if include_end else 0)
    body = source[a:b]
    spans.append({"symbol": symbol, "asset": name, "asset_sha256": EXPECTED[name],
                  "utf8_bytes_half_open": [len(source[:a].encode()), len(source[:b].encode())],
                  "sha256_utf8": sha(body.encode()), "compiled_javascript": body})
    return body


renderer = "renderApp-D_fmY7hW.js"
index = "index-BGEQ8YjU.js"
retain(renderer, "named import ca as Qh", "ca as Qh", ",cb as Xh")
retain(index, "named export TQt as ca", "TQt as ca", ",Afe as cb")
matching = retain(index, "key constructors, Hfe key matcher, _Ut exact modifier matcher", "const he=({key:t,modifiers:e})", "function fQt(")
presets = retain(index, "modifier constants and zl send presets", "const Qe=[\"meta\"]", ";const V_=")
retain(index, "override snapshot producer EUt and subscription", 'const Cm="keybinding_overrides_v1"', "function IUt(")
retain(index, "override parser helpers through normalization DUt", "function IUt(", "function LUt(")
retain(index, "WUt snapshot parse and nh effective binding lookup", "function WUt(", "function UUt(")
retain(index, "TQt configured matcher", "function TQt(", "function qUt(")
retain(index, "RQt preset update and HUt legacy migration", "function RQt(", "function TQt(")
retain(index, "jUt settings-store installation", "function jUt(", "const iU=")
retain(index, "settings service calls jUt", "return V$e(jUt(n)),n}", "function $Qt(")
assert 'Hfe=(t,e)=>t.key.kind==="physical"?e.code===t.key.code:Oy(t.key.value,e.key)' in matching
assert 'return n?r:!r||vUt({shortcut:t,event:e,modifier:s})' in matching
assert '"cmd-enter":{"chat.newLine":[he({key:"Enter"}),he({key:"Enter",modifiers:Up})]' in presets
assert 'function TQt(t,e){return nh(t).some(s=>Hfe(s,e)&&_Ut(s,e))}' in sources[index]
assert '},yQt' not in presets

current = {}
for path in ["src/features/chat/Composer.tsx", "src/features/chat/ComposerEditor.tsx",
             "src/keybindings/KeybindingsProvider.tsx", "src/keybindings/overrides.ts",
             "src/keybindings/shortcut.ts", "src/keybindings/registry.ts"]:
    body = subprocess.check_output(["git", "show", f"{args.main}:{path}"], cwd=ROOT, text=True)
    current[path] = {"sha256_utf8": sha(body.encode()), "source": body}

# This is our own reducer over already-derived JSON, not execution of Conductor.
registry = json.loads((ROOT / "evidence/keybindings/keybindings.json").read_text())
assert registry["source"]["sha256"] == EXPECTED[index]
keys = [("Enter", []), ("Shift+Enter", ["shift"]), ("Alt+Enter", ["alt"]),
        ("Meta+Enter", ["meta"]), ("Ctrl+Enter", ["ctrl"]),
        ("Meta+Ctrl+Enter", ["meta", "ctrl"])]
commands = ["chat.submitOppositeFollowUp", "chat.submitMessage", "chat.newLine"]
truth = []
for mode, bindings in registry["sendKeyPresets"].items():
    for label, modifiers in keys:
        hit = next((command for command in commands if any(
            shortcut["key"] == {"kind": "logical", "value": "Enter"}
            and set(shortcut.get("modifiers", [])) == set(modifiers)
            for shortcut in bindings[command])), None)
        truth.append({"preset_without_custom_overrides": mode, "event": label,
                      "noncomposing_command": hit or "none; editor default remains outside this source proof",
                      "composing": "no submit callback before matcher"})

result = {
    "id": "ACQ-COMPOSER-IME-SEND-135-03/configured-matcher-closure",
    "author": "Conductor Rebuild", "checked_main": args.main,
    "status": "configured_matcher_source_chain_closed_no_IME_defect_admitted",
    "provenance": {"originals": EXPECTED,
        "handoff_archive_sha256": "5e20a816145dd8f6e63cb6e8c41b0e42b359c9aee4a8280a5eaee73e2427816c",
        "source": "Already retained Conductor 0.87.6 assets; both whole-byte hashes revalidated. Initial closure alias checked read-only on sven m5 max; full retained originals then handed over by existing be7 owner.",
        "rea": "ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367",
        "rea_gap": "Original renderer semantic worker exhausted heap. This closure uses inert original-byte spans, not a generated call graph.",
        "target_execution": "none; no app, target JavaScript, settings DB, provider, browser or native IME executed/read"},
    "reference_spans": spans,
    "current_sources": current,
    "chain": [
        "ITo -> UIi/cHt -> $Ii -> W5o command map -> renderer Qh",
        "renderer import ca as Qh -> index export TQt as ca -> full TQt",
        "TQt -> nh(command) -> parsed current snapshot WUt() / zfe(ud), else V_ registry default + additionalKeys",
        "TQt checks physical/logical key via Hfe and exact modifiers via _Ut; extra Shift/Alt allowance is only for single-symbol logical keys, not Enter",
        "jUt installs settings-store snapshot producer/subscription through EUt; RQt changes all four send commands; HUt migrates legacy cmd-enter only for commands without overrides",
        "Configured cqn prioritizes opposite follow-up, normal submit, newline. j5o raw-key fallback is not used as proof for the configured visible input",
        "Current Composer reads useKeybindingOverrides, calls effectiveShortcuts(id, overrides), then matchesEvent in the same command order; current adapter and submit guards prevent normal composing signals before onSubmit"
    ],
    "conditional_truth_table": truth,
    "custom_overrides": "Actual configured overrides take precedence over defaults. No live user settings snapshot was read; table explicitly conditions on each preset, not on the person's active configuration.",
    "conclusion": "The previously missing configured matcher and active-binding source chain is closed. It does not establish an IME send defect. Normal composition signals are guarded on both sides; which-only=229 remains a source-domain difference with no demonstrated browser event producer.",
    "fixture_design": "Keep existing actual adapter -> Composer callback design; use explicit effective binding inputs, observe forwarding/default handling/submission separately. Any product claim requires a realistic event producer; native acceptance still requires actual native observation.",
    "verification": {"passed": ["original asset hashes", "complete matcher/dependency spans", "current-main source reads", "preset-conditioned source truth table"],
        "not_run": ["product regression RED/GREEN", "typecheck", "mounted editor", "browser", "native IME", "provider"],
        "product_or_locked_fixture_edits": "none"}
}
(HERE / "matcher-closure.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps({"status": result["status"], "checked_main": args.main, "reference_spans": len(spans), "truth_rows": len(truth), "product_edits": 0}))
