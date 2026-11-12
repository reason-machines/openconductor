# Live local Codex MCP status

Conductor Rebuild implemented a correlated query on an already-running local Codex worker, plus an actual result-driven dialog. No query starts a process, sends a prompt, reads configuration, uses transcript tool calls, or queries Reason organization connections. Claude and Reason have no enabled status capability in this unit.

## Failure-first Composer proof

Base checked: `1c8e9593099bce8ebfbc19d83052cbfd47df5ad0`.
First verified increment: `f515956b611c22f99eb374eab87f3fbed460e7c5`.
Frozen test SHA-256: `a571ab4966e0fc32980997aa81c743a5714238b44495a4a13c8d7c4715ef0446`.

The actual Composer/ProseMirror harness accepts an optional runtime callback. The baseline component ignores the new prop, so RED is missing observable callback behavior rather than compilation failure.

- `COMPOSER_SLASH_DIRECTORY_REF=1c8e9593099bce8ebfbc19d83052cbfd47df5ad0 node --experimental-strip-types --test src/features/chat/composerSlashDirectory.test.ts` failed exactly three MCP selection callbacks. Fourteen controls passed. See `composer-red.txt`.
- The identical file against the worktree passed all 17 tests. See `composer-green.txt`.
- Initial RED and the test-oracle repair are retained. The first new suffix assertion compared unnormalized text-part segmentation. The corrected assertion compares the complete editor JSON and exact linear text, plus preserved file-node identity and attachments. The corrected test was replayed against baseline and implementation. The change did not weaken suffix coverage.

Enter, Tab and menu selection delete only the validated slash range and call the status callback without submitting. Agent/skill collisions, stale/nonempty selections, composing guards, missing capability, Plan/Fast and existing directory behavior are covered. These are headless guards, not native IME or focus observations.

## Carrier and lifecycle proof

`CARGO_BUILD_JOBS=1 AGENT_HARNESS_DIR=/tmp/agent-harness-mcp-53346 tools/agent/run-rust-tests.sh codex_ -- --test-threads=1` passed all 50 reported tests. Two existing opt-in live test functions return without execution when `OPENCONDUCTOR_CODEX_BIN` is unset. It was unset; no configured provider was launched. Thus 48 provider-free Codex test bodies executed, including ten new MCP runner tests. See `rust-codex.txt`.

`CARGO_BUILD_JOBS=1 AGENT_HARNESS_DIR=/tmp/agent-harness-mcp-53346 tools/agent/run-rust-tests.sh mcp_status -- --test-threads=1` earlier passed twelve tests, including the three decoder/delivery tests. The later public-worker timeout/drop test is in `rust-codex.txt`. In total, 51 distinct provider-free test bodies were exercised across these checks. The standalone harness compiles the real production agent modules with warnings denied. It does not compile the Tauri application crate.

The explicit synthetic Python executable is `tests/fixtures/codex-mcp-status.py`, SHA-256 `9e0efc4f9a7b126c723fccf6881d4c01c7ce23e2faac53af0a5e501b6c8bedb7`. Its original preparation is retained as `original-stand-in.py`; its source AST parsed successfully. Synthetic rows are not observed provider replies.

Coverage uses actual parsers, session I/O and runner methods for:

- No-live rejection without spawn or transcript events, public-worker timeout and dropping a live pending query.
- Shared unique request IDs, first empty params, subsequent cursor-only params, accumulated pages, null/empty terminal cursors and empty success.
- Required-nullable `nextCursor` and `serverInfo`; actual tool records; nonnullable optional descriptions/annotations and boolean annotations; strict auth states; normalization to name/status/tools only.
- Exact typed correlation, foreign replies, overlapping query rejection, RPC/schema/malformed errors, repeated cursors and retry after failure.
- Replies preserved during `start_turn` and interrupt, including delayed `turn/started`. Stop, consent and approval ownership remains with the existing code.
- Deadlines at enqueue, during pagination, across a buffered interrupt and after receiver delivery of an already-queued result.
- Close, drop/shutdown, fatal turn start/session replacement, interrupt close, initial/pagination writes, approval writes, consent writes and existing default-answer/reject write failures. Only query state is cleaned up on those existing failure paths.

## Frontend proof

`node --experimental-strip-types --test --test-concurrency=1 src/features/chat/localMcpStatus.test.ts src/features/chat/composerSlashDirectory.test.ts src/features/chat/slashCommands.test.ts` passed all 31 tests. See `frontend-green.txt`.

The actual dialog component is rendered headlessly with only its DialogFrame boundary replaced. Loading, empty/success/error, retained rows during refresh/error, disabled refresh while loading, timeout, close/chat/unmount invalidation, Codex-only typed command dispatch and collision behavior are covered. Failed/auth rows are noninteractive and show the original settings hint; no terminal authentication was added. Rows display name/status only, not tool counts or invented detailed errors.

`npm run typecheck` did not finish within the foreground 180-second budget on the saturated shared machine. See `typecheck.txt`. No local build was run afterward. Automatic PR CI is responsible for the frontend typecheck/build verdict. `rustfmt` and Clippy were unavailable; no formatter/linter pass is claimed. `git diff --check` passed before publication.

## Original source qualification and limits

The retained installed Conductor 0.87.6 helper identity and extraction metadata are in `runtime-artifact.json` and `extraction.json`. Original helper SHA-256 is `5723ead40316bb29e3d0b446cdc82bede489cc75443d6ce08a4e6421ae6eac0d`. Extracted inert source is 13,025,924 bytes with SHA-256 `f72df80a11d76bacb7ed7e2a322b420e6250b4a2c7781272877b8c5cf985e6ab`.

The retained helper qualifier replay passed 45 source checks across 13 spans, producing packet SHA-256 `172b7870e923c6832967e892871926b6599e622f36a55e92e2ac87cb740a1c30`. See `source-replay.txt`, `helper-contract.json` and scoped Codex excerpts under `source-spans/`.

`frontend-source.json` retains the original immediate-selection and dialog source packet. `original-row.json` retains the exact row/message/docs source closure with renderer/index hashes and UTF-8 ranges. These are untrusted compiled-source data, not execution instructions or observed rendered behavior.

Two inherited REA gaps remain explicit: REA supplied the Mach-O/Bun segment boundary, followed by manual inert extraction/byte joins rather than semantic recovery; renderer semantic parsing exhausted its heap. Neither source replay nor synthetic fixtures prove real CLI compatibility.

The ledger listed an existing `McpStatusDialog.tsx`; fresh main had none. The corrected scoped lease permits the new real component at that path. Only the additive production invoke registration in `lib.rs` was touched, not the restricted native visual profile.

No browser, preview server, app, native UI, E2E, real provider, cloud Claude/Codex, credential handoff, package workflow dispatch or package watcher was run. There is no screenshot because UI/native admission was expressly excluded. Pixel parity, native focus/IME, installed deployment, actual CLI compatibility, original no-session fallback parity and real MCP health are unverified. The current unit intentionally rejects no-live queries instead of launching a metadata client. Original-brand docs navigation and terminal auth are outside this unit and were not added. The loading indicator reuses the existing app spinner rather than the original working sprite, so sprite/pixel equivalence is not claimed.
