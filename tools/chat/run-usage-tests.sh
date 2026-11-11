#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
harness="${USAGE_HARNESS_DIR:-${TMPDIR:-/tmp}/oc-usage-c9fedcd1}"
mkdir -p "$harness"
printf '[package]\nname = "usage-harness"\nversion = "0.0.0"\nedition = "2021"\n[dependencies]\nserde = { version = "1", features = ["derive"] }\nserde_json = "1"\n[target.\x27cfg(target_os = "macos")\x27.dependencies]\nsecurity-framework = "3"\n[workspace]\n' > "$harness/Cargo.toml"
cat > "$harness/lib.rs" <<RS
#[path = "$root/src-tauri/src/agent/mod.rs"]
pub mod agent;
#[path = "$root/src-tauri/src/reason_acp/mod.rs"]
pub mod reason_acp;
pub mod claude_chat {
    #[path = "$root/src-tauri/src/claude_chat/map.rs"]
    pub mod map;
    #[cfg(test)]
    #[path = "$root/src-tauri/src/claude_chat/map_tests.rs"]
    mod map_tests;
}
RS
printf '\n[lib]\npath = "lib.rs"\n' >> "$harness/Cargo.toml"
cd "$harness"
export REASON_ACP_REPO_ROOT="$root"
CARGO_BUILD_JOBS=1 CARGO_PROFILE_DEV_DEBUG=0 cargo test completed_turn_usage "$@"
