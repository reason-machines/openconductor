#!/usr/bin/env bash
# Build, test and lint src-tauri/src/chat/ as a standalone crate.
#
# The module depends on std, serde and serde_json only, so it is tested on
# its own until the Tauri crate (src-tauri/Cargo.toml) exists and wires it in.
# The harness crate is generated in a temp dir; nothing in the repo changes.
#
# Usage: tools/chat/run-rust-tests.sh [extra cargo test args]
# Env:   CHAT_HARNESS_DIR  where to generate the harness crate
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
module="$repo_root/src-tauri/src/chat/mod.rs"
[[ -f "$module" ]] || { echo "missing $module" >&2; exit 1; }

harness="${CHAT_HARNESS_DIR:-${TMPDIR:-/tmp}/chat-harness}"
mkdir -p "$harness"
cat > "$harness/Cargo.toml" <<TOML
[package]
name = "chat-harness"
version = "0.0.0"
edition = "2021"
publish = false

[lib]
path = "$module"

[dependencies]
serde = { version = "1.0.190", features = ["derive"] }
serde_json = "1"

[workspace]
TOML

cd "$harness"
RUSTFLAGS="${RUSTFLAGS:-} -D warnings" cargo test "$@"
if cargo clippy --version >/dev/null 2>&1; then
  cargo clippy --all-targets -- -D warnings
else
  echo "note: clippy not installed; lint skipped" >&2
fi
