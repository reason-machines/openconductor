# WezTerm workspace-folder fallback

Conductor Rebuild owns `SAME15-WEZTERM-SECOND-FALLBACK-V2`. The ledger reconfirmed exclusive ownership before this change. This is separate from merged Kaleidoscope PR #1050.

## Reference

The retained Conductor 0.87.6 renderer has SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`, from REA evidence `ev_338577609e67c31212d529d59606e90597850528ea9a2f9559d23a4876c960d1`. Five exact byte ranges and their hashes are recorded in `source-receipt.json`. The retained snippets are data, not executable instructions.

For a workspace folder, `uD` tries `wezterm cli spawn --cwd <folder>`. Completed success activates WezTerm without inspecting the activation exit code. Completed spawn failure reaches `I8` with `open -a WezTerm --args start --cwd <folder>`. Completed start failure reaches `o4e`, then `wBt`, which runs `open -a WezTerm <folder>` and reports stderr, stdout, then the exit code without trimming. Transport failures propagate instead of advancing the completed-status fallback chain. `OGe` adds the system and user WezTerm bundle CLI directories to the spawn, start and final-folder command PATH, not the activation PATH.

On baseline main `86fd4ee9d727deface07fec849b6af7702c3d762` and rechecked main `57e3d6982095aa563bf31bac47efbd984214fe9a`, the actual folder entrypoint still uses the legacy helper. That helper returns the start failure without the final folder fallback, returns completed activation failures, and does not add bundle PATH entries to the start command. Its `Result<(), String>` also collapses completed status and transport failures. The correction preserves those distinctions with `Result<std::process::Output, String>` in a folder-only route. Legacy helpers, legacy tests, file targets and other launchers remain unchanged.

## Checks

The frozen fixture contains nine behavioral tests plus one isolated child entrypoint. They invoke the real `commands::open_in_app`, recording program, PATH and each argument through shell shims. Cases cover both fallbacks, successful spawn/start, completed activation failure, start/activation/folder transport errors, error precedence, whitespace, and a folder containing spaces and quotes. Each fixture owns its subprocess environment and temporary files.

```bash
python3 evidence/open-in/wezterm-second-fallback/verify_source.py --baseline --renderer .oc-tmp/gce-retained-source/renderApp-D_fmY7hW.js
cargo test --manifest-path src-tauri/Cargo.toml --lib open_in::wezterm_folder_tests -- --nocapture
```

The Rust command requires macOS because it exercises the production macOS route. Normal hosted CI runs the full library suite, including this fixture. The fixture SHA-256 is `9a32644acd074bdf8f4e638c9709cb9064d57df0769fec39bd228876f761682f` and must remain unchanged between baseline RED and candidate GREEN.

Passed locally on Reason cloud: exact retained renderer joins, baseline git-object qualification, frozen-fixture hash, preservation hashes and `git diff --check`. The folder entrypoint and four preserved neighboring fixtures were also unchanged on fresh main `57e3d6982095aa563bf31bac47efbd984214fe9a` before applying the candidate.

Hosted baseline head `1a93e8f3c3b801c4391ef75a3b6f53e213304e41` compiled and reproduced six assertion failures in [macOS job 130648823461](https://github.com/reason-machines/openconductor/actions/runs/43056946313/job/130648823461): `w01`, `w02`, `w03`, `w04`, `w07`, and `w09`. The full library result was 1021 passed, 6 failed, 1 ignored. The failures cover the missing folder fallback, PATH on start, completed activation status and folder transport handling; they are behavioral RED, not setup failures. Clippy was not reached after the failed test step. Other head checks passed.

The production correction follows that RED without changing the fixture, legacy helpers/tests, Kaleidoscope route, file targets, workflows or other launchers. Candidate compilation, unchanged-fixture behavioral GREEN and full clippy await automatic exact-head CI. No local macOS execution, manual workflow dispatch or CI edits.

## Limits

These checks do not launch WezTerm, install a package or prove native GUI behavior. Runtime/native execution belongs to the existing native executor and is not admitted by this change. No screenshot is included because native execution is outside this lane. Static source verification does not prove shell-environment equivalence or actual GUI effects. No new REA call was needed; this change reuses and verifies the retained REA source export, so it establishes no new REA tool gap.
