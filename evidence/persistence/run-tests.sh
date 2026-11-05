#!/usr/bin/env bash
# Build and test src-tauri/src/persistence/ (repositories and workspaces in
# conductor.db) as a standalone crate, without the Tauri/WebKit toolchain. The
# harness crate is generated in a temp dir; nothing in the repo changes.
#
# Usage: evidence/persistence/run-tests.sh [extra cargo test args]
# Env:   PERSISTENCE_HARNESS_DIR  where to generate the harness crate
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
module="$repo_root/src-tauri/src/persistence/mod.rs"
[[ -f "$module" ]] || { echo "missing $module" >&2; exit 1; }

harness="${PERSISTENCE_HARNESS_DIR:-${TMPDIR:-/tmp}/persistence-harness}"
mkdir -p "$harness"
cat > "$harness/Cargo.toml" <<TOML
[package]
name = "persistence-harness"
version = "0.0.0"
edition = "2021"
publish = false

[lib]
path = "$module"
doctest = false

[dependencies]
openconductor-db = { path = "$repo_root/crates/openconductor-db" }
serde = { version = "1", features = ["derive"] }

[dev-dependencies]
tokio = { version = "1", features = ["rt-multi-thread", "macros"] }
TOML

cd "$harness"
RUSTFLAGS="${RUSTFLAGS:-} -D warnings" cargo test "$@"
cargo clippy --all-targets -- -D warnings
