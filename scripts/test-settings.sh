#!/usr/bin/env bash
# Build, test, lint and format-check src-tauri/src/settings/ as a standalone
# crate (serde + toml only), until CI builds the Tauri crate itself.
# The harness crate is generated in a temp dir; nothing in the repo changes.
#
# Usage: scripts/test-settings.sh [extra cargo test args]
# Env:   SETTINGS_HARNESS_DIR  where to generate the harness crate
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
module="$repo_root/src-tauri/src/settings/mod.rs"
[[ -f "$module" ]] || { echo "missing $module" >&2; exit 1; }

harness="${SETTINGS_HARNESS_DIR:-${TMPDIR:-/tmp}/settings-harness}"
mkdir -p "$harness"
cat > "$harness/Cargo.toml" <<EOF
[package]
name = "settings-harness"
version = "0.0.0"
edition = "2021"
publish = false

[lib]
path = "$module"

[dependencies]
serde = { version = "1", features = ["derive"] }
toml = "0.8"

[workspace]
EOF

rustfmt --edition 2021 --check "$repo_root"/src-tauri/src/settings/*.rs
cd "$harness"
RUSTFLAGS="${RUSTFLAGS:-} -D warnings" cargo test "$@"
cargo clippy --all-targets -- -D warnings
