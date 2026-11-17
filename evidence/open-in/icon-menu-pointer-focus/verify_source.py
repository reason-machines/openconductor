"""Verify retained source bytes without importing or executing application code."""

import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess


ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = Path(__file__).resolve().parent


def sha256(raw):
    return hashlib.sha256(raw).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--renderer", type=Path)
    args = parser.parse_args()
    binding = json.loads((EVIDENCE / "source-binding.json").read_text())
    reference = json.loads((EVIDENCE / "reference.json").read_text())
    product_path = binding["product_path"]
    baseline = subprocess.check_output(
        ["git", "show", binding["main_checked"] + ":" + product_path], cwd=ROOT
    )
    assert sha256(baseline) == binding["baseline_sha256"]
    candidate = (ROOT / product_path).read_bytes()
    assert sha256(candidate) == binding["candidate_sha256"]
    restored = candidate.decode()
    start = restored.index("  const onRowMouseMove =")
    end = restored.index("  const mainLabel =", start)
    restored = restored[:start] + restored[end:]
    restored = restored.replace(", type MouseEvent as ReactMouseEvent", "")
    restored = restored.replace(" onMouseMove={split ? undefined : onRowMouseMove}", "")
    assert restored.encode() == baseline
    fixture = (ROOT / binding["fixture_path"]).read_bytes()
    assert sha256(fixture) == binding["fixture_sha256"]
    spec_raw = (EVIDENCE / "behavior-spec.json").read_bytes()
    assert sha256(spec_raw) == binding["behavior_spec_sha256"]
    spec = json.loads(spec_raw)
    names = re.findall(r'^test\("([^"]+)"', fixture.decode(), re.M)
    assert names == [case["name"] for case in spec["cases"]]
    assert len(names) == 12
    original14 = (ROOT / "src/features/openIn/iconMenuEndpoints.test.ts").read_bytes()
    assert sha256(original14) == binding["original14_sha256"]
    for span in reference["spans"]:
        raw = (EVIDENCE / span["path"]).read_bytes()
        assert sha256(raw) == span["sha256"], span["symbol"]
        assert len(raw) == span["end_utf8_byte"] - span["start_utf8_byte"]
    renderer_verified = False
    if args.renderer:
        renderer = args.renderer.read_bytes()
        assert len(renderer) == reference["asset"]["bytes"]
        assert sha256(renderer) == reference["asset"]["sha256"]
        for span in reference["spans"]:
            assert renderer[span["start_utf8_byte"]:span["end_utf8_byte"]] == (
                EVIDENCE / span["path"]
            ).read_bytes(), span["symbol"]
        renderer_verified = True
    subprocess.run(["git", "diff", "--check"], cwd=ROOT, check=True)
    print(json.dumps({
        "status": "PASS_SOURCE_ONLY",
        "main_checked": binding["main_checked"],
        "candidate_sha256": binding["candidate_sha256"],
        "fixture_sha256": binding["fixture_sha256"],
        "retained_spans_verified": len(reference["spans"]),
        "full_renderer_verified": renderer_verified,
        "fixture_cases_declared_not_executed": len(names),
        "application_tests_typecheck_build_browser_native_package": "NOT_RUN",
    }, indent=2))


if __name__ == "__main__":
    main()
