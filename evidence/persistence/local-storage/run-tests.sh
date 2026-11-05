#!/usr/bin/env bash
# Build and test src-tauri/src/local_storage/store.rs (Conductor's file-backed
# local-storage subsystems) as a standalone crate, without the Tauri/WebKit
# toolchain. The harness crate is generated in a temp dir; nothing in the repo
# changes.
#
# Usage: evidence/persistence/local-storage/run-tests.sh [extra cargo test args]
# Env:   LOCAL_STORAGE_HARNESS_DIR  where to generate the harness crate
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
module="$repo_root/src-tauri/src/local_storage/store.rs"
[[ -f "$module" ]] || { echo "missing $module" >&2; exit 1; }

harness="${LOCAL_STORAGE_HARNESS_DIR:-${TMPDIR:-/tmp}/local-storage-harness}"
mkdir -p "$harness"
cat > "$harness/Cargo.toml" <<TOML
[package]
name = "local-storage-harness"
version = "0.0.0"
edition = "2021"
publish = false

[lib]
path = "$module"
doctest = false

[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
sha2 = "0.10"
TOML

cd "$harness"
RUSTFLAGS="${RUSTFLAGS:-} -D warnings" cargo test "$@"
cargo clippy --all-targets -- -D warnings
