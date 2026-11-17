#!/usr/bin/env python3
"""Validate inert REA source spans and the frozen mounted-DOM regression. Never evaluate vendor bytes."""
from pathlib import Path
import hashlib, json, sys
root = Path(__file__).resolve().parent
manifest = json.loads((root / "source.json").read_text())
asset = Path(sys.argv[1]).read_bytes() if len(sys.argv) > 1 else None
checks = 0
def check(ok, label):
    global checks
    assert ok, label
    checks += 1
if asset is not None:
    check(len(asset) == manifest["asset"]["bytes"], "renderer size")
    check(hashlib.sha256(asset).hexdigest() == manifest["asset"]["sha256"], "renderer digest")
spans = {}
for row in manifest["spans"]:
    raw = (root / row["file"]).read_bytes()
    check(len(raw) == row["bytes"], row["name"] + " length")
    check(hashlib.sha256(raw).hexdigest() == row["sha256"], row["name"] + " digest")
    start, end = row["utf8_span"]
    check(end - start == len(raw), row["name"] + " extent")
    if asset is not None:
        check(asset[start:end] == raw, row["name"] + " original-byte slice")
    spans[row["name"]] = raw.decode()
anchors = {
"UJo": ['setArchiveFilter:Q', 'p.jsx(nFi,{showOwnerFilter:Zr', 'onArchiveFilterChange:Q', 'G==="active"&&hi.state==="archived"', 'G==="archived"&&hi.state!=="archived"'],
"nFi": ['P=["active","all","archived"]', 'active:"Hiding archived",all:"Showing all",archived:"Only archived"', 'd(tFi.parse(ue))', 'p.jsxs(Bf,{"aria-label":"Archived workspaces"', 'p.jsx($f,{align:"end",children:L.map(ue=>p.jsx(Il,{value:ue,children:F[ue]},ue))})', 'p.jsxs(ah,{modal:x,value:u,onValueChange:z'],
"ah": ['abi(n,m)', 'E!==null&&o?.(E)', 'p.jsx(Hos,{...c,items:g'],
"abi": ['n.type===Il', 'e.push({label:n.props.children,value:n.props.value})'],
"Bf": ['p.jsx(qos,{ref:e,render:m,nativeButton:_,className:v,...c,children:x})'],
"qos": ['U=wr(w,Wl.triggerProps)', 'r_(U,{id:Z,role:"combobox","aria-expanded":B,"aria-haspopup":"listbox"', 'props:ye'],
"$f": ['p.jsx(ias,', 'p.jsxs(tas,', 'onKeyDown:H', 'alignItemWithTrigger:F', 'I=v===void 0?"popper":v', 'O=w===void 0?4:w'],
"tas": ['J=wr(u,Wl.popupProps)', 'props:[J,ge,TZ(te),c]', 'returnFocus:a'],
"ias": ['role:"listbox"'],
"Il": ['p.jsx(aas,', 'p.jsxs(ras,'],
"ras": ['wD({guess:!0,label:c,textRef:m})', 'I.current', '_.set("selectedIndex",G)', 'role:"option","aria-selected":H', 'else w(a,Ys(uH,pe)),x(!1,Ys(uH,pe))', 'O6({disabled:L,focusableWhenDisabled:!0,native:d,composite:!0})'],
"aas": ['ref:[g,n,r]'],
"Sde": ['i.current[P.index]=P.registration.label!==void 0?P.registration.label:P.registration.textRef?.current?.textContent??P.element.textContent'],
"Hos": ['multiple:I=!1', 'ce,ae]=Wx({controlled:n', '!de&&Qe.set("selectedIndex",dr)', 'ct=SLt(Vn,{enabled:!g&&!Z,listRef:pe,activeIndex:Ue,selectedIndex:We', 'Pt=$li(Vn,{enabled:!g&&!Z&&(de||!I)', 'de?Qe.set("activeIndex",hn):Dn(xe.current[hn],Ys(ym))', 'popupProps:Yt,triggerProps:Rt', 'valuesRef:xe,labelsRef:be'],
"SLt": ['loopFocus:u=!1', 'J=$.useRef(a??-1)', 'J.current=a??-1', 'Ue.key==="Home"', 'Ue.key==="End"', '!it&&v?Ue(He):Le(He)', 'J.current=Math.min(He', 'J.current=Math.max(Ve', 'We.focus({preventScroll:!0})'],
"$li": ['resetMs:d=750', '.startsWith(J)', 'R.ctrlKey||R.metaKey||R.altKey', 'o?.(z)'],
"O6": ['R.key==="Enter"', 'R.key===" "', 'LX(D,R)'],
"LX": ['PointerEvent("click"'],
"qze": ['t?.focus({preventScroll:n})'],
"r_": ['o=B6e(o,e)'],
"MJo": ['archiveFilter:H', 'setArchiveFilter:P'],
}
for name, needles in anchors.items():
    for needle in needles:
        check(needle in spans[name], name + " reachable consumer: " + needle)
fixture = (root / manifest["fixture"]["file"]).read_bytes()
check(hashlib.sha256(fixture).hexdigest() == manifest["fixture"]["sha256"], "unchanged v2 fixture")
v1 = (root / "frozen/archiveKeyboard.v1.cjs").read_text()
v2 = fixture.decode()
check(v1.replace("assert.equal(document.activeElement,view.trigger());", "assert.equal(document.activeElement===view.trigger(),true,'Escape returns focus to the archive trigger');") == v2, "v2 changes failed-DOM diagnostic only")
red = (root / "frozen/red-v2.tap").read_text()
for total in ["# tests 14", "# pass 5", "# fail 9", "# cancelled 0", "# skipped 0"]:
    check(total in red, "complete intended baseline: " + total)
check("ERR_TEST_FAILURE" not in red, "no harness process failure accepted as baseline")
print(json.dumps({"passed":checks,"spans":len(spans),"vendor_execution":False,"mode":"original-byte" if asset is not None else "retained-span-only"}))
