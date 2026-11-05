#!/usr/bin/env bash
# Build and test src-tauri/src/draft_attachments.rs (the draft-attachments/
# store) as a standalone std-only crate, without the Tauri/WebKit toolchain.
# `--cfg draft_attachments_std_only` leaves out the Tauri command layer. The
# harness crate is generated in a temp dir; nothing in the repo changes.
#
# Usage: evidence/persistence/draft-attachments/run-tests.sh [extra cargo test args]
# Env:   DRAFT_ATTACHMENTS_HARNESS_DIR  where to generate the harness crate
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
module="$repo_root/src-tauri/src/draft_attachments.rs"
[[ -f "$module" ]] || { echo "missing $module" >&2; exit 1; }

harness="${DRAFT_ATTACHMENTS_HARNESS_DIR:-${TMPDIR:-/tmp}/draft-attachments-harness}"
mkdir -p "$harness"
cat > "$harness/Cargo.toml" <<TOML
[package]
name = "draft-attachments-harness"
version = "0.0.0"
edition = "2021"
publish = false

[lib]
path = "$module"
doctest = false

[lints.rust]
unexpected_cfgs = { level = "warn", check-cfg = ["cfg(draft_attachments_std_only)"] }
TOML

cd "$harness"
export RUSTFLAGS="${RUSTFLAGS:-} -D warnings --cfg draft_attachments_std_only"
cargo test "$@"
cargo clippy --all-targets -- -D warnings
