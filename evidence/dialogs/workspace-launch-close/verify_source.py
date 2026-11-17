from pathlib import Path
import hashlib
import json
import subprocess


ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = Path(__file__).resolve().parent


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    retained = json.loads((EVIDENCE / "retained-source.json").read_text())
    qualified = json.loads((EVIDENCE / "current-main.json").read_text())
    main_sha = subprocess.check_output(["git", "rev-parse", "origin/main"], cwd=ROOT, text=True).strip()
    parents = {}
    for asset in retained["assets"]:
        data = (ROOT / asset["parent"]).read_bytes()
        assert len(data) == asset["bytes"], asset["asset"]
        assert sha(data) == asset["sha256"], asset["asset"]
        parents[asset["asset"]] = data
    for span in retained["spans"]:
        data = (EVIDENCE / span["path"]).read_bytes()
        start, end = span["utf8_half_open"]
        assert len(data) == span["bytes"] and sha(data) == span["sha256"], span["path"]
        assert parents[span["asset"]][start:end] == data, span["name"]
    for source in qualified["sources"]:
        data = subprocess.check_output(["git", "show", f"{main_sha}:{source['path']}"], cwd=ROOT)
        assert sha(data) == source["sha256"], source["path"]
    for frozen in retained["frozen"]:
        data = (ROOT / frozen["source"]).read_bytes()
        assert len(data) == frozen["bytes"] and sha(data) == frozen["sha256"], frozen["source"]
    original = (EVIDENCE / "create-workspace-dialog.original.mjs").read_bytes()
    candidate = (ROOT / "tests/e2e/create-workspace-dialog.e2e.mjs").read_bytes()
    original_marker = b'test("New workspace: pending creation blocks Escape'
    candidate_marker = b'test("New workspace: accepted launch dismisses'
    assert original_marker in original and candidate_marker in candidate
    assert original.split(original_marker)[0] == candidate.split(candidate_marker)[0]
    component = ROOT / "src/components/createWorkspaceLaunchClose.test.ts"
    assert sha(component.read_bytes()) == "60b7fe9e506d7e936a9e9b1cef4127a631f8e44c18a4d29fbcffb9ff3194faf3"
    print(json.dumps({
        "main_sha": main_sha,
        "full_retained_assets_verified": len(parents),
        "reference_spans_verified": len(retained["spans"]),
        "current_main_sources_unchanged": len(qualified["sources"]),
        "frozen_inputs_unchanged": len(retained["frozen"]),
        "original_first_three_browser_cases_identical": True,
        "component_cases_unchanged": 10,
        "target_or_fixture_executed": False,
    }, indent=2))


if __name__ == "__main__":
    main()
