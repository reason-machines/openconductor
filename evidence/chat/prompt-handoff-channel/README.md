# Required native prompt handoff channels

Conductor Rebuild corrects three native IPC arguments that prevented macOS compilation. The failing signatures were introduced by [PR #1181](https://github.com/reason-machines/openconductor/pull/1181), commit `3c722bf1e`, not by Settings PR #1188. Source diagnosis began at main `94a5aad810e9f0969e45fb6c7644d901023f917c`. The compatibility check fast-forwarded to containing main `c195e1432` without changing the three corrective hunks or the frozen test inputs.

## Observed compiler failure

[Package run 43265843263, job 131349068770](https://github.com/reason-machines/openconductor/actions/runs/43265843263/job/131349068770) compiled main `392b0924406ba31bc011a084a4235d93f9bc2ba9`. Its `scripts/package-macos.sh --identity -` build exited 1. It reported the same `E0277` error from `reason_prompt`, `codex_prompt`, and `claude_prompt`:

```text
error[E0277]: the trait bound `Channel<()>: serde::Deserialize<'de>` is not satisfied
= note: required for `std::option::Option<Channel<()>>` to implement CommandArg
error: could not compile `openconductor` (lib) due to 3 previous errors
```

[The retained error identities](hosted-baseline.json) come from that actual hosted failure. They are not a new local compilation or a behavioral failure. The failed run produced no bundle artifact.

## Cause and correction

The locked Tauri version is 2.12.5. Its [channel implementation](https://docs.rs/tauri/2.12.5/src/tauri/ipc/channel.rs.html#466-482) implements `CommandArg` directly for `Channel<TSend>`. It reads the serialized channel ID and binds it to the invoking webview. `Option<Channel<()>>` instead reaches the ordinary deserialization argument path, which requires a trait that `Channel<()>` does not implement. The compiler diagnostics show that exact requirement.

The Reason, Claude, and Codex frontend adapters already allocate a request-specific `Channel<null>` and pass `onHandoff` on every prompt, including prompts without a consumer callback. Native unit `()` corresponds to that null payload. No Rust caller invokes these command functions directly.

The correction requires `Channel<()>` at each of those three IPC boundaries. It passes `Some(Box::new(...))` to the existing optional provider callback API. No frontend caller, runner, transport, storage, lockfile, test input, or assertion changes. The callback still fires at the successful request write and flush, not at invocation completion or turn completion. The existing once-only, captured-comment handoff behavior remains intact. Claude and Codex remain local-only.

## Verification

On Reason Cloud, ACC admitted exactly this foreground compatibility command:

```bash
NODE_OPTIONS=--max-old-space-size=768 nice -n19 \
  timeout --kill-after=5s 120s node --test --test-concurrency=1 --test-reporter=tap \
  src/features/chat/promptHandoffAdapters.test.ts \
  src/features/chat/reviewCommentHandoff.test.ts \
  src/features/chat/claudeChat.test.ts \
  src/features/chat/codexChat.test.ts
```

- Passed: exit 0, all 17 tests passed, no failures, skips, or cancellations. [Raw TAP](candidate-compatibility.tap).
- Passed: `sha256sum -c evidence/chat/prompt-handoff-channel/frozen.sha256` before and after execution. All four original fixtures and both lockfiles remained unchanged.
- Passed: `git diff --check` for the corrective source and evidence.
- Execution began at `2026-11-12T17:30:51.595315344Z` and ended at `2026-11-12T17:31:48.227467845Z`, including source reconciliation and hash checks. The admitted limit was 180 seconds total, 120 seconds for the test command, one test at a time, a 768 MiB heap, and nice level 19.
- All owned Node, timeout, Cargo, and rustc jobs were terminal. The runtime slot was explicitly released before publication. No install, extra test command, retry, server, browser, provider, native launch, or package dispatch ran here.

These are candidate compatibility controls, not a Node RED-to-GREEN proof or a Rust command-macro compile check. The observed RED is the separate hosted compiler failure above. No synthetic framework stand-in is claimed as real Tauri verification.

## Remaining verification

Local native compilation was not run. This checkout has no Cargo registry cache, native target cache, GTK development package, or WebKit development package. No dependency installation was attempted. Exact-head hosted PR checks remain required before merge.

The existing release owner, Session `992a715e`, retains one corrected macOS package run after a green merge. That run is the smallest available existing hosted route that compiles the real Tauri command macros. This change adds no workflow and does not dispatch another package. Until that run succeeds, corrected native compilation and containing-artifact inclusion remain unverified. Installation, real IPC delivery, native behavior, provider execution, and visual acceptance remain NOT_RUN with the existing native owner. This source-only IPC correction has no UI change and no screenshot.
