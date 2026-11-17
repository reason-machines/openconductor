#!/usr/bin/env python3
"""Verify retained bytes, the duration-only treatment and paired execution receipts.

This does not execute Conductor code, React tests, clipboard calls or providers.
"""
import gzip
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
checks = 0


def check(value, label):
    global checks
    assert value, label
    checks += 1


def digest(data):
    return hashlib.sha256(data).hexdigest()


source = json.loads((HERE / "source.json").read_text())
request = json.loads((HERE / "frozen-source-request.json").read_text())
check(source["parent"]["sha256"] == request["parent_sha256"], "parent identity")
check(len(source["spans"]) == 14, "complete retained spans")
by_name = {}
for span in source["spans"]:
    raw = span["text"].encode()
    check(len(raw) == span["end"] - span["start"], span["name"] + " byte extent")
    check(digest(raw) == span["sha256"], span["name"] + " digest")
    by_name[span["name"]] = span["text"]
check('ExitPlanMode:"exit-plan-mode"' in by_name["registry-dispatch"], "plan dispatch")
check('Task:"sub-agent"' in by_name["registry-dispatch"], "task dispatch")
check('"exit-plan-mode":gpo' in by_name["registry"], "plan registry")
check('"sub-agent":bpo' in by_name["registry"], "subagent registry")
check('p.jsx(u,{toolCall:n,toolResult:i' in by_name["hIt"], "normal producer")
check('p.jsx(t0,{text:i,tooltip:"Copy plan"' in by_name["gpo"], "plan copy caller")
check('p.jsx(t0,{text:E,size:"sm"' in by_name["bpo"], "subagent copy caller")
check('setTimeout(()=>_(!1),2e3)' in by_name["t0"], "reference 2000ms timeout")
check('await navigator.clipboard.writeText(t)' in by_name["l1"], "clipboard fulfillment")

pins = {entry["path"]: entry for entry in request["baseline"]}
old = (HERE / "baseline/ToolRows.tsx.txt").read_bytes()
check(digest(old) == pins["src/features/chat/ToolRows.tsx"]["sha256"], "baseline ToolRows")
before = b"setTimeout(() => setCopied(false), 1500);"
after = b"setTimeout(() => setCopied(false), 2000);"
check(old.count(before) == 1, "single product edit site")
check((REPO / "src/features/chat/ToolRows.tsx").read_bytes() == old.replace(before, after), "only product change is 1500 -> 2000")
for name in ["typedSubagentRawResult.test.ts", "typedSubagentErrorResult.test.ts"]:
    original = (HERE / "baseline" / (name + ".txt")).read_bytes()
    path = "src/features/chat/" + name
    check(digest(original) == pins[path]["sha256"], name + " baseline identity")
    check(original.count(b"assert.equal(delay, 1500") == 1, name + " single deadline")
    check((REPO / path).read_bytes() == original.replace(b"assert.equal(delay, 1500", b"assert.equal(delay, 2000"), name + " every other byte/assertion preserved")
check(digest((REPO / request["fixture"]["path"]).read_bytes()) == request["fixture"]["sha256"], "immutable permanent fixture")
for path in ["src/features/chat/conductorTools.ts", "src/features/chat/toolIconData.ts", "src/features/chat/thinkingChip.ts", "package.json", "package-lock.json"]:
    check(digest((REPO / path).read_bytes()) == pins[path]["sha256"], path + " preserved")
for side, expected_exit, passed, failed in [("red", 1, 4, 4), ("green", 0, 8, 0)]:
    result = json.loads((HERE / "execution" / (side + "-result.json")).read_text())
    log_path = HERE / "execution" / (side + "-output.log" + (".gz" if side == "red" else ""))
    log = gzip.decompress(log_path.read_bytes()) if side == "red" else log_path.read_bytes()
    check(digest(log) == result["output_sha256"], side + " output identity")
    check(result["exit"] == expected_exit, side + " exit")
    check(result["counters"] == {"tests": 8, "suites": 0, "pass": passed, "fail": failed, "cancelled": 0, "skipped": 0, "todo": 0}, side + " exact counters")
    check(len(result["outcomes"]) == 8, side + " outcomes")
    check(result["no_node_npm_survivor"], side + " release")
    check(result["pins_unchanged"], side + " pin stability")
red = json.loads((HERE / "execution/red-result.json").read_text())
check(red["markers"] == {"TOOL_COPY_RESET_MUST_NOT_FIRE_AT_1500": 2, "TOOL_COPY_FIRST_RESET_MUST_WAIT_UNTIL_2000": 2}, "only intended RED markers")
check(json.loads((HERE / "execution/green-result.json").read_text())["fixture_sha256"] == request["fixture"]["sha256"], "paired identical fixture")
manifest = HERE / "SHA256SUMS"
if manifest.exists():
    for line in manifest.read_text().splitlines():
        expected, path = line.split("  ", 1)
        check(digest((HERE / path).read_bytes()) == expected, path + " evidence identity")
print(f"PASS: {checks} static source/custody/treatment/execution checks; no runtime behavior exercised")
