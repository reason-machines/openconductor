#!/usr/bin/env bash
# Build and test src-tauri/src/sidecar_stores/ (the session event outbox and
# the slash-command snapshot store) as a standalone crate, without the
# Tauri/WebKit toolchain. The harness crate is generated in a temp dir;
# nothing in the repo changes.
#
# Usage: evidence/persistence/sidecar-stores/run-tests.sh [extra cargo test args]
# Env:   SIDECAR_STORES_HARNESS_DIR  where to generate the harness crate
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
module="$repo_root/src-tauri/src/sidecar_stores/mod.rs"
[[ -f "$module" ]] || { echo "missing $module" >&2; exit 1; }

harness="${SIDECAR_STORES_HARNESS_DIR:-${TMPDIR:-/tmp}/sidecar-stores-harness}"
mkdir -p "$harness"
cat > "$harness/Cargo.toml" <<TOML
[package]
name = "sidecar-stores-harness"
version = "0.0.0"
edition = "2021"
publish = false

[lib]
path = "$module"
doctest = false

[dependencies]
base64 = "0.21"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
TOML

cd "$harness"
RUSTFLAGS="${RUSTFLAGS:-} -D warnings" cargo test "$@"
cargo clippy --all-targets -- -D warnings
