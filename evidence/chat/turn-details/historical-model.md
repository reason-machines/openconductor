# Historical turn model attribution

Conductor Rebuild. Offline source-only investigation and correction, 2026-11-08. Source baseline is main `44e5b6a7`; no provider, runtime, browser, native app, install or workflow dispatch was started.

## Retained shipped-app evidence

Conductor 0.87.6's REA-extracted renderer `renderApp-D_fmY7hW.js` was rehashed locally as SHA256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. Its companion store chunk `index-BGEQ8YjU.js` hashes to `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`. These match the [retained extraction manifest](../../frontend/tauri-assets-manifest.json), not a new installed-app observation. Offsets below are zero-based UTF-8 bytes.

- Renderer `TDo` at 8,919,506 computes its model from `aiMessages.find(RDo)?.model ?? userMessage.model` (minified variables `i` and `r`). `RDo` at 8,927,562 returns the message's model. Therefore the first assistant message with a truthy model wins, otherwise the original user message's stored model is used. This is not the last assistant model or the session's current picker value. It does not prove every turn has a model or that all messages in a turn used the same model.
- `kDo`, immediately before `TDo`, formats a known model as `<model> via <agent>`; a missing or unknown catalog model shows the agent alone. The agent name is still obtained from the session's agent type. The correction does not claim historical agent-type tracking.
- Store chunk `AB` at 1,163,571 restores `model` from the individual row; `Mb` at 1,165,837 constructs an assistant row with the supplied model. `addAssistantMessage` near 1,177,434 forwards and persists `e.model`. The [SQL query inventory](../../sqlite/sessions-messages-attachments-queries.md) separately establishes `session_messages.model` and `turn_id`. Nullable storage is a capability, not proof of producer coverage. Some batched-feed construction paths near 1,465,561 explicitly create rows with `model:null`.

The existing [REA invocation log](../../rea/rea-invocations.tsv), particularly `model_live_trace`, `model_live_bundle_read` and `chat_status_trace_seeds`, records JS tracing limitations. This pass used bounded reads of those already-retained, hash-checked bytes. It made no new REA invocation or capability claim. Minified extracted code is not original source, and static analysis is not runtime acceptance.

## OpenConductor boundary and change

`ChatMessage.model` is optional in [types.ts](../../../src/features/chat/types.ts). [persist.ts](../../../src/features/chat/persist.ts) serializes the complete message into `fullMessage` and restores it. The [database chat-message store](../../../crates/openconductor-db/src/chat_messages.rs) writes and reloads that JSON without deriving a new model. No schema or provider change is needed to consume an existing message snapshot.

Before this correction, `WorkspaceView` read the chat's current Reason configuration once and passed the same formatted `turnAgent` string to every footer. `view.ts` did not carry any message model into the footer. Consequently historical message models were ignored and a current configured model could be attributed to old turns.

The corrected row selects the first truthy assistant model, otherwise the original own-user message's snapshot. Reports, system messages, later steering messages and other turns are not fallback sources. The footer formats this model through the existing catalog helper. `WorkspaceView` supplies only the agent's label, not a selected model. Missing historical information remains agent-only.

Producer limits remain explicit:

- Reason's frontend reducer constructs messages without a model. `sessionModel` updates the picker through `reasonChat.ts`, while `reason.ts` emits no transcript event for it. It is not a turn-keyed message snapshot, so this correction does not attach it to a turn.
- Claude's `claude_stream.rs` retains raw assistant message JSON and an init model, but `claude_chat/map.rs` forwards text/thought/tool/usage events without a per-message model. Its current frontend shares the Reason reducer. No Claude model is invented from init or configuration.
- Codex's frontend `codex.ts` message constructor also does not attach a model. Selecting a model for `turn/start` is not treated here as observed execution metadata.
- Existing or future messages that actually carry `model` retain it across JSON save/restore. Providers that omit it continue to show only their agent name. Backfilling unknown old turns and changing provider telemetry are outside this patch.

## Verification

- Before the fix, `node --experimental-strip-types --test src/features/chat/view.test.ts` failed three new attribution assertions. Twelve checks passed, three failed. The unknown-data case already passed.
- After the fix, `node --experimental-strip-types --test src/features/chat/view.test.ts src/features/chat/persist.test.ts src/features/chat/fork.test.ts src/features/chat/reasonChat.test.ts src/features/chat/chatRuntime.test.ts` passed all 58 checks. Coverage includes assistant precedence, original-user fallback, later steering/report/system exclusion, turn isolation, missing models, attachment-only prompts and full-message save/restore.
- `node --experimental-strip-types tools/chat/check-turn-model-reference.mjs <retained-renderer-path>` passed three cases against the exact hash-checked shipped renderer's extracted pure selector and OpenConductor's real row builder. This runs only the bounded selector, not the app or an agent.
- `node --experimental-strip-types --test "src/**/*.test.ts"` passed all 1,462 tests, with no failures or skips.
- `node node_modules/typescript/bin/tsc --noEmit` passed. `git diff --check` and `node --check tools/chat/check-turn-model-reference.mjs` passed.
- No screenshot is provided because browser/native execution was expressly excluded. No packaged/native/live-provider or on-disk restart acceptance was run. JSON roundtrip coverage is not SQLite or actual restart acceptance.

## Separate permission, answer, resume and cwd boundary

No permission/cwd code changed. Existing retained evidence is in [chat status](../../chat-status/README.md), [ACP waits](../../chat-status/acp-question-wait.md) and [Codex consents](../../chat-status/codex-consent.md). Their reference status/request/answer mappings are static shipped-app observations, not a successful live-provider journey. Their old provider-version limitations must not be promoted to claims about today's installed CLI.

Current source establishes the following disconnected boundaries:

1. `chatRuntime.ts` routes an answer by chat and request ID. Reason's adapter invokes `reason_answer_permission` with an option ID or cancellation.
2. Rust `reason_acp/provider.rs::answer_permission` removes only the matching chat's pending request, responds on its saved RPC ID, and emits `PermissionResolved`. This continues the waiting prompt; it is not a new prompt or a `session/resume` call.
3. On opening/reconnecting a stored chat, `ensure_session` locates its owning Reason workspace and sends `session/resume` with the stored session ID and the chat's cwd. A live matching generation is reused without resume. The selected app workspace is not substituted for the stored session's ownership.
4. Existing `provider_tests.rs` permission and relaunch tests use a fake provider. `reasonChat.test.ts` tests frontend answer/status plumbing with fake invoke/listen. The built-app E2E source `tools/e2e/reason-chat.e2e.mjs` exercises a fake permission request and a separate relaunch flow. This pass ran the frontend pure tests, not the Rust harness or E2E. None is real authenticated agent delivery, execution cwd, or native acceptance.

Residual runtime observation, for the existing runtime owner only when its destination is authorized: open a disposable worktree A, record app chat ID, provider session ID, owning Reason workspace and expected cwd; cause one legitimate read-only command approval and correlate its request/tool/RPC IDs; answer it in the actual mounted app and observe that same pending request resolve once, followed by a harmless `pwd` result matching A. Then close/reopen the app with worktree B selected, return to A and request another `pwd`; verify the same provider session and ownership resume in A, with no new session, 409, or cwd drift. Record structured question delivery separately from ordinary text. Do not infer a live structured approval merely because a synthetic card renders. For model acceptance, use two observed model-bearing turns, change the picker, reopen the transcript, and confirm each old footer retains its original available snapshot; mark a model-less provider unknown rather than filling it from the current picker.
