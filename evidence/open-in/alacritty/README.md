# Alacritty workspace launch

Conductor Rebuild owns this bounded launcher correction. Default-main `d8f6bdfd26370491295f38ffecd7090c71a2a6db` still opens a workspace with `open -a Alacritty <directory>`. The retained Conductor source instead attempts IPC with an explicit working directory, activates after success, and starts a new instance after a completed nonzero IPC command.

## Reference and reachability

[The frozen source packet](source-v1/source-packet.json) records the original renderer and binary hashes, retained REA evidence ID, exact byte ranges, and producer/consumer joins. `ICi` passes an active local workspace's path and boundary through `P9` to `uD`. The directory helpers keep that workspace boundary. The `uD` Alacritty branch calls `alacritty msg create-window --working-directory <directory>`, then `open -a Alacritty` on success. A completed nonzero first command uses `open -na Alacritty --args --working-directory <directory>` and reports a failed fallback. `OGe` appends system and user bundle CLI directories after the existing PATH.

These are retained compiled-source observations, not native execution. Original JavaScript is inert evidence and was not evaluated. The retained REA worker limitation and source-only acquisition status remain in the packet. Its historical execution restrictions and UNRUN status describe capture time, not later hosted-test authorization.

## Immutable regression

`src-tauri/src/open_in/alacritty_workspace_tests.rs` is byte-identical to the sealed L01-L03 fixture, SHA256 `00179e5da85d9dee38ad3db0d5ab66b7e7d2f257a63f69b972ff38e06e881343`. It drives the real `run_macos_open` function with an injected command runner and exact existing test inputs. It does not launch an application.

- L01 expects IPC with the workspace directory, then activation.
- L02 expects the new-instance working-directory fallback after initial failure.
- L03 expects the fallback error rather than the first error.

The legacy injected `Result<(), String>` runner cannot distinguish a completed nonzero command from a transport exception. These three cases cover the command/result strategy only. The implementation must preserve structured command status at the production boundary rather than infer transport parity from these tests.

At the test-first publication, behavioral checks are pending. The intended baseline result is three assertion failures. A compilation failure, missing dependency, timeout, or setup error is not RED. Automatic hosted CI runs `cargo test --locked` in `src-tauri` on macOS and Linux. No local Rust, Node, browser, app, native execution, installation, workflow dispatch, or additional executor is part of this lane.

## Static verification

Run `python3 evidence/open-in/alacritty/verify_source.py`. It verifies the frozen manifest, all 13 source spans, four historical baseline files, and the exact fixture. It does not verify behavior. `git diff --check` checks whitespace. Hosted results and exact heads will be recorded here after observation.

Model the Domain keeps completed exit status distinct from transport failure. Test Behavior, Not Implementation keeps the fixture assertions on commands observed by the external application. Prove It Works requires hosted failing-before and passing-after results rather than treating the source comparison as execution.

## Scope and limits

The lease covers only the Alacritty workspace-folder branch, its dedicated PATH helper and adapter, and new regression/evidence. WezTerm and its helper, other launchers, file opens, ICON15, Move12, M11, Settings49, and native queue ordering remain unchanged. The pending ICON packet is preserved separately at commit `f68e50040d5afdc8b59e964a587298e94431ba0e` and in a 23-file archive with SHA256 `44e38b802ec1f5da52bcfb6fc6c4656eb44c727cb5bbb6c6490fb68d0e1d3442`; it is excluded from this PR.

Actual Alacritty IPC, window activation, workspace cwd, installed-app discovery, bundle-only PATH, clipboard/default persistence, packaged menu ordering, native visuals, and side-by-side parity remain unverified. No screenshot is supplied because native/browser execution is not admitted. A successful consuming macOS package must be checked separately after merge and is not behavioral proof.
