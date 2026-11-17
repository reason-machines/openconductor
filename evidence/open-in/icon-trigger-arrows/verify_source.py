"""Verify retained source and fixture integrity; never execute reference code."""

import hashlib
import json
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = Path(__file__).resolve().parent


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def main():
    source = json.loads((EVIDENCE / "source.json").read_text())
    binding = json.loads((EVIDENCE / "fresh-main-binding.json").read_text())
    for span in source["spans"]:
        raw = (EVIDENCE / span["path"]).read_bytes()
        assert len(raw) == span["end_utf8_byte"] - span["start_utf8_byte"], span["symbol"]
        assert digest(raw) == span["sha256"], span["symbol"]
    baseline = subprocess.check_output([
        "git", "show", binding["main_checked"] + ":src/features/openIn/OpenInButton.tsx"
    ], cwd=ROOT)
    assert digest(baseline) == binding["baseline_product_sha256"]
    product = (ROOT / "src/features/openIn/OpenInButton.tsx").read_bytes()
    assert digest(product) in {
        binding["baseline_product_sha256"], binding["candidate_product_sha256"]
    }
    fixture = (ROOT / "src/features/openIn/iconMenuTriggerArrows.test.ts").read_bytes()
    assert digest(fixture) == binding["fixture_sha256"]
    subprocess.run(["git", "diff", "--check"], cwd=ROOT, check=True)
    print(json.dumps({
        "status": "PASS_SOURCE_INTEGRITY_ONLY",
        "main_checked": binding["main_checked"],
        "retained_spans_verified": len(source["spans"]),
        "fixture_sha256": digest(fixture),
        "product": "baseline" if product == baseline else "candidate",
        "behavior_browser_native_package": "NOT_EVALUATED_BY_THIS_CHECK",
    }, indent=2))


if __name__ == "__main__":
    main()
