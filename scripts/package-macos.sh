#!/usr/bin/env bash
# Build OpenConductor.app on macOS and sign it.
#   scripts/package-macos.sh            debug build (fast, devtools on)
#   scripts/package-macos.sh --release  release build
# Signing: uses $APPLE_SIGNING_IDENTITY, else the first "Developer ID Application"
# identity in the login keychain, else ad-hoc ("-"). No notarization.
set -euo pipefail
cd "$(dirname "$0")/.."

profile=(--debug); outdir=debug
if [[ "${1:-}" == "--release" ]]; then profile=(); outdir=release; fi

if [[ -z "${APPLE_SIGNING_IDENTITY:-}" ]]; then
  APPLE_SIGNING_IDENTITY=$(security find-identity -v -p codesigning 2>/dev/null \
    | sed -n 's/.*"\(Developer ID Application: [^"]*\)".*/\1/p' | head -1)
  APPLE_SIGNING_IDENTITY=${APPLE_SIGNING_IDENTITY:--}
fi
export APPLE_SIGNING_IDENTITY
echo "signing identity: $APPLE_SIGNING_IDENTITY"

[[ -f src-tauri/icons/icon.icns ]] || cargo tauri icon src-tauri/icons/icon.svg -o src-tauri/icons
cargo tauri build "${profile[@]}" --bundles app

app=$(ls -d src-tauri/target/"$outdir"/bundle/macos/*.app | head -1)
codesign --verify --deep --strict --verbose=2 "$app"
codesign -dv "$app" 2>&1 | grep -E '^(Identifier|Authority|TeamIdentifier|Runtime)' || true
echo "built: $app"
