#!/usr/bin/env bash
# Build and test src-tauri/src/checkpoint/ as a standalone std-only crate.
#
# The module has no dependencies beyond std and the `git` CLI, so it can be
# tested on its own before (and independently of) the Tauri crate wiring.
# The harness crate is generated in a temp dir; nothing in the repo changes.
#
# Usage: evidence/checkpoint/run-tests.sh [extra cargo test args]
# Env:   CHECKPOINT_HARNESS_DIR  where to generate the harness crate
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
module="$repo_root/src-tauri/src/checkpoint/mod.rs"
[[ -f "$module" ]] || { echo "missing $module" >&2; exit 1; }

harness="${CHECKPOINT_HARNESS_DIR:-${TMPDIR:-/tmp}/checkpoint-harness}"
mkdir -p "$harness"
cat > "$harness/Cargo.toml" <<EOF
[package]
name = "checkpoint-harness"
version = "0.0.0"
edition = "2021"
publish = false

[lib]
path = "$module"

[workspace]
EOF

if command -v rustfmt >/dev/null 2>&1; then
  rustfmt --edition 2021 --check "$module"
else
  echo "note: rustfmt not installed; format check skipped" >&2
fi

cd "$harness"
RUSTFLAGS="${RUSTFLAGS:-} -D warnings" cargo test "$@"
if cargo clippy --version >/dev/null 2>&1; then
  cargo clippy --all-targets -- -D warnings
else
  echo "note: clippy not installed; lint skipped" >&2
fi
