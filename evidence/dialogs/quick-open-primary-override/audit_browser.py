#!/usr/bin/env python3
"""Audit preserved browser observations; never launches a browser or service."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
records = [json.loads(line) for line in (ROOT / "browser-readbacks.ndjson").read_text().splitlines()]
cases = {
    "default-primary", "custom-primary", "removed-default", "plain-enter",
    "additional-primary", "physical-primary", "navigation-click", "empty-primary",
}
assert len(records) == 16
summary = {}
for build in ("baseline", "treatment"):
    group = [record for record in records if record["build"] == build]
    assert len(group) == 8 and {record["case"] for record in group} == cases
    results = []
    for record in group:
        witness, case = record["witness"], record["case"]
        assert witness["ready"] and witness["errors"] == []
        assert len(witness["events"]) == 1
        event = witness["events"][0]
        assert event["trusted"] and event["tag"] == "INPUT" and event["type"] == "keydown"
        assert witness["searches"] == [{"path": "/synthetic", "query": "", "excludeDirectories": True}]
        if case == "empty-primary":
            assert witness["opens"] == [] and witness["closed"] == 0
            settled = record["settled"]
            assert len(settled) == 1 and settled[0]["trusted"] and settled[0]["cancelable"]
            assert settled[0]["key"] == "d" and settled[0]["code"] == "KeyD"
            passed = settled[0]["defaultPrevented"]
        else:
            mode = "file" if case in {"removed-default", "plain-enter", "navigation-click"} else "diff"
            path = "src/second.ts" if case == "navigation-click" else "src/first.ts"
            passed = witness["opens"] == [{"path": path, "mode": mode}] and witness["closed"] == 1
        results.append({"case": case, "pass": passed})
    expected_failures = set() if build == "treatment" else {
        "custom-primary", "removed-default", "additional-primary", "physical-primary", "empty-primary",
    }
    assert {result["case"] for result in results if not result["pass"]} == expected_failures
    summary[build] = {"passed": sum(result["pass"] for result in results), "total": 8, "results": results}
cleanup = json.loads((ROOT / "browser-cleanup.json").read_text())
assert cleanup["releasedAt"] < cleanup["deadline"]
assert cleanup["tabs"] == [] and cleanup["ownServerProcesses"] == []
assert cleanup["preview"] == "stopped" and cleanup["listening"] is None
assert cleanup["previewStopProcessGroupEnded"] and cleanup["independentNamespaceBind"] == "PASS"
print(json.dumps({"status": "PASS", "observations": summary, "cleanup": "PASS"}, indent=2))
