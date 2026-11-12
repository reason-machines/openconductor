# File comment counts and prompt handoff

Conductor Rebuild owns this focused change. File comment counts use the stored workspace's active pending or ready-for-review comments, keyed by the exact file path. Adding or removing a composer attachment does not mark a comment delivered. A request-scoped successful transport-write callback marks the captured comments reviewed once, preserves superseded rows and cannot be confused with command completion or the visible chat. Queued and failed-unsent payloads retain their identities. The browser stand-in never credits an actual handoff.

## Reference and scope

The retained real-Conductor 0.87.6 REA closure is copied under `reference/`. Its original timestamps, identities, hashes and source-only statuses are historical evidence, not new live-app observations. The local transport-write boundary follows that retained closure. Full pre-handoff cancellation timing parity is not established. The prepared contract's suggestion that a preview may simulate handoff is superseded here by the explicit no-handoff regression.

Current default-branch source checked before implementation was `9c276e2e86c0bd7ed97c8ccd0467f30c7a8ebcab`. The genuine unchanged baseline ran on assigned head `cfe8c12d86fab877158bfd465f348813752e24e0`. The candidate ran after a normal merge of main at `0d5f6dfbc7043f9d889945ded377e4bdae4eb789`; the intervening main change was the disjoint, coordinated local header details change. The assigned branch was retained.

The frozen v3 archive is `a85dcbbf9570d2801cb02c6a3822ac289f4a5356a545ea8d33f9eefd5b540d1e`. The original v4 source capsule and all three original acceptance files remain unchanged as inert evidence under `historical/`. The original historical V1/V2 tests are also retained there. Their attachment-clears-count expectation is not current parity acceptance. No historical assertion was silently weakened or substituted for the frozen lifecycle cases.

## Actual baseline and identical passing check

Both commands ran once on Cloud352 using the same three byte-identical frozen inputs. No candidate source override or original Conductor JavaScript was executed.

```bash
nice -n 19 timeout --kill-after=5s 90s node --max-old-space-size=768 --test --test-concurrency=1 src/features/diff/fileCommentCountLifecycle.test.ts src/features/chat/reviewCommentHandoff.test.ts src/features/chat/desktopReviewHandoff.test.ts
```

- Baseline failed with exit 1 at 15:08:52 UTC. Of 26 cases, 6 passed and 20 failed. Seventeen failures are observable count, attachment, restored-identity, retry-payload or handoff-transition assertions. Three are the actual host's missing handoff capability preconditions, not evidence of native execution. All failures are `AssertionError` with `ERR_ASSERTION`, with no import, TypeError, bootstrap, timeout or resource failure. Wall time was 3.796022398 seconds.
- Candidate passed all 26 cases with exit 0 at 15:10:46 UTC. Wall time was 3.908498477 seconds. No cases were skipped or cancelled.
- `results/actual-baseline-cases.json` preserves every baseline case name and classification. The original stdout and stderr bytes, exact commands, source commit, timestamps and SHA256 values are preserved alongside the passing output. Baseline stdout is stored losslessly as `actual-baseline.stdout.tap.gz` because Node's assertion diffs contain trailing whitespace; decompress it to verify the original receipt's hash.

The host tests execute the actual frontend persistence adapter against explicit browser storage or a captured IPC invocation. They do not prove the Rust command ran or a provider received a prompt.

## Fixture compatibility after the first hosted check

The first published head `82d49d1e0599649577d0446f7a83828ac4eb584d` failed hosted TypeScript checking at three fixture locations. Two save ports returned undefined instead of the existing `Promise<boolean>` contract. A narrowed unknown host callback lost its narrowing inside a returned closure. No product type error was reported in that result.

The corrective commit changes only those test ports. Saves return true, and the callback is captured after the unchanged capability assertion while preserving its receiver. Every assertion line and test declaration is unchanged. There is no product type weakening, type suppression, test exclusion or changed expectation.

The original RED and identical GREEN above remain historical results on the original frozen bytes. Corrected delivered inputs have distinct identities in `fixture-compatibility.json` and `manifest.json`. They must not be described as byte-identical to the original frozen command. Corrected-input local replay and local typecheck have not run; the existing serialized row retains the replay request, and exact-head hosted CI is the immediate check. The original three files and hashes are preserved in `historical/*.original-v3.test.ts.txt`.

## Actual adjacent checks

The existing strict test loaders now receive the real review-change subscription dependency. Their guards and assertions are unchanged.

```bash
nice -n 19 timeout --kill-after=5s 120s node --max-old-space-size=768 --test --test-concurrency=1 src/features/diff/newInlineDraftRemount.test.ts src/features/diff/multiAnchorDrafts.test.ts
```

Passed 29 of 29 cases, exit 0, 1.228959352 seconds.

```bash
nice -n 19 timeout --kill-after=5s 120s node --max-old-space-size=768 --test --test-concurrency=1 src/features/chat/previewHandoffBoundary.test.ts src/features/chat/promptHandoffAdapters.test.ts
```

Passed 4 of 4 cases, exit 0, 1.262809401 seconds. Two are additive preview completion/cancellation regressions. Two execute the actual adapter methods with a request-scoped channel port. They remain separate from the unchanged original 26 cases.

```bash
nice -n 19 timeout --kill-after=5s 120s node --max-old-space-size=768 --test --test-concurrency=1 src/features/chat/claudeChat.test.ts src/features/chat/reasonChat.test.ts src/features/chat/codexChat.test.ts src/features/chat/chatRuntime.test.ts src/features/chat/queue.test.ts src/features/diff/comments.test.ts src/features/diff/commentStore.test.ts src/features/chat/composerAttachments.test.ts
```

Passed 70 of 70 cases, exit 0, 3.362724000 seconds. This includes an additive actual Tauri JavaScript Channel frame-routing and cleanup regression. The existing Claude fixture gained only the missing callback registration and cleanup ports; its earlier assertions remain intact. All neighboring checks use test transports, not real Claude Code, Codex or Reason providers.

The runtime slot was explicitly released after cleanup, with no own Node, npm, Cargo, Rust or preview jobs visible. No runtime capacity is held for CI. The local `rustfmt` command could not run because the stable toolchain lacks that component. Rust source was formatted manually. `git diff --check` passed. Hosted formatting validation is still required.

## Native test sources and remaining gaps

Eight retained native test cases are included for hosted CI. They cover workspace-scoped/idempotent persistence and lifecycle decoding, Reason RPC write/flush failure ordering, Codex fake-process write and RPC-error ordering, and Claude fake-process cancellation and pre-send rejection. These sources were not compiled or executed locally. Formatting-only changes and those native test additions followed the frontend checks; the tested frontend source remains unchanged.

Not run locally: TypeScript typecheck, Cargo, clippy, native compilation, native test execution, Tauri IPC integration, real providers, browser/server checks, screenshots, signed app/package and installed-app side-by-side parity. There is no screenshot because the serialized execution grants excluded browser and native UI work. The native test sources are not reported as passing. Build/release inclusion, production deployment and the fixed #992 release cut are not claimed.

Open a ready standalone pull request against main. Every enabled check and triggered workflow on the exact published head must pass before requesting merge. No manually dispatched workflow or additional local execution is implied by this record.
