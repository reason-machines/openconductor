#!/usr/bin/env bash
# Build and test src-tauri/src/file_search/ as a standalone crate (no Tauri,
# so it runs on Linux CI without webkit). Mirrors evidence/checkpoint/run-tests.sh.
#
# Usage: evidence/file-search/run-tests.sh [extra cargo test args]
# Env:   FILE_SEARCH_HARNESS_DIR  where to generate the harness crate
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
module="$repo_root/src-tauri/src/file_search/mod.rs"
[[ -f "$module" ]] || { echo "missing $module" >&2; exit 1; }

harness="${FILE_SEARCH_HARNESS_DIR:-${TMPDIR:-/tmp}/file-search-harness}"
mkdir -p "$harness"
cat > "$harness/Cargo.toml" <<EOF
[package]
name = "file-search-harness"
version = "0.0.0"
edition = "2021"
publish = false

[lib]
path = "$module"

[dependencies]
ignore = "0.4"
nucleo-matcher = "0.3"
serde = { version = "1", features = ["derive"] }

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
