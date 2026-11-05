#!/usr/bin/env bash
# Build, test and lint src-tauri/src/settings/ (with src-tauri/src/agent/) as a standalone crate,
# for machines without the Tauri system libraries. CI builds the whole Tauri crate instead.
#
# The harness copies the settings module without `commands.rs` (its Tauri commands) into a temp
# crate next to the agent module; nothing in the repo changes.
#
# Usage: tools/settings/run-rust-tests.sh [extra cargo test args]
# Env:   SETTINGS_HARNESS_DIR  where to generate the harness crate
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
harness="${SETTINGS_HARNESS_DIR:-${TMPDIR:-/tmp}/settings-harness}"
mkdir -p "$harness/src"
rm -rf "$harness/src/settings"
cp -R "$repo_root/src-tauri/src/settings" "$harness/src/settings"
rm "$harness/src/settings/commands.rs"
sed -i.bak '/^pub mod commands;$/d' "$harness/src/settings/mod.rs" && rm "$harness/src/settings/mod.rs.bak"
cat > "$harness/src/lib.rs" <<RS
#[path = "$repo_root/src-tauri/src/agent/mod.rs"]
pub mod agent;
pub mod settings;
RS
cat > "$harness/Cargo.toml" <<TOML
[package]
name = "settings-harness"
version = "0.0.0"
edition = "2021"
publish = false

[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
toml = "0.8"
oc-scripts = { path = "$repo_root/crates/scripts" }

[target.'cfg(target_os = "macos")'.dependencies]
security-framework = "3"

[workspace]
TOML

cd "$harness"
RUSTFLAGS="${RUSTFLAGS:-} -D warnings" cargo test "$@"
if cargo clippy --version >/dev/null 2>&1; then
  cargo clippy --all-targets -- -D warnings
else
  echo "note: clippy not installed; lint skipped" >&2
fi
