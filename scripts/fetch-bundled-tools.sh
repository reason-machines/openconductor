#!/usr/bin/env bash
# Download the third-party tools OpenConductor.app bundles in Contents/Resources/bin/
# into src-tauri/resources/bin/ (gitignored), pinned by version and sha256.
#
#   scripts/fetch-bundled-tools.sh
#
# gh 2.100.0 arm64 is the build Conductor 0.87.6 ships: its binary's sha256 equals
# Conductor's Resources/bin/gh (evidence/scripts/MANIFEST.md). The app installs it into
# $APPDATA/bin at startup, as Conductor does (src-tauri/src/bundled_bin.rs).
# Idempotent: a tool already present with the pinned hash is not downloaded again.
set -euo pipefail
cd "$(dirname "$0")/.."

GH_VERSION=2.100.0
GH_ZIP_SHA256=45f9a62da2f6e641a7fad57e2ce39656dfd7ef331372d80a2a2aed65abb01642
GH_BIN_SHA256=51f1bd7ed1724774d2c1d91fb4efdb676d3eb200ce95c0021c8544fe7435bc13

out=src-tauri/resources/bin
mkdir -p "$out"

sha256() {
  if command -v shasum >/dev/null; then shasum -a 256 "$1"; else sha256sum "$1"; fi | cut -d' ' -f1
}

if [[ -f $out/gh && $(sha256 "$out/gh") == "$GH_BIN_SHA256" ]]; then
  echo "gh $GH_VERSION already present"
  exit 0
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
name=gh_${GH_VERSION}_macOS_arm64
curl -fsSL --retry 3 -o "$tmp/gh.zip" "https://github.com/cli/cli/releases/download/v$GH_VERSION/$name.zip"
[[ $(sha256 "$tmp/gh.zip") == "$GH_ZIP_SHA256" ]] || { echo "gh.zip sha256 mismatch" >&2; exit 1; }
unzip -q "$tmp/gh.zip" "$name/bin/gh" -d "$tmp"
[[ $(sha256 "$tmp/$name/bin/gh") == "$GH_BIN_SHA256" ]] || { echo "gh sha256 mismatch" >&2; exit 1; }
install -m 0755 "$tmp/$name/bin/gh" "$out/gh"
echo "gh $GH_VERSION -> $out/gh"
