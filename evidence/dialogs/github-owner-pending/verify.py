"""Audit frozen inert source, the exact pending-only patch, and original TAP bytes."""
import gzip
import hashlib
import json
from pathlib import Path
import re
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
packet = json.loads((HERE / "source.json").read_text())
sha = lambda body: hashlib.sha256(body).hexdigest()
for span in packet["spans"]:
    body = (HERE / span["path"]).read_bytes()
    assert len(body) == span["bytes"] == span["utf8_half_open"][1] - span["utf8_half_open"][0], span["name"]
    assert sha(body) == span["sha256"], span["name"]
for frozen in packet["frozen"]:
    body = (HERE / frozen["snapshot"]).read_bytes()
    assert len(body) == frozen["bytes"] and sha(body) == frozen["sha256"], frozen["path"]
    if frozen["path"].endswith(".test.ts"):
        assert (ROOT / frozen["path"]).read_bytes() == body, "frozen regression changed"
    else:
        old = b"disabled={!ready || pending}"
        new = b"disabled={!ready}"
        assert body.count(old) == 1
        assert (ROOT / frozen["path"]).read_bytes() == body.replace(old, new), "product change is not the single Owner expression"
was = (HERE / "reference/dialog-was.txt").read_text()
assert "{data:g,isLoading:_,error:v,refetch:x}=Ros()" in was
assert "disabled:_,children:[ue,be]" in was
assert 'const Ke=c.isPending||!te,Ze=c.isPending?"Creating..."' in was
assert "owner:O,repoPath:i.path,repositoryName:L" in was
assert "onValueChange:I" in was
archive = json.loads((HERE / "raw-red-archive.json").read_text())
packed = (HERE / archive["file"]).read_bytes()
red = gzip.decompress(packed)
assert sha(packed) == archive["gzip_sha256"]
assert sha(red) == archive["raw_sha256"] and len(red) == archive["raw_bytes"]
red_text = red.decode()
failures = re.findall(r"^not ok \d+ - (.+)$", red_text, re.M)
assert failures == packet["expected_red"], failures
for filename, expected_pass in [(None, 7), ("treatment.tap", 9), ("adjacent-baseline.tap", 19), ("adjacent-treatment.tap", 19)]:
    text = red_text if filename is None else (HERE / filename).read_text()
    assert re.search(rf"^# pass {expected_pass}$", text, re.M), filename
    assert re.search(rf"^# fail {2 if filename is None else 0}$", text, re.M), filename
    assert not re.search(r"^# (?:cancelled|skipped) [1-9]", text, re.M), filename
# Supplying retained raw assets additionally proves every literal span against
# its original member. Without them this verifies the self-contained locked packet.
if len(sys.argv) > 1:
    assert len(sys.argv) == 3
    assets = dict(zip(["renderer", "index"], [Path(path).read_bytes() for path in sys.argv[1:]]))
    for name, body in assets.items():
        assert sha(body) == packet["assets"][name]["sha256"]
    for span in packet["spans"]:
        start, end = span["utf8_half_open"]
        assert assets[span["asset"]][start:end] == (HERE / span["path"]).read_bytes()
print(json.dumps({"result": "PASS", "spans": len(packet["spans"]), "frozen_test_unchanged": True, "product": "exact one-expression patch", "baseline": "7 pass / 2 intended failures", "treatment": "9/9 pass", "adjacent_before_after": "19/19 pass", "original_assets_checked": len(sys.argv) == 3}))
