#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
harness="$(mktemp -d)"
trap 'rm -rf "$harness"' EXIT
mkdir -p "$harness/src"
printf '[package]\nname = "cloud-ui-prefs-check"\nversion = "0.0.0"\nedition = "2021"\n[dependencies]\nserde = { version = "1", features = ["derive"] }\nserde_json = "1"\ntoml = "0.8"\n[target.\x27cfg(target_os = "macos")\x27.dependencies]\nsecurity-framework = "3"\n[workspace]\n' > "$harness/Cargo.toml"
printf '\n[dependencies.oc-scripts]\npath = "%s/crates/scripts"\n' "$root" >> "$harness/Cargo.toml"
cat > "$harness/src/lib.rs" <<RS
#[path = "$root/src-tauri/src/agent/mod.rs"]
pub mod agent;
pub mod settings {
    #[path = "$root/src-tauri/src/settings/model.rs"]
    mod model;
    pub use model::*;
    #[path = "$root/src-tauri/src/settings/table_prefs.rs"]
    pub mod table_prefs;
}
RS
cargo test --manifest-path "$harness/Cargo.toml" settings::table_prefs
cargo clippy --manifest-path "$harness/Cargo.toml" --all-targets -- -D warnings
