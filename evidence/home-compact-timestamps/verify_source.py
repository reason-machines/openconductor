import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser(description="Verify retained timestamp source without executing JavaScript.")
parser.add_argument("--renderer", type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parent
packet = json.loads((root / "source.json").read_text())
original = args.renderer.read_bytes()
assert hashlib.sha256(original).hexdigest() == packet["reference_asset_sha256"]
verified = 0
for span in packet["spans"]:
    if "source" not in span:
        continue
    actual = original[span["start_utf8"]:span["end_utf8"]]
    assert actual.decode() == span["source"], span["name"]
    assert hashlib.sha256(actual).hexdigest() == span["sha256"], span["name"]
    verified += 1
assert verified == packet["source_spans"] == 19
text = original.decode()
assert text.count("cNr") == 2
assert 'Uae=43200,RVe=1440,CIn=Symbol.for("constructDateFrom")' in text
assert 'Rai={code:"en-US",formatDistance:_Nr,' in text
fixture = root.parents[1] / "src/components/homeCompactTime.test.ts"
assert hashlib.sha256(fixture.read_bytes()).hexdigest() == packet["fixture"]["sha256"]
assert len(packet["witnesses"]) == 6
assert sum(w["reference_source_prediction"] != w["current_source_prediction"] for w in packet["witnesses"]) == 4
print("PASS retained renderer identity, 19 exact source spans, constants and default locale, frozen six-case fixture. JavaScript behavior NOT_RUN.")
