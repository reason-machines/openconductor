#!/usr/bin/env python3
"""Verify retained source bytes only. Never import/evaluate the vendor asset."""
import hashlib
import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parent
manifest = json.loads((root / "source.json").read_text())
asset = Path(sys.argv[1]).read_bytes()
checks = 0

def check(condition, label):
    global checks
    if not condition:
        raise AssertionError(label)
    checks += 1

check(len(asset) == manifest["asset"]["bytes"], "full retained renderer size")
check(hashlib.sha256(asset).hexdigest() == manifest["asset"]["sha256"], "full retained renderer hash")
spans = {}
for record in manifest["spans"]:
    start, end = record["utf8_span"]
    raw = asset[start:end]
    check(raw == (root / record["file"]).read_bytes(), record["name"] + " exact bytes")
    check(len(raw) == record["bytes"] and hashlib.sha256(raw).hexdigest() == record["sha256"], record["name"] + " size/hash")
    spans[record["name"]] = raw.decode()

anchors = {
    "nFi": ["U=i&&p.jsxs(h2", "p.jsxs(Tm", "p.jsxs(i4e", "onCheckedChange:()=>c(GXn(a,ue.id))"],
    "h2": ["p.jsx(oF"],
    "Sg": ["p.jsx(Ede"],
    "oF": ["loopFocus:d=!0", "ze=SLt(xe", 'openOnArrowKeyDown:J.type!=="context-menu"', "Ze=$li(xe", "listRef:D.context.itemLabels", "JSe(D,{floatingRootContext:xe"],
    "Ede": ['xe=E.useState("triggerProps",K)', "Le=[ye,pe??pf,xe"],
    "JSe": ["t.useSyncedValues(e)"],
    "SLt": ['Ue.key === "Home"', 'Ue.key === "End"'],
    "Tm": ["p.jsx(m2", "p.jsx(b2"],
    "m2": ['u.useState("popupProps")', "props:[v,"],
    "b2": ["p.jsx(Sde,{elementsRef:I.context.itemDomElements,labelsRef:I.context.itemLabels"],
    "Sde": ["P.registration.label", "P.element.textContent", "p.jsx(s0i.Provider"],
    "wD": ["label:n", "a(w,{metadata:i??null,index:o??null,label:n,textRef:r})"],
    "YBr": ["$.useContext(s0i)"],
    "i4e": ["p.jsx(wde", "closeOnClick:!1"],
    "wde": ["wD({guess:!0,label:a})", "eXe({closeOnClick:d"],
    "eXe": ["O6({disabled:n", "r0i({closeOnClick:e"],
    "O6": ['R.key==="Enter"', 'R.key===" "', "LX(D,R)"],
    "LX": ['PointerEvent("click"'],
    "$li": [".startsWith(J)", "R.ctrlKey||R.metaKey||R.altKey", "o?.(z)"],
    "Z_": ["t.preventDefault(),t.stopPropagation()"],
    "qze": ["t?.focus({preventScroll:n})"],
    "RQe": ['case"vertical":return e'],
    "QPt": ['"ArrowUp"'],
    "_Qe": ['"ArrowDown"'],
}
# SLt's raw source is minified; compare compact spellings, not printer output.
anchors["SLt"] = ['Ue.key==="Home"', 'Ue.key==="End"', "aFe(Ue.key,w)", "!it&&v?Ue(He):Le(He)", "Q.current", "te.current==null||S4t(te.current,w,h)"]
for name, needles in anchors.items():
    for needle in needles:
        check(needle in spans[name], name + " caller/key/focus anchor: " + needle)
fixture = (root / manifest["fixture"]["file"]).read_bytes()
check(hashlib.sha256(fixture).hexdigest() == manifest["fixture"]["sha256"], "frozen regression hash (not nFi source hash)")
print(json.dumps({"checks_passed": checks, "spans": len(spans), "vendor_execution": False, "native_browser_package": "NOT_RUN_BY_THIS_COMMAND"}, indent=2))
