import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parents[2]
receipt = json.loads((root / "evidence/home-sidebar-hint/reference-caller.json").read_text())
renderer_hash = "5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde"
index_hash = "b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3"
assert receipt["asset"]["sha256"] == renderer_hash
for span in receipt["spans"]:
    raw = span["text"].encode("utf-8")
    assert len(raw) == span["utf8"][1] - span["utf8"][0], span["label"]
    assert len(span["text"].encode("utf-16-le")) // 2 == span["utf16"][1] - span["utf16"][0], span["label"]
    assert hashlib.sha256(raw).hexdigest() == span["sha256"], span["label"]
caller, edge = receipt["spans"]
for encoding, field in [("utf-8", "utf8"), ("utf-16-le", "utf16")]:
    scale = 2 if field == "utf16" else 1
    start = (edge[field][0] - caller[field][0]) * scale
    end = (edge[field][1] - caller[field][0]) * scale
    assert caller["text"].encode(encoding)[start:end] == edge["text"].encode(encoding)
assert edge["text"] == 'p.jsx(Ss,{commandId:"view.toggleLeftSidebar"})'

focused = json.loads((root / "evidence/help/shortcut-overrides/reference-focused.json").read_text())
assert renderer_hash in focused["stdout"] and index_hash in focused["stdout"]
focused_rows = [json.loads(line) for line in focused["stdout"].splitlines() if line.startswith("{")]
transitive = json.loads((root / "evidence/help/shortcut-overrides/reference-transitive.json").read_text())
rows = json.loads(transitive["stdout"])
definitions = {row["symbol"]: row for row in focused_rows + rows if "symbol" in row}
for name in ["Ss", "jde", "Mde", "nh", "GUt", "EUt", "SQt", "bQt", "OQt", "jUt", "zfe"]:
    row = definitions[name]
    assert row["byte_end"] - row["byte_start"] == len(row["source"].encode("utf-8")), name
for alias in ["cV as wYe", "cW as q4r", "cX as WTn", "cY as K4r", "OQt as cV", "SQt as cW", "bQt as cX", "zfe as cY"]:
    assert any(row["source"] == alias for row in rows), alias
for name, fragment in [
    ("Ss", "r=jde(n)"), ("Ss", "[r.key,...r.additionalKeys??[]]"),
    ("jde", "n=Mde()"), ("jde", "wYe(t,n)"),
    ("Mde", "useSyncExternalStore(q4r,WTn,WTn)"), ("Mde", "K4r(e)"),
    ("OQt", "GUt(t,{overrides:e})"), ("GUt", "[n,...r]=nh(t,e)"),
    ("nh", "(e?.overrides??WUt())[t]"),
    ("EUt", "ud=t.getSnapshot()"), ("EUt", "ud=s,qY()"),
    ("jUt", "settingsByKey[Cm]"), ("zfe", "V_[u].configurable"),
]:
    assert fragment in definitions[name]["source"], (name, fragment)
registry = json.loads((root / "evidence/keybindings/keybindings.json").read_text())
assert registry["source"]["sha256"] == index_hash
command = next(row for row in registry["commands"] if row["id"] == "view.toggleLeftSidebar")
assert command["configurable"] is True
print("PASS: two received raw span hashes/ranges, nested JSX edge, eleven retained helper span lengths, eight alias joins, configurable same-build command")
print("LIMIT: original executable/asset hashes are the sole acquisition owner's receipt, not independently recomputed here; static source only")
