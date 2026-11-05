#!/usr/bin/env bash
# Build and test src-tauri/src/pr/ as a standalone crate (serde + serde_json
# only, the same versions the Tauri crate declares), until the Tauri crate
# declares `mod pr;`. The harness crate is generated in a temp dir and
# built with `--cfg pr_harness`, which leaves out the Tauri command wrappers.
#
# Usage: evidence/pr/run-tests.sh [extra cargo test args]
# Env:   PR_HARNESS_DIR  where to generate the harness crate
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
module="$repo_root/src-tauri/src/pr/mod.rs"
[[ -f "$module" ]] || { echo "missing $module" >&2; exit 1; }

harness="${PR_HARNESS_DIR:-${TMPDIR:-/tmp}/pr-harness}"
mkdir -p "$harness"
cat > "$harness/Cargo.toml" <<TOML
[package]
name = "pr-harness"
version = "0.0.0"
edition = "2021"
publish = false

[lib]
path = "$module"

[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"

[lints.rust]
unexpected_cfgs = { level = "warn", check-cfg = ["cfg(pr_harness)"] }

[workspace]
TOML

if rustfmt --version >/dev/null 2>&1; then
  rustfmt --edition 2021 --check "$module"
else
  echo "note: rustfmt not installed; format check skipped" >&2
fi

cd "$harness"
export RUSTFLAGS="${RUSTFLAGS:-} --cfg pr_harness -D warnings"
export RUSTDOCFLAGS="${RUSTDOCFLAGS:-} --cfg pr_harness"
cargo test "$@"
if cargo clippy --version >/dev/null 2>&1; then
  cargo clippy --all-targets -- -D warnings
else
  echo "note: clippy not installed; lint skipped" >&2
fi
