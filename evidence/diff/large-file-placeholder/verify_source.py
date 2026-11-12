from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[3]
PACKET = Path(__file__).resolve().parent
source = json.loads((PACKET / "source.json").read_text())

for name, expected in source["reference_files"].items():
    assert hashlib.sha256((PACKET / name).read_bytes()).hexdigest() == expected, name
for name, expected in source["fixtures"].items():
    assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == expected, name

producer = (PACKET / "reference/reference-index-producer.txt").read_text()
renderer = (PACKET / "reference/reference-Mqo.txt").read_text()
selected = (PACKET / "reference/reference-Jqo.txt").read_text()
checks = {
    "limits": "const Em=1024*1024,_Lt=10*1024*1024,wLt=5*1024*1024,SLt=500" in producer,
    "ceiling": "if(S>wLt)return!1" in producer,
    "sparse": "k!==void 0&&k<=SLt" in producer,
    "worktree_stat": "if(a?.exists&&a.size!==void 0&&a.size>Em&&!await r(a.size))" in producer,
    "changed_lines": "gitArgs:`diff --numstat ${c} -- ${l}`" in (PACKET / "reference/reference-index-gitHistory-producer.txt").read_text(),
    "renderer_order": renderer.index("if(i?.hideReason)") < renderer.index("p.jsx($Vo"),
    "placeholder": 'case tn.FileTooLarge:return"File too large to display"' in producer,
    "selection": "filePath:He.path,fileDiff:He" in selected,
}
assert all(checks.values()), checks
cases = json.loads((PACKET / "cases.json").read_text())
assert len(cases) == 8
assert sum(case["hidden"] for case in cases) == 4
assert sum(not case["hidden"] for case in cases) == 4
for case in cases:
    expected = not case["binary"] and case["bytes"] > 1048576 and (
        case["bytes"] > 5242880 or case["changed_lines"] > 500
    )
    assert case["hidden"] == expected, case["name"]
print(json.dumps({
    "result": "SOURCE_AND_FROZEN_FIXTURE_PINS_PASS",
    "baseline_main": source["baseline_main"],
    "reference_files": len(source["reference_files"]),
    "fixtures": len(source["fixtures"]),
    "source_checks": len(checks),
    "cases": len(cases),
    "behavioral_execution": "NOT_PERFORMED_BY_THIS_CHECK",
}))
