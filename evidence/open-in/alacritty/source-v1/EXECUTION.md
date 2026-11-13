# Alacritty workspace launcher source packet

Conductor Rebuild prepared this packet against default-main d8f6bdfd26370491295f38ffecd7090c71a2a6db on Reason Cloud. It is SOURCE ONLY. No product patch, syntax check, Rust test, native launch, installation or runtime intake occurred.

## Scope

The ledger confirmed no active or closed Alacritty ownership. Its extended SOURCE-only reservation is the Alacritty branch and dedicated PATH helper in mod.rs, the program==alacritty PATH branch in commands.rs, and this NEW fixture/spec. The root owns the next implementation decision. No product edit, runtime, intake, installation, admission or new queue entry is authorized here. Do not rewrite the WezTerm PATH helper or claim other launchers.

The counterexample is an installed Alacritty and an active nonarchived local workspace. Use the existing unit input /Users/me/workspaces/app with spaces. ICi passes the workspace path as both pathToOpen and boundary through P9 to uD. The directory helper clamps the parent to that boundary. Original Alacritty first attempts IPC create-window with --working-directory, activates after success, and uses open -na Alacritty --args --working-directory after failure. Main instead asks the generic opener to open the directory as a positional argument.

## Immutable regression, prepared but UNRUN

Payload alacritty_workspace_tests.rs belongs at src-tauri/src/open_in/alacritty_workspace_tests.rs only in the eventual admitted executor checkout. fixture-load.patch adds its cfg(test) module declaration without changing production behavior. Neither file has been applied to the product checkout. It calls the existing real run_macos_open function with an injected process runner, not a copied launch implementation.

L01 expects IPC arguments then activation on success. L02 expects IPC arguments then a new-instance cwd fallback when the first command fails. L03 expects the fallback command and its failure, rather than returning the first command's failure. All input paths and synthetic failure strings come from existing open_in/tests.rs cases retained in the packet. No source or fixture file may be repaired in order to turn setup failure into RED.

Proposed future command, only after explicit ordered admission through the existing E1:

    timeout --kill-after=5s 180s cargo test --manifest-path src-tauri/Cargo.toml --lib open_in::alacritty_workspace_tests:: -- --test-threads=1

Preconditions are an already usable executor checkout and its existing Rust dependencies. If unavailable, stop as INVALID/UNRUN; do not install, create a host or launch another executor. A timeout, compilation error, missing module, missing dependency or unsupported setup is INVALID, not RED.

Intended baseline assertion failures, predicted from source and NOT OBSERVED:
- L01 call vector is currently one generic open -a Alacritty <path>, not IPC plus activation.
- L02 currently returns the first error without fallback, rather than Ok and two calls.
- L03 currently returns spawn failed, not start failed after fallback.

A candidate may replace only its source-qualified Alacritty workspace branch after the intended baseline failures are observed. Repeat the identical fixture bytes against it. Keep all original open_in tests unchanged and run their existing nearby controls in the same admitted executor. Record exact main/candidate SHA, fixture hashes, command, exit code, complete test output, time/resource limits and stop receipt. Do not call this native or application-level proof.

## Unverified details

These tests do not cover actual Alacritty IPC, windows, cwd, installed-app discovery, bundle-only PATH, clipboard, persistence, native menus, file-level opens, remote targets, or UI visuals. OGe appends both bundle directories after PATH, but a future explicit Alacritty-only PATH boundary remains to be implemented and tested. Original Kc returns structured command status; the current Rust Result-only runner does not distinguish nonzero activation status from transport exceptions. This fixture makes no assertion about activation failure semantics. Preserve that distinction rather than claiming full transport parity.

## Queue and preservation

No E1 intake/admission request is part of this packet. ICON15, Move12, M11, Settings49 and every older frozen packet and queue position are unchanged. Full workspace checkpoint is unavailable because the captured workspace exceeds 128 MiB. This compact source/fixture packet is not a complete workspace backup and not behavioral evidence.
