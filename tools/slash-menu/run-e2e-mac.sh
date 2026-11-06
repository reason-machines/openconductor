#!/usr/bin/env bash
# The composer's "/" menu with the real agents in the built OpenConductor app
# on a Mac: the user's signed-in `claude`, `codex` and `reason` CLIs. Drives
# the real window through the debug-only seam (src-tauri/src/e2e.rs +
# tools/slash-menu/e2e-driver.js): add a fixture repo that carries a
# harmless fixture skill, create a workspace, then for Reason, Claude Code and
# Codex open "/", filter it, pick a skill with Enter and send it as a turn.
# Writes slash-menu.json, the per-agent DOM captures and app.log to OUT.
#
# Usage: tools/slash-menu/run-e2e-mac.sh OUT [APP]
#   APP defaults to the debug bundle scripts/package-macos.sh builds.
set -euo pipefail
cd "$(dirname "$0")/../.."
out=${1:?usage: run-e2e-mac.sh OUT [APP]}
app=${2:-src-tauri/target/debug/bundle/macos/OpenConductor.app}
mkdir -p "$out" && out=$(cd "$out" && pwd)
exe="$app/Contents/MacOS/openconductor"
[[ -x $exe ]] || { echo "no app at $app (build with scripts/package-macos.sh)" >&2; exit 1; }

# Versions of the CLIs the app will find (no account details).
{
  for c in claude codex reason; do
    p=$(command -v "$c" || true)
    for d in "$HOME/.local/bin" /opt/homebrew/bin /usr/local/bin; do [[ -z $p && -x $d/$c ]] && p=$d/$c; done
    printf '%s: %s %s\n' "$c" "${p:-missing}" "$([[ -n $p ]] && "$p" --version 2>/dev/null | head -1)"
  done
} > "$out/cli.txt"

# Fixture: a clone with an origin, one commit, and the fixture skill where
# Claude Code (.claude/skills) and Codex (.agents/skills) look for repo skills.
name="slash-e2e-$(date +%s)"
fixture="$out/fixture"
rm -rf "$fixture" && mkdir -p "$fixture"
git init -q --bare -b main "$fixture/origin.git"
git clone -q "$fixture/origin.git" "$fixture/$name" 2>/dev/null
skill='---
name: oc-fixture-skill
description: OpenConductor e2e fixture skill. Replies with one marker line and does nothing else.
---

When this skill is invoked, reply with exactly one line: OC-FIXTURE-SKILL-RAN followed by a space and the arguments you were given. Do not run tools, read files or change anything.
'
for d in .claude/skills .agents/skills; do
  mkdir -p "$fixture/$name/$d/oc-fixture-skill"
  printf '%s' "$skill" > "$fixture/$name/$d/oc-fixture-skill/SKILL.md"
done
printf '# %s\n\nFixture for the OpenConductor "/" menu e2e run.\n' "$name" > "$fixture/$name/README.md"
git -C "$fixture/$name" add -A
git -C "$fixture/$name" -c user.name=e2e -c user.email=e2e@example.invalid commit -qm init
git -C "$fixture/$name" push -q origin HEAD:main

python3 - "$fixture/$name" "$name" > "$out/driver.js" <<'PY'
import json, sys
repo, name = sys.argv[1], sys.argv[2]
agents = [
    # Reason's skills are the Workspace's (reason skills list); "bro" only restates a message.
    {"id": "reason", "label": None, "filter": "bro", "skill": "bro", "args": "The deploy failed because the TLS certificate expired on Sunday.", "timeoutMs": 300000},
    {"id": "codex", "label": "Codex", "filter": "oc-fix", "skill": "oc-fixture-skill", "args": "codex-e2e", "expect": "OC-FIXTURE-SKILL-RAN"},
    {"id": "claude", "label": "Claude Code", "filter": "oc-fix", "skill": "oc-fixture-skill", "args": "claude-e2e", "expect": "OC-FIXTURE-SKILL-RAN"},
]
print("window.__OC_E2E__ = " + json.dumps({"repo": repo, "repoName": name, "agents": agents}) + ";")
PY
cat tools/slash-menu/e2e-driver.js >> "$out/driver.js"

rm -f "$out"/slash-menu*.json "$out"/slash-dom-*.json
OC_E2E_SCRIPT="$out/driver.js" OC_E2E_OUT="$out" "$exe" > "$out/app.log" 2>&1 &
pid=$!
echo "$pid" > "$out/app.pid"
for _ in $(seq 1 1500); do
  [[ -f $out/slash-menu.json ]] && break
  kill -0 "$pid" 2>/dev/null || break
  sleep 1
done
kill "$pid" 2>/dev/null || true
wait "$pid" 2>/dev/null || true
[[ -f $out/slash-menu.json ]] || { echo "no report; see $out/app.log" >&2; exit 1; }
python3 -c 'import json,sys; r=json.load(open(sys.argv[1])); print(r["result"]); [print(a["id"], a.get("menu",{}).get("count"), a.get("ran"), a.get("error","")[:200]) for a in r["agents"]]' "$out/slash-menu.json"
