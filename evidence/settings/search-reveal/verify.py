"""Conductor Rebuild: verify inert reference, frozen regression and bounded repair."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--renderer", type=Path, help="Already-retained original renderer (never executed)")
args = parser.parse_args()
root = Path(__file__).resolve().parents[3]
evidence = Path(__file__).resolve().parent
checks = 0


def check(condition, message):
    global checks
    if not condition:
        raise AssertionError(message)
    checks += 1


def sha(data):
    return hashlib.sha256(data).hexdigest()


def blob(revision, path):
    return subprocess.check_output(["git", "show", f"{revision}:{path}"], cwd=root)


packet = json.loads((evidence / "source-closure.json").read_text())
fresh = json.loads((evidence / "fresh-main.json").read_text())
check(not packet["missing"], "complete retained declaration set")
check(len(packet["spans"]) == 16, "sixteen full retained declarations")
for span in packet["spans"]:
    data = span["text"].encode()
    check(sha(data) == span["sha256"], f"span hash {span['label']}")
    start, end = span["utf8_half_open"]
    check(len(data) == span["bytes"] == end - start, f"span range {span['label']}")
if args.renderer:
    original = args.renderer.read_bytes()
    check(len(original) == packet["asset"]["bytes"], "whole original length")
    check(sha(original) == packet["asset"]["sha256"], "whole original digest")
    for span in packet["spans"]:
        start, end = span["utf8_half_open"]
        check(original[start:end] == span["text"].encode(), f"original slice {span['label']}")
else:
    print("NOT_RUN: whole original renderer readback; provide --renderer")

check(len(fresh["sources"]) == len(packet["production"]) == 11, "eleven fresh-main source owners")
for qualified, current in zip(packet["production"], fresh["sources"]):
    path = current["path"]
    check(path == qualified["path"], f"source order {path}")
    main_bytes = blob(fresh["main"], path)
    check(sha(main_bytes) == current["sha256"] == qualified["sha256"], f"main identity {path}")
    if path != "src/settings/SettingsView.tsx":
        check((root / path).read_bytes() == main_bytes, f"read-only owner {path}")

baseline_bytes = (evidence / "baseline-SettingsView.tsx.txt").read_bytes()
check(baseline_bytes == blob(fresh["main"], "src/settings/SettingsView.tsx"), "preserved exact baseline")
baseline = baseline_bytes.decode()
treatment = (root / "src/settings/SettingsView.tsx").read_text()
start = "export function scrollToRow("
end = "/** Settings' Back opens"
before_prefix, before_body = baseline.split(start, 1)
after_prefix, after_body = treatment.split(start, 1)
before_helper, before_suffix = before_body.split(end, 1)
after_helper, after_suffix = after_body.split(end, 1)
check(before_prefix == after_prefix and before_suffix == after_suffix, "only exported helper body changed")
old = '    if (label) label.scrollIntoView({ block: "start" });\n    else if (tries > 0) scrollToRow(title, tries - 1);'
new = '''    if (label) {
      label.scrollIntoView({ block: "center" });
      const frame = label.querySelector(":scope > [data-reveal-frame]") ?? label;
      if (typeof frame.animate === "function") {
        frame.animate([
          { outline: "2px solid var(--ring)", outlineOffset: "8px", offset: 0 },
          { outline: "2px solid var(--ring)", outlineOffset: "8px", offset: 0.55 },
          { outline: "2px solid transparent", outlineOffset: "8px" },
        ], { duration: 1400, easing: "ease-out" });
      }
    } else if (tries > 0) scrollToRow(title, tries - 1);'''
check(before_helper.count(old) == 1, "one exact old helper seam")
check(after_helper == before_helper.replace(old, new), "smallest exact treatment; selectors/retry preserved")

fixture = (evidence / "reveal.test.cjs").read_bytes()
check(sha(fixture) == "c28e05ab904e4349c9aca2de423e5ecfec8d3645e8ace1535391953384c34cc0", "unchanged frozen fixture")
check((evidence / "fixture.sha256").read_text().split()[0] == sha(fixture), "original freeze receipt")
red = (evidence / "red-fresh-main.tap").read_text()
check("# tests 10\n" in red and "# pass 3\n" in red and "# fail 7\n" in red, "intended baseline 3P/7F")
check(red.count("code: 'ERR_ASSERTION'") == 7, "all seven failures are assertions")
for name, count in [("green.tap", 10), ("adjacent-before.tap", 41), ("adjacent-after.tap", 56)]:
    log = (evidence / name).read_text()
    check(f"# tests {count}\n" in log and f"# pass {count}\n" in log and "# fail 0\n" in log, f"passing receipt {name}")
    check(all(f"# {kind} 0\n" in log for kind in ["cancelled", "skipped", "todo"]), f"complete receipt {name}")
lint = (evidence / "lint-colors.log").read_text()
check("# pass 6\n" in lint and "check-colors: no colour literals outside src/theme/" in lint, "color lint and source scan passed")
subprocess.run(["git", "diff", "--check"], cwd=root, check=True)
check(True, "diff whitespace")
print(f"PASS: {checks} source/freeze/fresh-main/scope/receipt checks")
