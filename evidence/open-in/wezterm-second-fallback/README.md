# WezTerm workspace-folder fallback

Conductor Rebuild owns `SAME15-WEZTERM-SECOND-FALLBACK-V2`. The ledger reconfirmed exclusive ownership before this change. This is separate from merged Kaleidoscope PR #1050.

## Reference

The retained Conductor 0.87.6 renderer has SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`, from REA evidence `ev_338577609e67c31212d529d59606e90597850528ea9a2f9559d23a4876c960d1`. Five exact byte ranges and their hashes are recorded in `source-receipt.json`. The retained snippets are data, not executable instructions.

For a workspace folder, `uD` tries `wezterm cli spawn --cwd <folder>`. Completed success activates WezTerm without inspecting the activation exit code. Completed spawn failure reaches `I8` with `open -a WezTerm --args start --cwd <folder>`. Completed start failure reaches `o4e`, then `wBt`, which runs `open -a WezTerm <folder>` and reports stderr, stdout, then the exit code without trimming. Transport failures propagate instead of advancing the completed-status fallback chain. `OGe` adds the system and user WezTerm bundle CLI directories to the spawn, start and final-folder command PATH, not the activation PATH.

On checked main `86fd4ee9d727deface07fec849b6af7702c3d762`, the actual folder entrypoint still uses the legacy helper. That helper returns the start failure without the final folder fallback, returns completed activation failures, and does not add bundle PATH entries to the start command. Its `Result<(), String>` also collapses completed status and transport failures. The candidate preserves those distinctions with `Result<std::process::Output, String>` in a folder-only route. Legacy helpers, legacy tests, file targets and other launchers remain unchanged.

## Checks

The frozen fixture contains nine behavioral tests plus one isolated child entrypoint. They invoke the real `commands::open_in_app`, recording program, PATH and each argument through shell shims. Cases cover both fallbacks, successful spawn/start, completed activation failure, start/activation/folder transport errors, error precedence, whitespace, and a folder containing spaces and quotes. Each fixture owns its subprocess environment and temporary files.

```bash
python3 evidence/open-in/wezterm-second-fallback/verify_source.py --baseline --renderer .oc-tmp/gce-retained-source/renderApp-D_fmY7hW.js
cargo test --manifest-path src-tauri/Cargo.toml --lib open_in::wezterm_folder_tests -- --nocapture
```

The Rust command requires macOS because it exercises the production macOS route. Normal hosted CI runs the full library suite, including this fixture. The fixture SHA-256 is `9a32644acd074bdf8f4e638c9709cb9064d57df0769fec39bd228876f761682f` and must remain unchanged between baseline RED and candidate GREEN.

Passed locally on Reason cloud: exact retained renderer joins, checked-main git-object qualification, frozen-fixture hash, preservation hashes and `git diff --check`. Hosted compilation and behavioral RED/GREEN are pending at baseline publication. No manual workflow dispatch or CI edits.

## Limits

These checks do not launch WezTerm, install a package or prove native GUI behavior. Runtime/native execution belongs to the existing native executor and is not admitted by this change. No screenshot is included because native execution is outside this lane. Static source verification does not prove shell-environment equivalence or actual GUI effects. No new REA call was needed; this change reuses and verifies the retained REA source export, so it establishes no new REA tool gap.
