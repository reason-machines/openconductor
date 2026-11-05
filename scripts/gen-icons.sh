#!/usr/bin/env bash
# Regenerate every app icon size from the one source, src-tauri/icons/icon.svg.
# Keeps only the desktop sizes the bundle uses and the web favicon.
# Usage: scripts/gen-icons.sh   (needs `npm ci` first for the Tauri CLI)
set -euo pipefail
cd "$(dirname "$0")/.."

out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT
npx --no-install tauri icon src-tauri/icons/icon.svg -o "$out" >/dev/null
for f in 32x32.png 64x64.png 128x128.png 128x128@2x.png icon.png icon.icns icon.ico; do
  cp "$out/$f" "src-tauri/icons/$f"
done
cp "$out/128x128.png" public/icon.png
echo "icons regenerated from src-tauri/icons/icon.svg"
