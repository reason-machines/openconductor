#!/usr/bin/env bash
# End-to-end Claude Code chat in the built OpenConductor app on a Mac, with
# the user's signed-in `claude` CLI. Drives the real window through the
# debug-only seam (src-tauri/src/e2e.rs + tools/claude-code/e2e-driver.js):
# add a fixture repo, create a workspace, pick Claude Code, send turns,
# press Stop, then quit. Writes raw results to OUT and a summary with
# tools/claude-code/summarize.py.
#
# Usage: tools/claude-code/run-e2e-mac.sh OUT [APP]
#   APP defaults to the debug bundle scripts/package-macos.sh builds.
set -euo pipefail
cd "$(dirname "$0")/../.."
out=${1:?usage: run-e2e-mac.sh OUT [APP]}
app=${2:-src-tauri/target/debug/bundle/macos/OpenConductor.app}
mkdir -p "$out" && out=$(cd "$out" && pwd)
exe="$app/Contents/MacOS/openconductor"
[[ -x $exe ]] || { echo "no app at $app (build with scripts/package-macos.sh)" >&2; exit 1; }

# The CLI the app will find (same rule as claude_chat::find_claude_cli,
# minus PATH, which a Finder-launched app does not have).
claude=""
for c in "$HOME/.local/bin/claude" "$HOME/.claude/local/claude" /opt/homebrew/bin/claude /usr/local/bin/claude; do
  [[ -x $c ]] && { claude=$c; break; }
done
[[ -n $claude ]] || { echo "claude CLI not found" >&2; exit 1; }
{
  echo "{\"path\": \"$claude\", \"version\": \"$("$claude" --version 2>/dev/null | head -1)\","
  # Only sign-in state; the account's email and ids stay out of the evidence.
  echo "\"auth\": $("$claude" auth status 2>/dev/null | python3 -c 'import json,sys; d=json.load(sys.stdin); print(json.dumps({k: d.get(k) for k in ("loggedIn","authMethod","apiProvider","subscriptionType")}))')}"
} > "$out/cli.json"

# Fixture: a clone with an origin and one commit, so Open project adds it.
name="claude-e2e-$(date +%s)"
fixture="$out/fixture"
rm -rf "$fixture" && mkdir -p "$fixture"
git init -q --bare -b main "$fixture/origin.git"
git clone -q "$fixture/origin.git" "$fixture/$name" 2>/dev/null
printf '# %s\n\nFixture for the OpenConductor Claude Code e2e run.\n' "$name" > "$fixture/$name/README.md"
git -C "$fixture/$name" add README.md
git -C "$fixture/$name" -c user.name=e2e -c user.email=e2e@example.invalid commit -qm init
git -C "$fixture/$name" push -q origin HEAD:main

python3 - "$fixture/$name" "$name" > "$out/driver.js" <<'PY'
import json, sys
repo, name = sys.argv[1], sys.argv[2]
turns = [
    {"text": "Run `pwd` with the Bash tool, then create a file named claude-check.txt containing the single word local in the current folder. Reply with the pwd output only.", "expect": "completed"},
    {"text": "What file did you just create, and what does it contain? Answer in one line.", "expect": "completed"},
    {"text": "Run `sleep 120` with the Bash tool.", "stopOnTool": True, "expect": "cancelled"},
    {"text": "Reply with the single word ok.", "expect": "completed"},
]
print("window.__OC_E2E__ = " + json.dumps({"repo": repo, "repoName": name, "turns": turns}) + ";")
PY
cat tools/claude-code/e2e-driver.js >> "$out/driver.js"

rm -f "$out/claude-turn.json" "$out/claude-chat-events.jsonl"
OC_E2E_SCRIPT="$out/driver.js" OC_E2E_OUT="$out" "$exe" > "$out/app.log" 2>&1 &
pid=$!
echo "$pid" > "$out/app.pid"
for _ in $(seq 1 900); do
  [[ -f $out/claude-turn.json ]] && break
  kill -0 "$pid" 2>/dev/null || break
  sleep 1
done
kill "$pid" 2>/dev/null || true
wait "$pid" 2>/dev/null || true
[[ -f $out/claude-turn.json ]] || { echo "no report; see $out/app.log" >&2; exit 1; }

# What the agent left in the workspace's worktree.
git -C "$fixture/$name" worktree list --porcelain | sed -n 's/^worktree //p' > "$out/worktrees.txt"
python3 tools/claude-code/summarize.py "$out" > "$out/summary.json"
python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["result"])' "$out/summary.json"
