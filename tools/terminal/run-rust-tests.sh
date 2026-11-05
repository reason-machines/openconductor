#!/usr/bin/env bash
# Build and test src-tauri/src/terminal/ as a standalone crate.
#
# The module depends only on portable-pty and alacritty_terminal (the
# versions the reference app links), libc, serde/base64 for its IPC payloads,
# and aes-gcm/sha2/serde_json for the history store, so it is tested on
# its own. terminal_history.rs (the history commands' logic over the store
# and conductor.db) is nested beside it with openconductor-db and tokio. The
# harness crate is generated in a temp dir; nothing in the repo changes.
#
# Usage: tools/terminal/run-rust-tests.sh [extra cargo test args]
# Env:   TERMINAL_HARNESS_DIR  where to generate the harness crate
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
module="$repo_root/src-tauri/src/terminal/mod.rs"
history="$repo_root/src-tauri/src/terminal_history.rs"
for f in "$module" "$history"; do
  [[ -f "$f" ]] || { echo "missing $f" >&2; exit 1; }
done

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
serde_json = "1"
aes-gcm = "0.10"
sha2 = "0.10"
openconductor-db = { path = "$repo_root/crates/openconductor-db" }
tokio = { version = "1", features = ["rt", "rt-multi-thread", "macros", "sync"] }

[workspace]
EOF
# Nest the modules as src-tauri/src/lib.rs does, so paths that only
# resolve at a crate root fail here too.
printf '#[path = "%s"]\npub mod terminal;\n#[path = "%s"]\npub mod terminal_history;\n' \
  "$module" "$history" > "$harness/lib.rs"

cd "$harness"
RUSTFLAGS="${RUSTFLAGS:-} -D warnings" cargo test "$@"
if cargo clippy --version >/dev/null 2>&1; then
  cargo clippy --all-targets -- -D warnings
else
  echo "note: clippy not installed; lint skipped" >&2
fi

if command -v rustfmt >/dev/null 2>&1; then
  rustfmt --edition 2021 --check "$module" "$history"
else
  echo "note: rustfmt not installed; format check skipped" >&2
fi
