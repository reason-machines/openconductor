#!/usr/bin/env bash
# Build, test and lint the full workspace archive (src-tauri/src/workspace_archive/)
# without the Tauri crate, which needs WebKit to build. The harness crate
# mounts the modules it uses (checkpoint, workspace in its std-only build,
# workspace_archive) with #[path] and depends on the path crates directly.
# The Tauri command wrapper (src-tauri/src/workspace_archive_commands.rs) is
# compiled only by the app build (ci.yml).
#
# Usage: tools/archive/run-rust-tests.sh [extra cargo test args]
# Env:   ARCHIVE_HARNESS_DIR  where to generate the harness crate
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
src="$repo_root/src-tauri/src"
harness="${ARCHIVE_HARNESS_DIR:-${TMPDIR:-/tmp}/archive-harness}"
mkdir -p "$harness"
cat > "$harness/Cargo.toml" <<TOML
[package]
name = "archive-harness"
version = "0.0.0"
edition = "2021"
publish = false

[lib]
path = "lib.rs"

[dependencies]
serde = { version = "1", features = ["derive"] }
tokio = { version = "1", features = ["rt", "sync", "rt-multi-thread", "macros"] }
oc-scripts = { path = "$repo_root/crates/scripts" }
openconductor-db = { path = "$repo_root/crates/openconductor-db" }

[lints.rust]
unexpected_cfgs = { level = "warn", check-cfg = ['cfg(workspace_std_only)'] }

[workspace]
TOML
cat > "$harness/lib.rs" <<RS
#[path = "$src/checkpoint/mod.rs"]
pub mod checkpoint;
#[path = "$src/workspace/mod.rs"]
pub mod workspace;
#[path = "$src/workspace_archive/mod.rs"]
pub mod workspace_archive;
RS

cd "$harness"
export RUSTFLAGS="${RUSTFLAGS:-} --cfg workspace_std_only"
cargo test "$@" workspace_archive
if cargo clippy --version >/dev/null 2>&1; then
  cargo clippy --all-targets -- -D warnings -A dead_code
else
  echo "note: clippy not installed; lint skipped" >&2
fi
