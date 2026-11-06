#!/usr/bin/env bash
# Real agent turns in the built OpenConductor app on a Mac, one per auth mode
# of the agent's Settings › Agents tab, plus the import path (the agent's own
# login, nothing set in OpenConductor). Drives the window through the
# debug-only seam (src-tauri/src/e2e.rs + tools/auth/auth-modes-driver.js).
#
#   claude  import | CLI card (Claude subscription login) | API key card
#   codex   import | ChatGPT card (ChatGPT subscription)  | API key card
#
# Throwaway HOME and data dir: never the user's OpenConductor data. With
# OC_E2E_OUT set the app keeps provider keys in memory, so a key saved in the
# API key card never reaches the login Keychain.
#   claude  the account fields of ~/.claude.json, the installed `claude`, and
#           a symlink to ~/Library/Keychains: Claude Code keeps its login in
#           the login Keychain and the Keychain search list follows HOME.
#           Nothing is copied out of the Keychain; ~/.claude is not touched.
#   codex   ~/.codex/auth.json copied with its refresh token blanked, so the
#           copy can never rotate the user's login out (Codex keeps using the
#           access token); the installed `codex`. ~/.codex is not modified.
#
# API keys are read from 1Password (`op read`) into this process's
# environment only, handed to the app as OC_E2E_SECRET_<NAME> and typed into
# the key field by the driver through e2e_secret, as a user pastes a key.
# Evidence keeps sha256 fingerprints (16 hex); the run fails if a key value
# shows up anywhere under OUT.
#   OC_E2E_ANTHROPIC_OP_REF  op:// reference of an Anthropic API key
#   OC_E2E_OPENAI_OP_REF     op:// reference of an OpenAI API key
# Without one, that API key mode is reported "not run".
#
# A stale key is left in the app's environment (ANTHROPIC_API_KEY or
# OPENAI_API_KEY): a non-key mode only succeeds if the app clears it.
#
# Usage: tools/auth/run-auth-modes-mac.sh claude|codex OUT [APP]
set -euo pipefail
cd "$(dirname "$0")/../.."
agent=${1:?usage: run-auth-modes-mac.sh claude|codex OUT [APP]}
out=${2:?usage: run-auth-modes-mac.sh claude|codex OUT [APP]}
app=${3:-src-tauri/target/debug/bundle/macos/OpenConductor.app}
mkdir -p "$out" && out=$(cd "$out" && pwd)
exe="$app/Contents/MacOS/openconductor"
[[ -x $exe ]] || { echo "no app at $app (build with scripts/package-macos.sh)" >&2; exit 1; }

find_cli() {
  for c in "$HOME/.local/bin/$1" "$HOME/.claude/local/$1" "/opt/homebrew/bin/$1" "/usr/local/bin/$1"; do
    [[ -x $c ]] && { echo "$c"; return; }
  done
  echo "$1 CLI not found" >&2
  exit 1
}

home=$(mktemp -d "${TMPDIR:-/tmp}/oc-auth-$agent.XXXXXX")
trap 'rm -rf "$home"' EXIT
mkdir -p "$home/.local/bin" "$home/Library"
fp() { printf '%s' "$1" | shasum -a 256 | cut -c1-16; }

key=""
case $agent in
  claude)
    cli=$(find_cli claude)
    ln -s "$cli" "$home/.local/bin/claude"
    ln -s "$HOME/Library/Keychains" "$home/Library/Keychains"
    python3 - "$HOME/.claude.json" "$home/.claude.json" <<'PY'
import json, sys
src = json.load(open(sys.argv[1]))
json.dump({k: src[k] for k in ("oauthAccount", "hasCompletedOnboarding", "userID") if k in src}, open(sys.argv[2], "w"))
PY
    chmod 600 "$home/.claude.json"
    HOME=$home "$cli" auth status 2>/dev/null \
      | python3 -c 'import json,sys; d=json.load(sys.stdin); print(json.dumps({k: d.get(k) for k in ("loggedIn","authMethod","apiProvider","subscriptionType")}))' \
      > "$out/cli-auth.json" || true
    keyname=ANTHROPIC_API_KEY keylabel="Anthropic API key" ref=${OC_E2E_ANTHROPIC_OP_REF:-}
    tab="Claude Code" picker="Claude Code" stale=(ANTHROPIC_API_KEY=sk-ant-e2e-stale-shell-key)
    login_card=CLI login_id=subscription
    ;;
  codex)
    cli=$(find_cli codex)
    ln -s "$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$cli")" "$home/.local/bin/codex"
    mkdir -p "$home/.codex"
    python3 - "$HOME/.codex/auth.json" "$home/.codex/auth.json" <<'PY'
import json, os, sys
d = json.load(open(sys.argv[1]))
t = d.get("tokens") or {}
if "refresh_token" in t:
    t["refresh_token"] = ""
fd = os.open(sys.argv[2], os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, "w") as f:
    json.dump(d, f)
PY
    HOME=$home CODEX_HOME=$home/.codex "$cli" login status > "$out/cli-auth.txt" 2>&1 || true
    sed -i '' -E 's/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/<email>/g' "$out/cli-auth.txt"
    keyname=OPENAI_API_KEY keylabel="OpenAI API key" ref=${OC_E2E_OPENAI_OP_REF:-}
    tab="Codex" picker="Codex" stale=(OPENAI_API_KEY=sk-e2e-stale-shell-key)
    login_card=ChatGPT login_id=chatgpt
    ;;
  *) echo "agent must be claude or codex" >&2; exit 2 ;;
esac
"$cli" --version > "$out/cli-version.txt" 2>/dev/null || true

if [[ -n $ref ]]; then
  key=$(op read "$ref") || { echo "op read failed for the $keyname reference" >&2; exit 1; }
fi
if [[ -n ${OC_E2E_OPENAI_KEY_FILE:-} && $agent == codex && -z $key ]]; then
  key=$(cat "$OC_E2E_OPENAI_KEY_FILE")
fi
python3 - "$out/key.json" "$keyname" "${key:+$(fp "$key")}" "${ref:+1password}" <<'PY'
import json, sys
json.dump({"name": sys.argv[2], "fingerprint": sys.argv[3] or None, "source": sys.argv[4] or (None if not sys.argv[3] else "file")}, open(sys.argv[1], "w"))
PY

name="$agent-auth-$(date +%s)"
fixture="$home/fixture"
mkdir -p "$fixture"
git init -q --bare -b main "$fixture/origin.git"
git clone -q "$fixture/origin.git" "$fixture/$name" 2>/dev/null
printf '# %s\n' "$name" > "$fixture/$name/README.md"
git -C "$fixture/$name" add README.md
git -C "$fixture/$name" -c user.name=e2e -c user.email=e2e@example.invalid commit -qm init
git -C "$fixture/$name" push -q origin HEAD:main

python3 - "$fixture/$name" "$name" "$agent" "$tab" "$picker" "$login_card" "$login_id" "$keyname" "$keylabel" "${key:+1}" > "$out/driver.js" <<'PY'
import json, sys
repo, name, agent, tab, picker, login_card, login_id, keyname, keylabel, have_key = sys.argv[1:11]
modes = [
    {"id": "import", "prompt": "Reply with exactly: oc-import-ok", "expect": "oc-import-ok"},
    {"id": login_id, "card": login_card, "prompt": f"Reply with exactly: oc-{login_id}-ok", "expect": f"oc-{login_id}-ok"},
]
if have_key:
    modes.append({"id": "apikey", "card": "API key", "secret": {"name": keyname, "label": keylabel},
                  "prompt": "Reply with exactly: oc-apikey-ok", "expect": "oc-apikey-ok"})
print("window.__OC_E2E__ = " + json.dumps({"agent": {"id": agent, "tab": tab, "picker": picker},
                                           "repo": repo, "repoName": name, "modes": modes}) + ";")
PY
cat tools/auth/auth-modes-driver.js >> "$out/driver.js"

report="$out/$agent-auth-modes.json"
rm -f "$report"
(
  # `export` is a builtin: the key never appears in a command line.
  if [[ -n $key ]]; then export "OC_E2E_SECRET_$keyname=$key"; fi
  exec env HOME="$home" "${stale[@]}" \
    OPENCONDUCTOR_AGENT_BINARY_MANIFEST="$PWD/tools/e2e/no-agent-binaries.json" \
    OC_E2E_SCRIPT="$out/driver.js" OC_E2E_OUT="$out" "$exe"
) > "$out/app.log" 2>&1 &
pid=$!
for _ in $(seq 1 900); do
  [[ -f $report ]] && break
  kill -0 "$pid" 2>/dev/null || break
  sleep 1
done
kill "$pid" 2>/dev/null || true
wait "$pid" 2>/dev/null || true

# No key value may be left in the evidence.
if [[ -n $key ]] && grep -rlF -- "$key" "$out" >/dev/null 2>&1; then
  grep -rlF -- "$key" "$out" | while read -r f; do rm -f "$f"; echo "removed $f: it held the key" >&2; done
  echo "FAIL: the key appeared in the run output" >&2
  exit 1
fi
[[ -f $report ]] || { echo "no report; see $out/app.log" >&2; exit 1; }
python3 tools/auth/summarize.py "$out"
