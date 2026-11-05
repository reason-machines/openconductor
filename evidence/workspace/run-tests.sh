#!/usr/bin/env bash
# Build and test src-tauri/src/workspace/ as a std-only crate, without the
# Tauri dependencies (no WebKit needed). The checkpoint module is compiled
# alongside because archive/restore build on it; only workspace tests run.
# The harness crate is generated in a temp dir; nothing in the repo changes.
#
# Usage: evidence/workspace/run-tests.sh [extra cargo test filter/args]
# Env:   WORKSPACE_HARNESS_DIR  where to generate the harness crate
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
src="$repo_root/src-tauri/src"
for m in workspace checkpoint; do
  [[ -f "$src/$m/mod.rs" ]] || { echo "missing $src/$m/mod.rs" >&2; exit 1; }
done

harness="${WORKSPACE_HARNESS_DIR:-${TMPDIR:-/tmp}/workspace-harness}"
mkdir -p "$harness"
cat > "$harness/Cargo.toml" <<TOML
[package]
name = "workspace-harness"
version = "0.0.0"
edition = "2021"
publish = false

[lib]
path = "lib.rs"

[workspace]
TOML
cat > "$harness/lib.rs" <<RS
#[path = "$src/checkpoint/mod.rs"]
pub mod checkpoint;
#[path = "$src/workspace/mod.rs"]
pub mod workspace;
RS

cd "$harness"
RUSTFLAGS="${RUSTFLAGS:-} -D warnings" cargo test -- "${@:-workspace::}"
if cargo clippy --version >/dev/null 2>&1; then
  cargo clippy --all-targets -- -D warnings
else
  echo "note: clippy not installed; lint skipped" >&2
fi
