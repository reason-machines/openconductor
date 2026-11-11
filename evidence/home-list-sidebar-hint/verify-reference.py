import argparse
import hashlib
import json
import runpy
from pathlib import Path

root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument("--renderer", type=Path)
args = parser.parse_args()
packet = json.loads((Path(__file__).with_name("reference.json")).read_text())
renderer_hash = "5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde"
assert packet["asset_sha256"] == renderer_hash
spans = {span["symbol"]: span for span in packet["spans"]}
for name, span in spans.items():
    raw = span["source"].encode("utf-8")
    assert hashlib.sha256(raw).hexdigest() == span["sha256"], name
    assert len(raw) == span["utf8"][1] - span["utf8"][0], name
    assert len(span["source"].encode("utf-16-le")) // 2 == span["utf16"][1] - span["utf16"][0], name
for name, fragment in [
    ("UJo", "Zo=!de&&p.jsx(YJo,{})"),
    ("YJo", 'p.jsx(Ss,{commandId:"view.toggleLeftSidebar"})'),
    ("Ss", "r=jde(n)"),
    ("jde", "n=Mde()"),
    ("Mde", "useSyncExternalStore(q4r,WTn,WTn)"),
]:
    assert fragment in spans[name]["source"], (name, fragment)
focused = json.loads((root / "evidence/help/shortcut-overrides/reference-focused.json").read_text())
helpers = {row["symbol"]: row for line in focused["stdout"].splitlines() if line.startswith("{") and "symbol" in (row := json.loads(line))}
for name in ["Ss", "jde", "Mde"]:
    assert helpers[name]["source"] == spans[name]["source"], name
    assert helpers[name]["byte_start"] == spans[name]["utf8"][0], name
    assert helpers[name]["byte_end"] == spans[name]["utf8"][1], name
runpy.run_path(str(root / "evidence/home-sidebar-hint/verify-reference.py"))
print("PASS: six packet span hashes/ranges, workspace-list caller chain, exact shared-helper receipt join")
if args.renderer:
    raw = args.renderer.read_bytes()
    assert len(raw) == 11600457
    assert hashlib.sha256(raw).hexdigest() == renderer_hash
    utf16 = raw.decode("utf-8").encode("utf-16-le")
    for name, span in spans.items():
        a, b = span["utf8"]
        c, d = span["utf16"]
        assert raw[a:b].decode("utf-8") == span["source"], name
        assert utf16[2*c:2*d].decode("utf-16-le") == span["source"], name
    print("PASS: full received renderer hash and six absolute byte/UTF-16 spans recomputed")
else:
    print("LIMIT: no full renderer supplied; packet and retained receipts only")
print("LIMIT: inert shipped-source validation, not fresh executable identity, native behavior or visual parity")
