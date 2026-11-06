#!/usr/bin/env bash
# Resize-reflow check in the built OpenConductor app (debug bundle) on a Mac:
# for each window width, starts the app on a throwaway HOME with
# OC_E2E_SIZE=<width>x<height> and tools/side-by-side/resize-reflow-driver.js,
# which adds a fixture repo, stores Conductor's lisbon turn three times as the
# workspace chat, reloads, measures the layout and checks it against Conductor's
# rules (see the driver). Prints ok or the failures per width. The app stays open after it
# reports until <OUT>/<width>/quit exists when WAIT_FOR_QUIT is set, so the
# window can be captured. Sven's real HOME is never used.
#
# Usage: tools/side-by-side/resize-reflow-mac.sh APP OUT ROWS_JSON [WIDTHS] [HEIGHT]
#   ROWS_JSON: `node tools/side-by-side/resize-reflow-rows.mjs __CHAT__ > rows.json`
#   WIDTHS default "900 1280 1600 2100", HEIGHT default 900.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
app=${1:?usage: resize-reflow-mac.sh APP OUT ROWS_JSON [WIDTHS] [HEIGHT]}
out=${2:?}
rows=${3:?}
widths=${4:-900 1280 1600 2100}
height=${5:-900}
exe="$app/Contents/MacOS/openconductor"
[[ -x $exe ]] || { echo "no app at $app" >&2; exit 1; }
mkdir -p "$out" && out=$(cd "$out" && pwd)

for w in $widths; do
  dir="$out/$w"
  rm -rf "$dir" && mkdir -p "$dir/home"
  # Fixture: a clone with an origin and one commit, so add_repository takes it.
  fixture="$dir/fixture"
  mkdir -p "$fixture"
  git init -q --bare -b main "$fixture/origin.git"
  git clone -q "$fixture/origin.git" "$fixture/tide-web" 2>/dev/null
  printf '# tide-web\n' > "$fixture/tide-web/README.md"
  git -C "$fixture/tide-web" add README.md
  git -C "$fixture/tide-web" -c user.name=e2e -c user.email=e2e@example.invalid commit -qm init
  git -C "$fixture/tide-web" push -q origin HEAD:main
  python3 - "$fixture/tide-web" "$rows" > "$dir/driver.js" <<'PY'
import json, sys
repo, rows = sys.argv[1], json.load(open(sys.argv[2]))
print("window.__OC_E2E__ = " + json.dumps({"repo": repo, "rows": rows, "chatPlaceholder": "__CHAT__"}) + ";")
PY
  cat "$here/resize-reflow-driver.js" >> "$dir/driver.js"
  HOME="$dir/home" OC_E2E_SIZE="${w}x${height}" OC_E2E_SCRIPT="$dir/driver.js" OC_E2E_OUT="$dir" "$exe" > "$dir/app.log" 2>&1 &
  pid=$!
  echo "$pid" > "$dir/app.pid"
  for _ in $(seq 1 120); do
    [[ -f $dir/resize-reflow.json ]] && break
    kill -0 "$pid" 2>/dev/null || break
    sleep 1
  done
  [[ -f $dir/resize-reflow.json ]] || { echo "$w: no report; see $dir/app.log" >&2; kill "$pid" 2>/dev/null || true; exit 1; }
  echo "$w: reported (pid $pid)"
  [[ -n ${WAIT_FOR_QUIT:-} ]] || { kill "$pid"; wait "$pid" 2>/dev/null || true; continue; }
  for _ in $(seq 1 600); do [[ -f $dir/quit ]] && break; sleep 1; done
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
done

# One line per width: ok, or what failed.
for w in $widths; do
  python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); f=d.get("failures"); print(sys.argv[2]+":", "error: "+d["error"] if "error" in d else ("ok" if not f else "; ".join(f)))' "$out/$w/resize-reflow.json" "$w"
done
