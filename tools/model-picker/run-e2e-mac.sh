#!/usr/bin/env bash
# The composer's model chip and picker on a Reason chat in the built
# OpenConductor app on a Mac, with the user's signed-in `reason` CLI: drives
# the real window through the debug-only seam (src-tauri/src/e2e.rs +
# tools/model-picker/e2e-driver.js), then asks `reason session get` which
# model the chat's Session actually ran on, to hold the chip against it.
# Writes model-picker.json, model-dom-*.json, reason-session.json and app.log
# to OUT. Render the DOM captures with tools/slash-menu/render.mjs (it reads
# slash-dom-*.json, so they are also copied under that name).
#
# Usage: tools/model-picker/run-e2e-mac.sh OUT [APP]
set -euo pipefail
cd "$(dirname "$0")/../.."
out=${1:?usage: run-e2e-mac.sh OUT [APP]}
app=${2:-src-tauri/target/debug/bundle/macos/OpenConductor.app}
mkdir -p "$out" && out=$(cd "$out" && pwd)
exe="$app/Contents/MacOS/openconductor"
[[ -x $exe ]] || { echo "no app at $app (build with scripts/package-macos.sh)" >&2; exit 1; }
reason=$(command -v reason || echo "$HOME/.local/bin/reason")
"$reason" --version > "$out/cli.txt" 2>&1 || true

name="model-e2e-$(date +%s)"
fixture="$out/fixture"
rm -rf "$fixture" && mkdir -p "$fixture"
git init -q --bare -b main "$fixture/origin.git"
git clone -q "$fixture/origin.git" "$fixture/$name" 2>/dev/null
printf '# %s\n\nFixture for the OpenConductor model picker e2e run.\n' "$name" > "$fixture/$name/README.md"
git -C "$fixture/$name" add -A
git -C "$fixture/$name" -c user.name=e2e -c user.email=e2e@example.invalid commit -qm init
git -C "$fixture/$name" push -q origin HEAD:main

python3 - "$fixture/$name" "$name" > "$out/driver.js" <<'PY'
import json, sys
cfg = {"repo": sys.argv[1], "repoName": sys.argv[2],
       "prompt": "Reply with just the word ok. Do not use tools.", "pick": "Claude Sonnet 5.5"}
print("window.__OC_E2E__ = " + json.dumps(cfg) + ";")
PY
cat tools/model-picker/e2e-driver.js >> "$out/driver.js"

rm -f "$out"/model-picker*.json "$out"/model-dom-*.json "$out"/*-chat-events.jsonl
OC_E2E_SIZE=1440x900 OC_E2E_SCRIPT="$out/driver.js" OC_E2E_OUT="$out" "$exe" > "$out/app.log" 2>&1 &
pid=$!
for _ in $(seq 1 900); do
  [[ -f $out/model-picker.json ]] && break
  kill -0 "$pid" 2>/dev/null || break
  sleep 1
done
kill "$pid" 2>/dev/null || true
wait "$pid" 2>/dev/null || true
[[ -f $out/model-picker.json ]] || { echo "no report; see $out/app.log" >&2; exit 1; }

# The Session the chat opened, and the model Reason says it ran on.
sid=$(grep -ho '"sessionId": *"[^"]*"' "$out"/reason-chat-events.jsonl 2>/dev/null | head -1 | sed 's/.*"\([^"]*\)"$/\1/' || true)
if [[ -n $sid ]]; then
  "$reason" session get "$sid" --json 2>/dev/null | python3 -c 'import json,sys; s=json.load(sys.stdin); print(json.dumps({k: s.get(k) for k in ("session_id","model","reasoning_effort","status","title")}, indent=1))' > "$out/reason-session.json" || true
fi
for f in "$out"/model-dom-*.json; do cp "$f" "$out/slash-dom-${f##*/model-dom-}"; done
python3 - "$out" <<'PY'
import json, sys, os
out = sys.argv[1]
r = json.load(open(os.path.join(out, "model-picker.json")))
s = {}
p = os.path.join(out, "reason-session.json")
if os.path.exists(p): s = json.load(open(p))
for k in ("beforeTurn", "afterTurn", "afterPick", "afterPickTurn"):
    v = r.get(k)
    if v: print(f"{k}: chip={v['chip']['text']!r} rows={v.get('count')}")
for k in ("turn1", "turn2"):
    if r.get(k): print(f"{k}: {r[k]['status']}")
print("pick listed:", r.get("pickFound"), "| error:", r.get("error"))
print("reason session get:", s.get("model"), s.get("reasoning_effort"))
PY
