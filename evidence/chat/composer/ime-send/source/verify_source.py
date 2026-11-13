#!/usr/bin/env python3
"""Build a source-only event contract. Never execute the shipped declarations."""
import hashlib
import json
from pathlib import Path
import subprocess

MAIN = "385ccb5229f56ff33903f034352eaa9827c40f0e"
ROOT = Path(__file__).resolve().parents[5]
HERE = Path(__file__).resolve().parent
PACKET = "evidence/chat/composer/slash-atom-preservation/packet.json"
old = json.loads((ROOT / PACKET).read_text())
spans = {x["symbol"]: x for x in old["spans"]}


def sha(text):
    return hashlib.sha256(text.encode()).hexdigest()


def retained(symbol, begin, end):
    span = spans[symbol]
    body = span["compiled_javascript"]
    assert sha(body) == span["sha256_utf8"], symbol
    a = body.index(begin)
    b = body.index(end, a) + len(end)
    return {"symbol": symbol, "declaration_utf8_bytes": span["utf8_bytes"], "declaration_sha256": span["sha256_utf8"], "fragment_utf8_bytes": [span["utf8_bytes"][0] + len(body[:a].encode()), span["utf8_bytes"][0] + len(body[:b].encode())], "fragment_sha256": sha(body[a:b]), "compiled_javascript": body[a:b]}


helpers = (HERE / "retained-send-helpers.txt").read_text()
helper_spans = []
for symbol, left, right in [
    ("composition_code", "$$e=229;", "function oRt("),
    ("oRt", "function oRt(", "const P5o="),
    ("P5o", "const P5o=", "function aqn("),
    ("aqn", "function aqn(", "function L5o("),
    ("M5o+j5o", "const M5o=", "function lqn("),
    ("lqn", "function lqn(", "function cqn("),
    ("cqn", "function cqn(", None),
]:
    a = helpers.index(left)
    b = len(helpers) if right is None else helpers.index(right, a)
    helper_spans.append({"symbol": symbol, "utf8_bytes_derived_from_known_8415731_anchor": [8415731 + len(helpers[:a].encode()), 8415731 + len(helpers[:b].encode())], "sha256": sha(helpers[a:b]), "compiled_javascript": helpers[a:b]})
assert helper_spans[0]["sha256"] == "daa7b1b31b64d1c5a942f120deff423e81c42e80fe5662bc756158009e3ec1f4"
assert helper_spans[1]["sha256"] == "0cf63f73563cef134d6089a084469a5d52f916f9d502afade3b4752e2c20bb4b"
wrapper = (HERE / "retained-identity-wrapper.txt").read_text()
assert sha(wrapper) == "4283e46687b05b8b24d9071e15301030bd57ac48bb3f7b129375606bfeaaca70"

sources = {}
for path in ["src/features/chat/Composer.tsx", "src/features/chat/ComposerEditor.tsx"]:
    source = subprocess.check_output(["git", "show", f"{MAIN}:{path}"], cwd=ROOT, text=True)
    sources[path] = {"sha256": sha(source), "source": source}


def current_part(path, first, last):
    v = sources[path]
    return {"path": path, "source_sha256": v["sha256"], "lines_1_indexed_inclusive": [first, last], "source": "\n".join(v["source"].splitlines()[first - 1:last]) + "\n"}


editor = sources["src/features/chat/ComposerEditor.tsx"]["source"]
composer = sources["src/features/chat/Composer.tsx"]["source"]
assert 'if (event.isComposing || editor.view.composing || event.keyCode === 229) return false;' in editor
assert 'current.current.onKeyDown(event);' in editor
assert 'composing: () => editor.view.composing' in editor
assert 'if (ev.isComposing) return;' in composer
assert 'if (inputRef.current?.composing()) return;' in composer
assert 'onSubmit(input, working ? mode(opposite) : "queue")' in composer
assert 'onKeyDown={onKeyDown}' in composer

physical_keys = ["Enter", "Shift+Enter", "Alt+Enter", "Meta+Enter", "Ctrl+Enter", "Meta+Ctrl+Enter"]
truth = []
for key in physical_keys:
    truth.append({"key": key, "composition": "Q.isImeCompositionActive or any oRt signal", "reference": "Inner editor handler returns true before matching. Outer React handler returns before U; no submission callback on that path.", "current": "Raw isComposing, view.composing or keyCode 229 prevents forwarding to Composer.onKeyDown. Adapter returns false, not true. Native default behavior is not established by this source comparison."})
    truth.append({"key": key, "composition": "none of the retained composition signals", "reference": "With no active suggestion consuming the key, cqn asks configured matcher in order: submitOppositeFollowUp, submitMessage, newLine. A true send then requires !shouldSkipSubmitShortcut and canSubmit before U. Exact physical key mapping is unresolved without Qh and active bindings.", "current": "Adapter forwards raw event. Composer checks configured shortcuts in order: chat.submitOppositeFollowUp, chat.submitMessage, chat.newLine; submit rechecks handle.composing before onSubmit. Exact active shortcuts are outside this two-file scope."})

result = {
    "id": "ACQ-COMPOSER-IME-SEND-135-03",
    "author": "Conductor Rebuild",
    "checked_main": MAIN,
    "status": "partial_source_contract_no_product_defect_admitted",
    "artifact": old["artifact"],
    "provenance": {
        "retained_rea": old["provenance"],
        "complete_ITo_lHt_packet": PACKET,
        "helper_history_source": {"session_id": "13576d11-76fb-4842-aa9b-c398f9ca26f3", "source_id": "8384a3ff-4acf-4e4d-88e0-a51f97af81e2", "revision": 26348898, "created_at": "2026-11-11T05:48:32.494Z", "read_window": [10000, 23000]},
        "identity_wrapper_history_source": {"source_id": "b3da3f1d-fa34-4456-a906-2a49866a97f7", "revision": 26223556, "read_window": [12600, 14800]},
        "offset_limit": "Helper absolute ranges are derived from the already recorded constant anchor and recovered contiguous text, not remeasured against a freshly acquired full renderer. Known constant, oRt and wrapper hashes matched their earlier closed packet. UIi/W5o/cHt original byte offsets are not retained; their complete text and history-source identity are recorded instead.",
        "acquisition": "none; recovered already-held inert text only",
    },
    "reference_fragments": [
        retained("ITo", "ITo=$.memo(function(", "onSubmit:m"),
        retained("ITo", "p.jsx(lHt,{", "onPastedCloudAttachmentMentionRemoved:uh})"),
        retained("ITo", "x2=async(", "C5=ln=>{ln.preventDefault(),!(c===\"all\"||!cr)&&x2().fireAndForget()}"),
        retained("lHt", "editorProps:{", "handleClick:"),
        retained("lHt", "const ve=$.useCallback(", "m.matchesSendCommand]);"),
        retained("lHt", 'onCompositionEnd:', 'onKeyDown:ve'),
    ],
    "helper_spans": helper_spans,
    "identity_wrapper": {"utf8_bytes": [674926, 674995], "sha256": sha(wrapper), "compiled_javascript": wrapper},
    "command_mapping": {"history_source_only_no_original_byte_range": True, "sha256": sha((HERE / "retained-command-map.txt").read_text()), "compiled_javascript": (HERE / "retained-command-map.txt").read_text()},
    "visible_input_capabilities": {"history_source_only_no_original_byte_range": True, "sha256": sha((HERE / "retained-UIi.txt").read_text()), "compiled_javascript": (HERE / "retained-UIi.txt").read_text()},
    "current_fragments": [
        current_part("src/features/chat/ComposerEditor.tsx", 72, 77),
        current_part("src/features/chat/ComposerEditor.tsx", 91, 99),
        current_part("src/features/chat/ComposerEditor.tsx", 141, 148),
        current_part("src/features/chat/Composer.tsx", 194, 204),
        current_part("src/features/chat/Composer.tsx", 239, 243),
        current_part("src/features/chat/Composer.tsx", 288, 300),
        current_part("src/features/chat/Composer.tsx", 347, 364),
    ],
    "observed_source_contract": [
        "lHt installs a low-level editor handleKeyDown and a React wrapper onKeyDown. The React wrapper produces and clears its own composition-active flag on compositionstart, compositionend and blur.",
        "oRt recognizes event.isComposing, nativeEvent.isComposing, event.keyCode, event.which, nativeEvent.keyCode and nativeEvent.which, with numeric composition code 229. aqn is a separate Ctrl+Space guard, not an Enter-composition predicate.",
        "ITo passes UIi interaction capabilities to lHt and binds onSubmit to x2. UIi uses cHt, cHt uses $Ii and $Ii delegates command names through W5o to Qh. The full Qh body and current active bindings are not in the held closure.",
        "When cqn receives the real KeyboardEvent and configured matcher, it uses that matcher. Its j5o raw-key fallback and lqn's M5o fallback must not be substituted for the visible configured path.",
        "The retained composition guard precedes suggestion dispatch and send matching. The actual x2 callback eventually calls the ITo onSubmit parameter m after its own availability/session checks.",
        "Current ComposerEditor forwards only after its raw-event/view guard. Current Composer.onKeyDown checks event.isComposing and uses effective command shortcuts. Current submit rechecks inputRef.composing before calling onSubmit.",
    ],
    "truth_table": truth,
    "narrow_signal_difference": {
        "input": "Raw Enter with which=229, keyCode not 229, isComposing false and editor.view.composing false",
        "reference": "oRt is true, so the key is blocked before command matching.",
        "current": "The raw adapter predicate is false and forwards the event. A send is possible only if an actual configured shortcut matches and other submit conditions hold.",
        "qualification": "Source-domain difference only. No browser/native event producer has established this combination, so no real IME defect or product correction is admitted.",
    },
    "inert_fixture_design": {
        "status": "design only, no executable test authored or run",
        "path": "Exercise actual ComposerEditor.editorProps.handleKeyDown through the production callback to actual Composer.onKeyDown and submit. Do not test a copied predicate in isolation.",
        "cases": [
            "For Enter and each modified Enter above, isolate raw isComposing=true, view.composing=true and keyCode=229. Observe forwarding count and submit count independently.",
            "Isolate raw which=229 with flags false and keyCode=0 as a source-boundary probe, not a claimed browser event. Keep adjacent-code controls 228 and 230.",
            "Use a real KeyboardEvent in the configured-matcher path. Verify opposite-send, normal-send and newline against explicit existing bindings rather than the unused fallback formula.",
            "Observe low-level handled return, preventDefault, stopPropagation, editor mutation and onSubmit separately. Returning false cannot be called equivalent to the reference returning true without executing the editor dispatcher.",
            "A mounted browser/native phase must establish actual composition event order, view.composing timing and emitted which/keyCode combinations before the source-domain difference is admitted as an end-user defect.",
        ],
        "dependency_and_execution": "Would need existing React/Tiptap/TypeScript fixture dependencies and a scoped runtime grant. Neither installation nor execution is part of this source pass.",
    },
    "missing_boundary": {
        "exact_body": "Qh configured shortcut matcher implementation and active command bindings for the visible ITo input; the held W5o/$Ii/cHt declarations retain only the call join.",
        "consequence": "Composing behavior is source-qualified independently of physical-key mapping. Noncomposing Enter versus modified Enter outcomes remain conditional on actual configured matches. No default mapping is invented.",
        "earlier_closed_packet": "evidence/chat/composer/model-ime-boundary/README.md already qualifies oRt's six signals for ModelPicker. That completed picker scope is not reopened or edited here.",
    },
    "verification": {"passed": ["retained full ITo/lHt hashes", "known composition constant and complete oRt hash", "known identity wrapper hash", "pinned-main two-file callback joins"], "not_run": ["baseline RED", "patched GREEN", "typecheck", "mounted React/editor", "browser", "native IME", "provider"], "product_edit": "none", "publication": "no PR, push or workflow dispatch"},
}
(HERE / "packet.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps({"packet": str((HERE / "packet.json").relative_to(ROOT)), "main": MAIN, "static_checks": "passed", "status": result["status"], "missing_body": "Qh and active bindings", "runtime": "not run"}))
