#!/usr/bin/env bash
# Build, test and lint src-tauri/src/diff/ as a standalone crate.
#
# The core depends on std, serde and serde_json only, so it is tested on
# its own; `--cfg diff_std_only` leaves out the Tauri command wrappers.
# The harness crate is generated in a temp dir; nothing in the repo changes.
#
# Usage: tools/diff/run-rust-tests.sh [extra cargo test args]
# Env:   DIFF_HARNESS_DIR  where to generate the harness crate
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
module="$repo_root/src-tauri/src/diff/mod.rs"
[[ -f "$module" ]] || { echo "missing $module" >&2; exit 1; }

harness="${DIFF_HARNESS_DIR:-${TMPDIR:-/tmp}/diff-harness}"
mkdir -p "$harness"
cat > "$harness/Cargo.toml" <<TOML
[package]
name = "diff-harness"
version = "0.0.0"
edition = "2021"
publish = false

[lib]
path = "$module"

[dependencies]
serde = { version = "1.0.190", features = ["derive"] }
serde_json = "1"

[lints.rust]
unexpected_cfgs = { level = "warn", check-cfg = ["cfg(diff_std_only)"] }

[workspace]
TOML

cd "$harness"
export RUSTFLAGS="${RUSTFLAGS:-} -D warnings --cfg diff_std_only"
export RUSTDOCFLAGS="${RUSTDOCFLAGS:-} --cfg diff_std_only"
cargo test "$@"
if cargo clippy --version >/dev/null 2>&1; then
  cargo clippy --all-targets -- -D warnings
else
  echo "note: clippy not installed; lint skipped" >&2
fi
