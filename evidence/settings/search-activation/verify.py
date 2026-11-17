"""Verify retained source spans, frozen regression and decisive baseline (inert data)."""
import gzip
import hashlib
import json
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[3]
packet = Path(__file__).resolve().parent
checks = []


def check(condition, label):
    if not condition:
        raise AssertionError(label)
    checks.append(label)


def digest(data):
    return hashlib.sha256(data).hexdigest()


reference = json.loads((packet / "reference.json").read_text())
check(reference["main"] == "2ada6e3e186391695cae1ce5694ac251a6323079", "qualification main pin")
check(len(reference["spans"]) == 22, "complete retained span count")
for span in reference["spans"]:
    data = span["text"].encode()
    start, end = span["utf8_half_open"]
    check(len(data) == span["bytes"] == end - start, "span byte range " + span["label"])
    check(digest(data) == span["sha256"], "span hash " + span["label"])
asset_path = root / reference["asset"]["path"]
if asset_path.exists():
    data = asset_path.read_bytes()
    check(len(data) == reference["asset"]["bytes"], "whole retained renderer size")
    check(digest(data) == reference["asset"]["sha256"], "whole retained renderer hash")
    for span in reference["spans"]:
        start, end = span["utf8_half_open"]
        check(data[start:end] == span["text"].encode(), "span original bytes " + span["label"])
else:
    print("Whole renderer rehash NOT RUN: retained original asset absent; exact spans/hashes still checked.")
check(digest((packet / "activation.test.cjs").read_bytes()) == "50da45b6a2f39eefb42652dada3ab38e403d438efb7bda102bb8ab914eaa12b5", "frozen decisive fixture")
check(digest((packet / "baseline-SettingsView.tsx.txt").read_bytes()) == "b724a4d77e6d0d7b34d4ddead14e30ef7bf682610df6b8b31abf83034c39c0dc", "unchanged baseline SettingsView")
for source in reference["production"]:
    data = subprocess.check_output(["git", "show", reference["main"] + ":" + source["path"]], cwd=root)
    check(digest(data) == source["sha256"], "qualification main source " + source["path"])
baseline = gzip.decompress((packet / "baseline.tap.gz").read_bytes()).decode()
check("# pass 4\n# fail 5\n" in baseline, "decisive baseline 4 pass / 5 intended failures")
check(baseline.count("ERR_ASSERTION") == 5, "only intended baseline assertion failures")
check("TypeError" not in baseline and "ReferenceError" not in baseline, "no decisive harness errors")
rejected = (packet / "harness-v1.tap").read_text()
check("# pass 0\n# fail 9\n" in rejected and "reading 'single'" in rejected, "preserved rejected interop harness")
check((packet / "activation.v1.harness-rejected.cjs").read_text().replace("jsx:ts.JsxEmit.ReactJSX}", "jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}") == (packet / "activation.test.cjs").read_text(), "harness correction interop only")
adjacent = (packet / "adjacent.tap").read_text()
check("# tests 31\n" in adjacent and "# pass 31\n# fail 0\n" in adjacent, "adjacent 31/31")
check("search-activation/activation.test.cjs" in (root / "src/settings/settingsSearchActivation.test.ts").read_text(), "test entry uses frozen fixture")
green = (packet / "green.tap").read_text()
check("# tests 9\n" in green and "# pass 9\n# fail 0\n" in green, "unchanged fixture 9/9 green")
adjacent_green = (packet / "adjacent-green.tap").read_text()
check("# tests 31\n" in adjacent_green and "# pass 31\n# fail 0\n" in adjacent_green, "adjacent after repair 31/31")
print(f"PASS: {len(checks)} evidence checks")
