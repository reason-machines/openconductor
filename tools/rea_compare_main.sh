#!/usr/bin/env bash
# Reproduce evidence/parity/chat-diff-pr/rea-compare-summary.json:
# REA analyze-javascript-application on a clean export of a git ref, then
# REA compare-application-versions against the Conductor frontend Evidence.
#
# Needs REA (npm rea-agents >= 6.8.0) on PATH, python3, ~1 GB free in $WORK
# and ~6 GB RAM (the Conductor Evidence is 213 MB uncompressed).
# Usage: tools/rea_compare_main.sh [git-ref]   (default origin/main)
set -euo pipefail
ref="${1:-origin/main}"
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work="${WORK:-${TMPDIR:-/tmp}/rea-compare-main}"
out="$repo/evidence/parity/chat-diff-pr/rea-compare-summary.json"
rm -rf "$work" && mkdir -p "$work/tree"
git -C "$repo" archive "$ref" | tar -x -C "$work/tree"
commit="$(git -C "$repo" rev-parse "$ref")"

rea analyze-javascript-application "$work/tree" --detail summary \
  --evidence_output "$work/right.bundle.json" --format json > "$work/right.summary.json"
gunzip -c "$repo/evidence/frontend/rea-analyze-javascript-application.json.gz" > "$work/left.json"

python3 - "$work" <<'EOF'
import json, sys
w = sys.argv[1]
right = json.load(open(f"{w}/right.bundle.json"))["records"][0]
left = json.load(open(f"{w}/left.json"))
json.dump({"left": left, "right": right}, open(f"{w}/input.json", "w"))
EOF
NODE_OPTIONS="--max-old-space-size=6000" rea compare-application-versions "$work/input.json" \
  --format json > "$work/compare.json"

python3 - "$work" "$commit" "$out" "$(rea --version 2>/dev/null | tail -1)" <<'EOF'
import json, sys
w, commit, out, ver = sys.argv[1:5]
o = json.load(open(f"{w}/compare.json")); nr = o["normalized_result"]
keys = ("relevant_files", "parsed_javascript_files", "visited_ast_nodes", "findings")
ls = json.load(open(f"{w}/left.json"))["normalized_result"]["statistics"]
rs = json.load(open(f"{w}/right.bundle.json"))["records"][0]["normalized_result"]["statistics"]
json.dump({
  "tool": "rea compare-application-versions", "rea_version": ver,
  "evidence_id": o["evidence_id"], "comparison_id": nr["comparison_id"],
  "left_evidence_id": nr["left"]["evidence_id"], "left_graph_id": nr["left"]["graph_id"],
  "left_subject": "Conductor.app v0.87.6 embedded frontend (dist)",
  "right_evidence_id": nr["right"]["evidence_id"], "right_graph_id": nr["right"]["graph_id"],
  "right_commit": commit, "right_subject": "reason-machines/openconductor (git archive)",
  "summary": nr["summary"], "matching": nr["matching"],
  "left_statistics": {k: ls[k] for k in keys}, "right_statistics": {k: rs[k] for k in keys},
}, open(out, "w"), indent=1)
print(out)
EOF
