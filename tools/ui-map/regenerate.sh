#!/usr/bin/env bash
# Regenerates the UI map (parity/ui-map.md, parity/ui-map.json, parity/ui-map/*)
# on current origin/main in one command. See tools/ui-map/README.md.
#
#   tools/ui-map/regenerate.sh
#
# Steps: sync with origin/main, build the OpenConductor debug app, capture the
# Conductor reference (only when a tracked reference PNG is missing or differs),
# run the OpenConductor lane under Xvfb, compare with REA, build the map.
#
# Env (all optional):
#   UIMAP_NO_SYNC=1        skip `git fetch` + rebase onto origin/main
#   UIMAP_RECAPTURE_REF=1  always recapture the Conductor reference
#   UIMAP_SKIP_BUILD=1     reuse the existing debug build
#   DIST                   Conductor's decoded asset table (default .rea-work/dist)
#   SYSROOT                Linux sysroot with webkit2gtk-4.1 dev libs for hosts
#                          without them (default ~/sysroot, used if root/ exists)
#   REA, CHROMIUM, TAURI_DRIVER  binaries (default: rea, /usr/bin/chromium, tauri-driver)
set -euo pipefail

cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
REPO=$PWD
REA=${REA:-rea}
CHROMIUM=${CHROMIUM:-/usr/bin/chromium}
TAURI_DRIVER=${TAURI_DRIVER:-tauri-driver}
DIST=$(realpath -m "${DIST:-$REPO/.rea-work/dist}")
SYSROOT=${SYSROOT:-$HOME/sysroot}
WORK=${UIMAP_WORK:-${TMPDIR:-/tmp}/uimap-regen}
OUT=$REPO/parity/ui-map
log() { printf '\n== %s\n' "$*"; }
die() { printf 'regenerate.sh: %s\n' "$*" >&2; exit 1; }

log "prerequisites"
command -v "$REA" >/dev/null || die "REA ('$REA') not on PATH; compare.mjs would score every state 0. npm i -g rea-agents, or set REA=."
"$REA" --version >/dev/null 2>&1 || die "'$REA --version' failed"
for b in node npm python3 xvfb-run "$TAURI_DRIVER"; do command -v "$b" >/dev/null || die "$b not found"; done
[ -x "$CHROMIUM" ] || die "Chromium not at $CHROMIUM (set CHROMIUM=)"
[ -f "$DIST/index.html" ] || die "Conductor's decoded asset table not at $DIST (tools/extract_tauri_assets.py; set DIST=)"
python3 -c 'import PIL' 2>/dev/null || die "python3 Pillow missing (side-by-side diff images)"
echo "rea $("$REA" --version 2>&1 | tail -1), dist $DIST"

if [ -z "${UIMAP_NO_SYNC:-}" ]; then
  log "sync with origin/main"
  [ -z "$(git status --porcelain --untracked-files=no)" ] || die "tracked changes in the work tree; commit or stash them (or UIMAP_NO_SYNC=1)"
  git fetch -q origin main
  git rebase -q origin/main
fi
git rev-parse -q --verify origin/main >/dev/null || git fetch -q origin main
MAIN=$(git merge-base HEAD origin/main)
SHA=$(git rev-parse --short "$MAIN")
echo "building on main $SHA ($(git log -1 --format=%s "$MAIN" | cut -c1-100))"
[ "$(git rev-parse HEAD)" = "$MAIN" ] || echo "  plus $(git rev-list --count "$MAIN"..HEAD) local commit(s) on top"

USE_SYSROOT=
if [ "$(uname -s)" = Linux ] && [ -d "$SYSROOT/root" ] && ! pkg-config --exists webkit2gtk-4.1 2>/dev/null; then USE_SYSROOT=1; fi

log "npm ci"
npm ci --no-audit --no-fund
(cd tools/screens && npm ci --no-audit --no-fund)

if [ -z "${UIMAP_SKIP_BUILD:-}" ]; then
  log "tauri build --debug --no-bundle"
  (
    # shellcheck disable=SC1091
    [ -n "$USE_SYSROOT" ] && source "$SYSROOT/env.sh"
    npx tauri build --debug --no-bundle
  )
fi
OC_APP=$REPO/src-tauri/target/debug/openconductor
[ -x "$OC_APP" ] || die "no debug build at $OC_APP"

log "Conductor reference"
mkdir -p "$WORK/tmp"
# Recapture only states that are new or whose PNG is missing or differs from
# the tracked hash in ref-captures.json (all of them with UIMAP_RECAPTURE_REF=1).
python3 - "$OUT" "$WORK/ref-stale" <<'EOF'
import hashlib, json, os, sys
out, stale = sys.argv[1], sys.argv[2]
ref = json.load(open(os.path.join(out, "ref-captures.json")))
states = [s["id"] for s in json.load(open("tools/ui-map/states.json"))["states"]]
def ok(v):
    f = v.get("file") and os.path.join(out, v["file"])
    return not f or (os.path.exists(f) and hashlib.sha256(open(f, "rb").read()).hexdigest() == v.get("png_sha256"))
bad = [k for k in states if k not in ref or not ok(ref[k])]
open(stale, "w").write(" ".join(bad))
print(f"reference captures to (re)take: {len(bad)} of {len(states)}" + (f" ({' '.join(bad[:10])}{' ...' if len(bad) > 10 else ''})" if bad else ""))
EOF
if [ -n "${UIMAP_RECAPTURE_REF:-}" ]; then
  DIST=$DIST TMPDIR=$WORK/tmp REA=$REA CHROMIUM=$CHROMIUM node tools/ui-map/capture_ref.mjs
elif [ -s "$WORK/ref-stale" ]; then
  # shellcheck disable=SC2046
  DIST=$DIST TMPDIR=$WORK/tmp REA=$REA CHROMIUM=$CHROMIUM node tools/ui-map/capture_ref.mjs $(cat "$WORK/ref-stale")
else
  echo "reusing tracked reference captures"
fi

log "OpenConductor lane"
# Start from an empty manifest so no capture from an earlier build survives.
rm -rf "$OUT/oc"; echo '{}' > "$OUT/oc-captures.json"
LANE=(xvfb-run -a env OC_APP="$OC_APP" UIMAP_RESEED=1 TAURI_DRIVER="$TAURI_DRIVER" GDK_BACKEND=x11 LIBGL_ALWAYS_SOFTWARE=1
  WEBKIT_DISABLE_DMABUF_RENDERER=1 WEBKIT_DISABLE_COMPOSITING_MODE=1 node tools/ui-map/oc_lane.mjs)
if [ -n "$USE_SYSROOT" ]; then
  # WebKit looks for its helper processes at the compiled-in
  # /usr/lib/x86_64-linux-gnu/webkit2gtk-4.1, so LD_LIBRARY_PATH is not enough:
  # overlay that dir (bwrap) with the system's own libraries plus only what the
  # sysroot adds and webkit/javascriptcore. Overlaying the whole sysroot breaks
  # EGL (EGL_BAD_PARAMETER), so mesa stays the system's except dri drivers.
  # Mount points live in /tmp: bwrap cannot create them under a sandbox's private TMPDIR.
  SYS=/usr/lib/x86_64-linux-gnu R=$SYSROOT/root ORIG=/tmp/uimap-origlib LIBX=/tmp/uimap-libx
  rm -rf "$LIBX"; mkdir -p "$LIBX" "$ORIG"
  for f in "$SYS"/* "$SYS"/.[!.]*; do [ -e "$f" ] || [ -L "$f" ] && ln -s "$ORIG/${f##*/}" "$LIBX/${f##*/}"; done
  for d in "$R/lib/x86_64-linux-gnu" "$R/usr/lib/x86_64-linux-gnu"; do
    for f in "$d"/*; do
      n=${f##*/}
      case $n in *webkit*|*javascriptcore*|dri) ln -sfn "$f" "$LIBX/$n" ;; *) [ -e "$LIBX/$n" ] || [ -L "$LIBX/$n" ] || ln -s "$f" "$LIBX/$n" ;; esac
    done
  done
  PATH=$R/usr/bin:$PATH bwrap --dev-bind / / --bind "$SYS" "$ORIG" --bind "$LIBX" "$SYS" -- \
    env __EGL_VENDOR_LIBRARY_DIRS="$R/usr/share/glvnd/egl_vendor.d" LIBGL_DRIVERS_PATH="$SYS/dri" "${LANE[@]}" || echo "lane exit $? (session failures are recorded per state)"
else
  "${LANE[@]}" || echo "lane exit $? (session failures are recorded per state)"
fi

python3 - "$OUT" <<'EOF' || die "the OpenConductor lane captured nothing; see its output above"
import collections, json, sys
m = json.load(open(sys.argv[1] + "/oc-captures.json"))
print("lane:", dict(collections.Counter(v["status"] for v in m.values())))
sys.exit(0 if any(v.get("file") for v in m.values()) else 1)
EOF

log "REA compare"
TMPDIR=$WORK/tmp REA=$REA node tools/ui-map/compare.mjs

log "build map"
UIMAP_OC_COMMIT=$SHA python3 tools/ui-map/build_map.py
python3 - <<'EOF'
import json
m = json.load(open("parity/ui-map.json"))
s = m["summary"]
print(f"Total {s['total']} / Missing {s['missing']} / Wrong {s['wrong']} / Matches {s['matches']}")
print("states:", json.dumps(s["states"]), "items:", json.dumps(s["items"]))
EOF
