#!/usr/bin/env bash
# Real Claude Code turns in the built OpenConductor app on a Mac, under the
# Claude Code auth modes that need no key: the import path (an existing
# Claude Code login, nothing set in OpenConductor) and the CLI card (Claude
# subscription login). Drives the window through the debug-only seam
# (src-tauri/src/e2e.rs + tools/claude-code/auth-modes-driver.js).
#
# The app runs with a throwaway HOME: no OpenConductor data, the account
# fields of ~/.claude.json (oauthAccount, hasCompletedOnboarding, userID),
# the installed `claude` in ~/.local/bin, and a symlink to ~/Library/Keychains.
# On macOS the Keychain search list follows HOME, and Claude Code keeps its
# login in the login Keychain ("Claude Code-credentials"), so without that
# link a fresh HOME has no login at all. Nothing is copied out of the
# Keychain and the real ~/.claude is not touched.
#
# A stale ANTHROPIC_API_KEY is set in the app's environment: a turn only
# succeeds on the subscription login if the app clears it.
#
# Usage: tools/claude-code/run-auth-modes-mac.sh OUT [APP]
set -euo pipefail
cd "$(dirname "$0")/../.."
out=${1:?usage: run-auth-modes-mac.sh OUT [APP]}
app=${2:-src-tauri/target/debug/bundle/macos/OpenConductor.app}
mkdir -p "$out" && out=$(cd "$out" && pwd)
exe="$app/Contents/MacOS/openconductor"
[[ -x $exe ]] || { echo "no app at $app (build with scripts/package-macos.sh)" >&2; exit 1; }

claude=""
for c in "$HOME/.local/bin/claude" "$HOME/.claude/local/claude" /opt/homebrew/bin/claude /usr/local/bin/claude; do
  [[ -x $c ]] && { claude=$c; break; }
done
[[ -n $claude ]] || { echo "claude CLI not found" >&2; exit 1; }

home=$(mktemp -d "${TMPDIR:-/tmp}/oc-claude-auth.XXXXXX")
trap 'rm -rf "$home"' EXIT
mkdir -p "$home/.local/bin" "$home/Library"
ln -s "$claude" "$home/.local/bin/claude"
ln -s "$HOME/Library/Keychains" "$home/Library/Keychains"
python3 - "$HOME/.claude.json" "$home/.claude.json" <<'PY'
import json, sys
src = json.load(open(sys.argv[1]))
json.dump({k: src[k] for k in ("oauthAccount", "hasCompletedOnboarding", "userID") if k in src}, open(sys.argv[2], "w"))
PY
chmod 600 "$home/.claude.json"

# What Claude Code itself reports in the throwaway HOME (sign-in state only).
HOME=$home "$claude" auth status 2>/dev/null \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print(json.dumps({k: d.get(k) for k in ("loggedIn","authMethod","apiProvider","subscriptionType")}))' \
  > "$out/cli-auth.json"
"$claude" --version > "$out/cli-version.txt" 2>/dev/null || true

name="claude-auth-$(date +%s)"
fixture="$home/fixture"
mkdir -p "$fixture"
git init -q --bare -b main "$fixture/origin.git"
git clone -q "$fixture/origin.git" "$fixture/$name" 2>/dev/null
printf '# %s\n' "$name" > "$fixture/$name/README.md"
git -C "$fixture/$name" add README.md
git -C "$fixture/$name" -c user.name=e2e -c user.email=e2e@example.invalid commit -qm init
git -C "$fixture/$name" push -q origin HEAD:main

python3 - "$fixture/$name" "$name" > "$out/driver.js" <<'PY'
import json, sys
repo, name = sys.argv[1], sys.argv[2]
modes = [
    {"id": "import", "prompt": "Reply with exactly: oc-import-ok", "expect": "oc-import-ok"},
    {"id": "subscription", "card": "CLI", "prompt": "Reply with exactly: oc-subscription-ok", "expect": "oc-subscription-ok"},
]
print("window.__OC_E2E__ = " + json.dumps({"repo": repo, "repoName": name, "modes": modes}) + ";")
PY
cat tools/claude-code/auth-modes-driver.js >> "$out/driver.js"

rm -f "$out/claude-auth-modes.json"
HOME=$home ANTHROPIC_API_KEY=sk-ant-e2e-stale-shell-key \
  OPENCONDUCTOR_AGENT_BINARY_MANIFEST="$PWD/tools/e2e/no-agent-binaries.json" \
  OC_E2E_SCRIPT="$out/driver.js" OC_E2E_OUT="$out" "$exe" > "$out/app.log" 2>&1 &
pid=$!
for _ in $(seq 1 600); do
  [[ -f $out/claude-auth-modes.json ]] && break
  kill -0 "$pid" 2>/dev/null || break
  sleep 1
done
kill "$pid" 2>/dev/null || true
wait "$pid" 2>/dev/null || true
[[ -f $out/claude-auth-modes.json ]] || { echo "no report; see $out/app.log" >&2; exit 1; }
python3 - "$out/claude-auth-modes.json" <<'PY'
import json, sys
r = json.load(open(sys.argv[1]))
for m in r["modes"]:
    t = m["turn"]
    print(f'{m["id"]}: card={m["tab"]["card"]} connected={m["tab"]["connected"]} loginPrompt={m["tab"]["loginPrompt"]} stored={m["tab"]["stored"]} turn={t["status"]} reply={t["reply"]!r} ({t["seconds"]}s)')
print("error:", r.get("error")) if r.get("error") else None
print(r["result"])
PY
