#!/usr/bin/env python3
"""Retain hash-bound, inert compiled-JavaScript spans; never execute the target."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import subprocess

EXPECTED = "5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde"
RANGES = [
    ("ITo", "ITo=$.memo(function(", "}),RTo=[", 2),
    ("lHt", "function lHt(", "function U5o(", 0),
    ("o5o", "function o5o(", "function OIi(", 0),
    ("u5o", "function u5o(", "function d5o(", 0),
    ("b5o", "function b5o(", "function _5o(", 0),
    ("w5o", "function w5o(", "var S5o=", 0),
    ("E5o", "function E5o(", "function C5o(", 0),
    ("C5o", "function C5o(", "function DIi(", 0),
    ("DIi", "function DIi(", "function oqn(", 0),
    ("k5o", "var k5o=b5.create(", "function ", 0),
    ("eki+nce", "function eki(", "function tki(", 0),
    ("BNi", "function BNi(", "function pTo(", 0),
    ("D5o", "const D5o=k5o.extend(", ",$$e=229", 0),
    ("O5o", "function O5o(", "const D5o=", 0),
    ("a_o", "a_o=(t,e,n)=>", ";function JTi(", 1),
    ("Ybo", "Ybo=t=>", ",Qbo=", 0),
    ("nqn", "function nqn(", "function ", 0),
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("renderer", type=Path)
    parser.add_argument("--main", required=True, help="Already fetched exact origin/main SHA")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    raw = args.renderer.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    assert digest == EXPECTED, f"Renderer identity mismatch: {digest}"
    text = raw.decode("utf-8")
    assert subprocess.check_output(["git", "rev-parse", "origin/main"], text=True).strip() == args.main
    spans = []
    for symbol, start, stop, include in RANGES:
        a = text.index(start)
        b = text.index(stop, a + len(start)) + include
        value = text[a:b]
        spans.append({
            "symbol": symbol,
            "kind": "complete minified declaration or assignment",
            "range_convention": "zero-based, half-open",
            "unicode_code_points": [a, b],
            "utf8_bytes": [len(text[:a].encode()), len(text[:b].encode())],
            "utf16_code_units": [len(text[:a].encode("utf-16-le")) // 2, len(text[:b].encode("utf-16-le")) // 2],
            "sha256_utf8": hashlib.sha256(value.encode()).hexdigest(),
            "compiled_javascript": value,
        })
    by_symbol = {span["symbol"]: span["compiled_javascript"] for span in spans}
    assertions = {
        "live_slash_trigger": 'char:"/",query:z6' in by_symbol["ITo"],
        "live_choice_replaces_only_range": 'ln.chain().focus().insertContentAt($r,`/${Vf} `).run()' in by_symbol["ITo"],
        "builtin_action_deletes_only_range": 'ln.chain().focus().deleteRange($r).run(),ua(Oa)' in by_symbol["ITo"],
        "visible_editor_receives_triggers": 'triggers:h_,onEditorReady:E5' in by_symbol["ITo"],
        "editor_forwards_exact_range": 'Q.latestTriggers[xe].onSelect(ke,Se,De)' in by_symbol["lHt"],
        "editor_stores_current_triggers": 'Q.latestTriggers=d' in by_symbol["lHt"],
        "visible_editor_dom": 'className:"composer-tiptap","data-testid":"composer-input"' in by_symbol["lHt"],
        "suggestion_adapter_remembers_editor_and_range": 'c=P.editor,a=P.range' in by_symbol["o5o"],
        "selection_dispatch_passes_same_range": 'Promise.resolve(n(c,a,P))' in by_symbol["o5o"],
        "keyboard_choice_is_reachable": 'P.key==="Enter"||P.key==="Tab"' in by_symbol["o5o"],
        "matcher_uses_text_before_cursor": 'c.nodeBefore.text' in by_symbol["u5o"],
        "matcher_returns_document_range": 'range:{from:I,to:R}' in by_symbol["u5o"],
        "selection_must_be_empty_or_composing": 'x&&(k||t.view.composing)' in by_symbol["b5o"],
        "file_atom_is_inline": 'inline:!0,selectable:!1,atom:!0' in by_symbol["k5o"],
        "mention_insertion_is_bounded": 'insertContentAt(e,eki(n))' in by_symbol["eki+nce"],
        "file_atom_has_visible_nodeview": 'return $Ai(O5o,{as:"span"})' in by_symbol["D5o"],
        "insert_command_uses_supplied_bounds": 'i.insertText(x,h,m)' in by_symbol["a_o"],
        "range_delete_uses_supplied_bounds": 'e.delete(i,r)' in by_symbol["Ybo"],
    }
    assert all(assertions.values()), {k: v for k, v in assertions.items() if not v}
    files = {}
    for name in ["Composer.tsx", "ComposerEditor.tsx", "slashCommands.ts", "composerSchema.ts", "composerDocument.ts", "SlashMenu.tsx"]:
        path = "src/features/chat/" + name
        source = subprocess.check_output(["git", "show", f"{args.main}:{path}"], text=True)
        files[path] = {"sha256_utf8": hashlib.sha256(source.encode()).hexdigest(), "source": source}
    old = files["src/features/chat/Composer.tsx"]["source"]
    adapter = files["src/features/chat/ComposerEditor.tsx"]["source"]
    schema = files["src/features/chat/composerSchema.ts"]["source"]
    assertions.update({
        "current_caller_flattens_snapshot": 'completeInsert(selection.text, command.insert ?? `/${command.name}`)' in old,
        "current_caller_replaces_document": 'inputRef.current?.replaceText(next)' in old,
        "current_adapter_selects_entire_document": 'setTextSelection({ from: 1, to: editor.state.doc.content.size - 1 })' in adapter,
        "current_adapter_reinserts_text_only": 'inlineContent([{ kind: "text", text }])' in adapter,
        "snapshot_encodes_file_as_object_replacement": '"\\ufffc"' in schema,
    })
    assert all(assertions.values()), {k: v for k, v in assertions.items() if not v}
    rea = json.loads(gzip.decompress(Path("evidence/frontend/rea-analyze-javascript-application.json.gz").read_bytes()))
    packet = {
        "id": "ACQ-COMPOSER-ATOM-01",
        "author": "Conductor Rebuild",
        "main_sha_checked": args.main,
        "artifact": {"name": "Conductor 0.87.6 decoded assets/renderApp-D_fmY7hW.js", "sha256": digest, "bytes": len(raw)},
        "provenance": {"retained_rea_evidence_id": rea["evidence_id"], "manifest": "evidence/frontend/tauri-assets-manifest.json", "parse_status": "skipped", "known_gap": "Owned JavaScript worker exhausted its heap. Compiled bundle spans were inspected as inert text, not an REA-generated call graph. No new REA call or target execution."},
        "coordinate_units": {"source_spans": "Each span explicitly includes UTF-8 byte, Unicode code-point and JavaScript UTF-16 code-unit offsets, zero-based half-open.", "editor_ranges": "Conductor suggestion range.from/to and Tiptap commands use ProseMirror document positions; text offsets count JavaScript UTF-16 code units, inline atoms have nodeSize 1. These are not bundle byte offsets.", "openconductor_snapshot": "linearDocument maps text UTF-16 code units and U+FFFC per file atom to ProseMirror positions."},
        "chain": ["ITo h_ slash query z6 and onSelect", "ITo visible lHt editor receives triggers:h_", "lHt D5o suggestion uses o5o callback forwarding latestTriggers[xe].onSelect", "u5o finds text node immediately before caret; b5o validates active editable selection", "w5o forwards range; o5o retains editor/range and dispatches selected item", "ITo onSelect uses insertContentAt(range, /name + space); immediate built-in actions deleteRange(range)", "a_o mutates only supplied from/to; suffix file atoms/text are outside replacement", "D5o/O5o renders retained mention atom as a visible pill"],
        "conclusion": "Static reachable mismatch on checked main: picking slash completion recreates the whole editor as text, losing file-atom identity; a bounded replacement should preserve suffix nodes. Mounted RED is not yet run.",
        "qualification_case": {"draft_parts": [{"kind": "text", "text": "/re "}, {"kind": "file", "path": "src/example.ts", "label": "example.ts", "directory": False}, {"kind": "text", "text": " keep suffix"}], "caret_utf16_offset": 3, "prosemirror_suggestion_range": {"from": 1, "to": 4}, "expected_static_effect": "Replace /re only with /review + space, leaving existing following space, file atom and suffix text unchanged."},
        "limits": ["No Conductor native/browser run this turn", "No OpenConductor mounted runtime test yet", "No native WebKit, visual, real IME or provider acceptance", "Only slash-command range replacement/file-atom preservation; immediate built-in action parity and sibling skill hypotheses excluded"],
        "missing_boundary": "No missing declaration or caller artifact. Remaining gate is the sole executor's current lightweight Cloud Node fixture admission, plus mounted RED/GREEN. No new native artifact acquisition needed.",
        "assertions": assertions,
        "spans": spans,
        "current_main_files": files,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(packet, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"packet": str(args.output), "main_sha": args.main, "renderer_sha256": digest, "full_declarations": len(spans), "static_assertions_passed": len(assertions)}))


if __name__ == "__main__":
    main()
