#!/usr/bin/env bash
# Build OpenConductor.app on macOS and sign it.
#
#   scripts/package-macos.sh [--release] [--identity NAME|-]
#
# Debug build by default (fast, devtools on); --release for the optimized bundle.
# Signing identity, first match wins: --identity, $APPLE_SIGNING_IDENTITY, the
# first "Developer ID Application" identity in the keychain, else ad-hoc ("-").
# The bundle is signed with the hardened runtime and src-tauri/Entitlements.plist.
# No notarization. Prints the bundle path on the last line.
set -euo pipefail
cd "$(dirname "$0")/.."

profile=(--debug); outdir=debug
identity=${APPLE_SIGNING_IDENTITY:-}
while (($#)); do
  case $1 in
    --release) profile=(); outdir=release ;;
    --identity) identity=${2:?--identity needs a value}; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done
if [[ -z $identity ]]; then
  identity=$(security find-identity -v -p codesigning 2>/dev/null \
    | sed -n 's/.*"\(Developer ID Application: [^"]*\)".*/\1/p' | head -1)
  identity=${identity:--}
fi
export APPLE_SIGNING_IDENTITY=$identity
echo "signing identity: $identity"

[[ -d node_modules ]] || npm ci
npx --no-install tauri build "${profile[@]}" --bundles app

app=src-tauri/target/$outdir/bundle/macos/OpenConductor.app
codesign --verify --deep --strict --verbose=2 "$app"
codesign -dvv "$app" 2>&1 | grep -E '^(Identifier|Format|CodeDirectory|Signature|Authority|TeamIdentifier|Runtime)' || true
codesign -d --entitlements - --xml "$app" 2>/dev/null | plutil -p - || true
echo "$app"
