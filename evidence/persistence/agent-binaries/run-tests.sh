#!/usr/bin/env bash
# Build and test src-tauri/src/agent_binaries.rs (the agent-binaries/ store and
# binary manager) as a standalone crate, without the Tauri/WebKit toolchain.
# `--cfg agent_binaries_std_only` leaves out the Tauri command layer. The
# harness crate is generated in a temp dir; nothing in the repo changes.
#
# Usage: evidence/persistence/agent-binaries/run-tests.sh [extra cargo test args]
# Env:   AGENT_BINARIES_HARNESS_DIR  where to generate the harness crate
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
module="$repo_root/src-tauri/src/agent_binaries.rs"
[[ -f "$module" ]] || { echo "missing $module" >&2; exit 1; }

harness="${AGENT_BINARIES_HARNESS_DIR:-${TMPDIR:-/tmp}/agent-binaries-harness}"
mkdir -p "$harness"
cat > "$harness/Cargo.toml" <<TOML
[package]
name = "agent-binaries-harness"
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
flate2 = "1"
tar = "0.4"

[lints.rust]
unexpected_cfgs = { level = "warn", check-cfg = ["cfg(agent_binaries_std_only)"] }
TOML

cd "$harness"
export RUSTFLAGS="${RUSTFLAGS:-} -D warnings --cfg agent_binaries_std_only"
cargo test "$@"
cargo clippy --all-targets -- -D warnings
