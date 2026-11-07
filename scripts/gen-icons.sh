#!/usr/bin/env bash
# Regenerate desktop icons from the byte-for-byte official ink PNG source.
# The adaptive SVG favicon is a separate official source asset.
# Usage: scripts/gen-icons.sh   (needs `npm ci` first for the Tauri CLI)
set -euo pipefail
cd "$(dirname "$0")/.."

out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT
npx --no-install tauri icon src-tauri/icons/reason-app-icon-ink-1024.png -o "$out" >/dev/null
for f in 32x32.png 64x64.png 128x128.png 128x128@2x.png icon.png icon.icns icon.ico; do
  cp "$out/$f" "src-tauri/icons/$f"
done
cp "$out/128x128.png" public/icon.png
echo "icons regenerated from the official Reason ink PNG"
