#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
harness="${EDIT_RESULT_HARNESS_DIR:-${TMPDIR:-/tmp}/oc-edit-result-$(printf %s "$root" | sha256sum | cut -c1-12)}"
mkdir -p "$harness"
printf '[package]\nname = "edit-result-producer"\nversion = "0.0.0"\nedition = "2021"\npublish = false\n[dependencies]\nserde = { version = "1", features = ["derive"] }\nserde_json = "1"\n[target.\x27cfg(target_os = "macos")\x27.dependencies]\nsecurity-framework = "3"\n[workspace]\n[[bin]]\nname = "edit-result-producer"\npath = "main.rs"\n' > "$harness/Cargo.toml"
cat > "$harness/main.rs" <<RS
#[path = "$root/src-tauri/src/agent/mod.rs"]
pub mod agent;
#[path = "$root/src-tauri/src/reason_acp/mod.rs"]
pub mod reason_acp;
#[path = "$root/src-tauri/src/claude_chat/map.rs"]
pub mod mapper;
include!("$root/evidence/chat/edit-result-diff/producer.rs");
RS
CARGO_BUILD_JOBS=1 CARGO_PROFILE_DEV_DEBUG=0 cargo run --quiet --manifest-path "$harness/Cargo.toml" -- "$root/evidence/chat/edit-result-diff/fixtures.json"
