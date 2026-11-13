#!/usr/bin/env bash
# Build and test src-tauri/src/quick_open/ as a standalone crate.
#
# The module depends only on ignore, nucleo-matcher (the same crates
# Conductor links), unicode-segmentation and serde, so it is tested on its
# own, independent of the Tauri crate wiring. The harness crate is generated in
# a temp dir; nothing in the repo changes.
#
# Usage: evidence/quick_open/run-tests.sh [extra cargo test args]
# Env:   QUICK_OPEN_HARNESS_DIR  where to generate the harness crate
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
module="$repo_root/src-tauri/src/quick_open/mod.rs"
[[ -f "$module" ]] || { echo "missing $module" >&2; exit 1; }

harness="${QUICK_OPEN_HARNESS_DIR:-${TMPDIR:-/tmp}/quick-open-harness}"
mkdir -p "$harness"
cat > "$harness/Cargo.toml" <<TOML
[package]
name = "quick-open-harness"
version = "0.0.0"
edition = "2021"
publish = false

[lib]
path = "$module"
doctest = false

[dependencies]
ignore = "0.4.25"
nucleo-matcher = "=0.3.1"
unicode-segmentation = "1.10"
serde = { version = "1", features = ["derive"] }
regex = "1"

[dev-dependencies]
serde_json = "1"

[lints.rust]
unexpected_cfgs = { level = "warn", check-cfg = ["cfg(quick_open_std_only)"] }

[workspace]
TOML

cd "$harness"
# commands.rs needs tauri; the cfg leaves it out of this harness.
export RUSTFLAGS="${RUSTFLAGS:-} -D warnings --cfg quick_open_std_only"
cargo test "$@"
if cargo clippy --version >/dev/null 2>&1; then
  cargo clippy --all-targets -- -D warnings
else
  echo "note: clippy not installed; lint skipped" >&2
fi
