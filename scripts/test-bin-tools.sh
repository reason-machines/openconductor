#!/usr/bin/env bash
# Test the bundle's bin/ tools end to end without building the Tauri app.
#
# checkpoint/, tool_cli.rs and bundled_bin.rs use only std and the git CLI,
# so a throwaway crate compiles them with a minimal `openconductor` main that
# does what src-tauri/src/main.rs does in tool mode. The script runs their
# unit tests, then runs the real shims from src-tauri/resources/bin-tools/
# in the two layouts they ship in:
#   1. $APPDATA/bin/ after install, with .internal/openconductor linked to
#      the binary (bundled_bin::link_exe);
#   2. OpenConductor.app/Contents/Resources/bin/, next to Contents/MacOS/.
#
# Usage: scripts/test-bin-tools.sh
# Env:   BIN_TOOLS_HARNESS_DIR  where to generate the harness crate
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src="$repo/src-tauri/src"
shims="$repo/src-tauri/resources/bin-tools"
harness="${BIN_TOOLS_HARNESS_DIR:-${TMPDIR:-/tmp}/bin-tools-harness}"
mkdir -p "$harness/src"

cat > "$harness/Cargo.toml" <<EOF
[package]
name = "bin-tools-harness"
version = "0.0.0"
edition = "2021"
publish = false

[lib]
path = "src/lib.rs"

[[bin]]
name = "openconductor"
path = "src/main.rs"

[workspace]
EOF
cat > "$harness/src/lib.rs" <<EOF
#[path = "$src/bundled_bin.rs"]
pub mod bundled_bin;
#[path = "$src/checkpoint/mod.rs"]
pub mod checkpoint;
#[path = "$src/tool_cli.rs"]
pub mod tool_cli;
/// spotlighter needs the app's spotlight watcher (notify, ignore); its own
/// tests run in the app crate. Here it only proves the shim reaches tool mode.
pub mod tool_spotlighter {
    pub fn main(_cwd: &std::path::Path) -> i32 {
        eprintln!("harness: spotlighter stub");
        3
    }
}
EOF
cat > "$harness/src/main.rs" <<'EOF'
fn main() {
    if let Some(code) = bin_tools_harness::tool_cli::dispatch(std::env::args_os()) {
        std::process::exit(code);
    }
    eprintln!("harness: only tool mode is built");
    std::process::exit(9);
}
EOF

if rustfmt --version >/dev/null 2>&1; then
  rustfmt --edition 2021 --check "$src/tool_cli.rs" "$src/tool_cli_tests.rs" "$src/checkpoint/mod.rs"
else
  echo "note: rustfmt not installed; format check skipped" >&2
fi
(cd "$harness" && RUSTFLAGS="${RUSTFLAGS:-} -D warnings" cargo test --quiet && cargo build --quiet)
exe="$harness/target/debug/openconductor"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
fail() { echo "FAIL: $*" >&2; exit 1; }
expect() { # expect <name> <want> <got>
  [[ "$2" == "$3" ]] || fail "$1: want [$2], got [$3]"
  echo "ok - $1"
}

# Layout 1: installed into $APPDATA/bin.
appbin="$tmp/appdata/bin"
mkdir -p "$appbin/.internal"
cp "$shims/checkpointer.sh" "$shims/git-busy-check.sh" "$shims/spotlighter.sh" "$appbin/"
ln -s "$exe" "$appbin/.internal/openconductor"

# Layout 2: the app bundle, no .internal link.
bundle="$tmp/OpenConductor.app/Contents"
mkdir -p "$bundle/Resources/bin" "$bundle/MacOS"
cp "$shims/checkpointer.sh" "$shims/git-busy-check.sh" "$shims/spotlighter.sh" "$bundle/Resources/bin/"
cp "$exe" "$bundle/MacOS/openconductor"

ws="$tmp/ws"
git init -q "$ws"
cd "$ws"
git config user.name T && git config user.email t@example.invalid
echo one > a.txt && git add a.txt && git commit -qm init

for bin in "$appbin" "$bundle/Resources/bin"; do
  label="$(basename "$(dirname "$bin")")"
  git update-ref -d refs/conductor-checkpoints/s1 2>/dev/null || true
  expect "$label: save prints the id" "s1" "$("$bin/checkpointer.sh" save --id s1)"
  expect "$label: ref written" "true" "$(git rev-parse -q --verify refs/conductor-checkpoints/s1 >/dev/null && echo true)"
  echo two > a.txt && echo u > untracked.txt
  expect "$label: diff vs current" "$(printf 'M\ta.txt\nA\tuntracked.txt')" \
    "$("$bin/checkpointer.sh" diff s1 current -- --name-status)"
  expect "$label: restore" "restored checkpoint: s1" "$("$bin/checkpointer.sh" restore s1)"
  expect "$label: files back" "one" "$(cat a.txt)"
  [[ ! -e untracked.txt ]] || fail "$label: untracked file survived restore"
  expect "$label: busy check clean" "clean" "$("$bin/git-busy-check.sh" "$ws")"
  set +e
  out="$("$bin/git-busy-check.sh" "$tmp/missing")"; code=$?
  set -e
  expect "$label: busy check bad path" "2 error: bad path" "$code $out"
  set +e
  out="$("$bin/spotlighter.sh" 2>&1)"; code=$?
  set -e
  expect "$label: spotlighter reaches tool mode" "3 harness: spotlighter stub" "$code $out"
done

# Mid-merge: save is a silent 101 and the busy check names the operation.
git rev-parse HEAD > .git/MERGE_HEAD
set +e
err="$("$appbin/checkpointer.sh" save 2>&1)"; code=$?
set -e
expect "merge in progress: save skipped" "101 " "$code $err"
expect "merge in progress: busy check" "busy:merge" "$("$appbin/git-busy-check.sh" "$ws")"
rm .git/MERGE_HEAD

echo "all bin tool checks passed"
