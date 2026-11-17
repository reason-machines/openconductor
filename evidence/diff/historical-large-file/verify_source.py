from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    source = json.loads((HERE / "source.json").read_text())
    for name, pin in source["spans"].items():
        path = HERE / "reference" / f"reference-{name}.txt"
        assert digest(path) == pin["sha256"], path
        assert path.stat().st_size == pin["utf8_half_open"][1] - pin["utf8_half_open"][0], path
    for path, pin in source["baseline"].items():
        assert digest(HERE / pin["snapshot"]) == pin["sha256"], path
    for path, expected in source["frozen_files"].items():
        assert digest(ROOT / path) == expected, path
    fixture = (ROOT / source["fixture"]["path"]).read_text()
    assert fixture.count("historical_case!(") == 8
    assert "const CASES: [Case; 8]" in fixture
    registration = (ROOT / "src-tauri/src/diff/git_tests.rs").read_text()
    assert registration.count('#[path = "historical_large_file_tests.rs"]') == 1
    assert "mod historical_large_file_placeholder;" in registration
    loader = (HERE / "reference/reference-loader.txt").read_text()
    assert "_=Math.max(m,v)" in loader
    assert "p.encode(u).byteLength" in loader and "p.encode(d).byteLength" in loader
    assert "if(S>wLt)return!1" in loader
    assert 'case"commit":return{fromRef:`${e.viewMode.commitHash}^`,toRef:e.viewMode.commitHash}' in loader
    assert "ref:s.fromRef,filePath:e.oldPath??e.filePath" in loader
    print(json.dumps({"status": "PASS", "main": source["inspected_main"], "rea_spans": len(source["spans"]), "frozen_cases": 8, "expected_red": 4, "controls": 4, "behavior": "NOT_RUN"}))

if __name__ == "__main__":
    main()
