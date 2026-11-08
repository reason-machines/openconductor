#!/usr/bin/env bash
# Build, test and lint the full workspace archive (src-tauri/src/workspace_archive/)
# without the Tauri crate, which needs WebKit to build. The harness crate
# mounts the modules it uses (checkpoint, workspace in its std-only build,
# workspace_archive) with #[path] and depends on the path crates directly.
# The Tauri command wrapper (src-tauri/src/workspace_archive_commands.rs) is
# type-checked here against a stub `tauri` (State and the command attribute)
# and stub `db` / `settings` modules with the app's signatures; ci.yml's app
# job compiles it against the real ones.
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
tauri = { path = "tauri" }

[dev-dependencies]
sqlx = { version = "0.8.6", default-features = false, features = ["sqlite", "runtime-tokio"] }
# Match the std-enabled rustix used by the app and oc-scripts' test graph.
rustix = { version = "1", features = ["std"] }

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
#[path = "$src/workspace_archive_commands.rs"]
pub mod workspace_archive_commands;

/// Stand-ins with the app's signatures for what the command wrapper uses.
pub mod db {
    pub struct Db(pub openconductor_db::SqlitePool);
}
pub mod settings {
    pub mod effective {
        pub fn resolve(
            _repo_root: &std::path::Path,
            _workspace: Option<&std::path::Path>,
        ) -> Result<oc_scripts::config::EffectiveSettings, String> {
            Err("stub".into())
        }
    }
}
RS
# A stub `tauri` crate: State and a no-op #[tauri::command].
mkdir -p "$harness/tauri" "$harness/macros"
cat > "$harness/tauri/Cargo.toml" <<TOML
[package]
name = "tauri"
version = "0.0.0"
edition = "2021"
publish = false

[lib]
path = "lib.rs"

[dependencies]
archive-harness-macros = { path = "../macros" }
TOML
cat > "$harness/tauri/lib.rs" <<RS
pub use archive_harness_macros::command;
// Like Tauri's: no public fields, so state.0 derefs to the managed value.
pub struct State<'r, T> {
    value: &'r T,
}
impl<'r, T> State<'r, T> {
    pub fn inner(&self) -> &'r T {
        self.value
    }
}
impl<T> std::ops::Deref for State<'_, T> {
    type Target = T;
    fn deref(&self) -> &T {
        self.value
    }
}
RS
cat > "$harness/macros/Cargo.toml" <<TOML
[package]
name = "archive-harness-macros"
version = "0.0.0"
edition = "2021"
publish = false

[lib]
proc-macro = true
path = "lib.rs"
TOML
cat > "$harness/macros/lib.rs" <<RS
use proc_macro::TokenStream;
#[proc_macro_attribute]
pub fn command(_attr: TokenStream, item: TokenStream) -> TokenStream {
    item
}
RS

cd "$harness"
export RUSTFLAGS="${RUSTFLAGS:-} --cfg workspace_std_only"
cargo test "$@" workspace_archive
if cargo clippy --version >/dev/null 2>&1; then
  cargo clippy --all-targets -- -D warnings -A dead_code
else
  echo "note: clippy not installed; lint skipped" >&2
fi
