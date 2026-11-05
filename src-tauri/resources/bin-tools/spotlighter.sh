#!/bin/sh
# OpenConductor's bin/spotlighter.sh: the output and exit codes of
# Conductor's script of the same name, run by OpenConductor's native code
# (src-tauri/src/tool_spotlighter.rs). Installed into $APPDATA/bin, where
# .internal/openconductor links to the app binary; run from the bundle's
# Resources/bin it uses Contents/MacOS/openconductor.
DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
EXE="$DIR/.internal/openconductor"
[ -x "$EXE" ] || EXE="$DIR/../../MacOS/openconductor"
exec "$EXE" --tool spotlighter "$@"
