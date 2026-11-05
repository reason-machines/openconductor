#!/usr/bin/env bash
# Build and test src-tauri/src/terminal/ as a standalone crate.
#
# The module depends only on portable-pty and alacritty_terminal (the
# versions the reference app links), libc, and serde/base64 for its IPC payloads, so it is tested on
# its own. The harness crate is generated in a temp dir; nothing in the repo
# changes.
#
# Usage: tools/terminal/run-rust-tests.sh [extra cargo test args]
# Env:   TERMINAL_HARNESS_DIR  where to generate the harness crate
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
module="$repo_root/src-tauri/src/terminal/mod.rs"
[[ -f "$module" ]] || { echo "missing $module" >&2; exit 1; }

harness="${TERMINAL_HARNESS_DIR:-${TMPDIR:-/tmp}/terminal-harness}"
mkdir -p "$harness"
cat > "$harness/Cargo.toml" <<EOF
[package]
name = "terminal-harness"
version = "0.0.0"
edition = "2021"
publish = false

[lib]
path = "lib.rs"

[dependencies]
portable-pty = "=0.9.0"
alacritty_terminal = "=0.26.0"
libc = "0.2"
base64 = "0.21"
serde = { version = "1", features = ["derive"] }

[dev-dependencies]
serde_json = "1"

[workspace]
EOF
# Nest the module as `terminal`, as src-tauri/src/lib.rs does, so paths
# that only resolve at a crate root fail here too.
printf '#[path = "%s"]\npub mod terminal;\n' "$module" > "$harness/lib.rs"

cd "$harness"
RUSTFLAGS="${RUSTFLAGS:-} -D warnings" cargo test "$@"
if cargo clippy --version >/dev/null 2>&1; then
  cargo clippy --all-targets -- -D warnings
else
  echo "note: clippy not installed; lint skipped" >&2
fi

if command -v rustfmt >/dev/null 2>&1; then
  rustfmt --edition 2021 --check "$module"
else
  echo "note: rustfmt not installed; format check skipped" >&2
fi
