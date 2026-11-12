# Review-comment lifecycle correction

Owner: Conductor Rebuild, SAMEde6. Source baseline: a774da0c5b48b95637f3909b4de16a4021ed5e1f. Assigned HEAD is preserved. No product patch or runtime has run.

## Behavior and boundary

Attachment membership is separate from persisted comment eligibility. Adding/removing a draft chip does not mark the comment delivered. Active pending/ready-for-review file comments retain their counts. The reference local commit is successful sidecar notification handoff (`Ke.notify(QUERY)`), not a provider acknowledgement or agent-turn completion. A rejected handoff retains eligibility; a later provider failure does not restore it after handoff succeeded. Superseded comments must not be revived by the delivered-message update.

## Data shape

A prompt captures immutable review identities with its attachments. A request-scoped handoff callback belongs to that prompt, not to the currently visible chat. The callback is idempotent for its request. The queue and retry keep those identities. Composer membership is derived from actual draft, routed, queued and in-flight attachments, not copied into a second persisted comment state.

The native command takes an optional Tauri IPC channel. It sends one unit event only after the existing prompt transport write succeeds. The channel already correlates that event with the exact invocation, so no global chat-to-current-prompt map or new provider protocol is needed. Existing command completion still represents turn completion and is not used as handoff.

## Selected necessary-only native producers

- `reason_chat::reason_prompt`: accept optional request channel and pass a one-shot handoff sink with the prompt. `reason_acp/provider::{prompt_expected,run_prompt}` passes it only to `session/prompt`. `reason_acp/rpc::RpcConnection` signals after successful existing `write_line`, before waiting for the response. A failed write, session-open failure or stop before the request does not signal.
- `claude_chat::commands::claude_prompt`: pass the optional handoff channel to `runner::prompt_with_options`. Signal immediately after the existing `live.session.send_user(text)` returns success, before waiting for the turn's receiver. No signal on stopped-before-send, process startup failure or write error.
- `codex_chat::codex_prompt`: carry the optional request channel through `CodexRunner::Prompt`. `Worker::begin` passes the one-shot sink to `CodexSession::start_turn`; its request path signals only after `send_request` successfully writes/flushed `turn/start`, before waiting for the correlated server response. A rejected actor enqueue or process/session startup never signals. The later provider result is not the handoff boundary.

Provider requests, authentication, CLI selection, response handling, cancellation policy and agent execution remain unchanged. No native provider call is part of validation. Existing fake transport/unit tests must prove write success/failure and event ordering.

## Selected frontend consumers

- Extend the existing `PromptRequest` with the request-scoped callback. Reason/Claude adapters and Codex's separate runtime map the Tauri channel to it. The preview backend may simulate this boundary, explicitly as a stand-in only.
- Preserve review `commentId` through `composerAttachments` restore, `WorkspaceView` submission payloads, queue `MessageAttachment`, `PromptAttachment` and failed-unsent retry metadata.
- The shared runtime executes a host persistence effect exactly once on handoff using the captured workspace/identities. It must not interpret `submit` returning, optimistic `startTurn`, queue insertion, `ComposerSession.send` returning true, or command resolution as acceptance.
- The review hook reloads after a successful external comment-store commit and derives the count map from persisted workspace comments. Membership prevents duplicate Add-all actions without changing their count. Removing a chip restores attachability, not a delivered state.
- New confirmed handoffs write the source-consistent `reviewed` state through `CommentStore.markReviewed` and the workspace-scoped `diff_comments_mark_reviewed` native command. Both local and native mutators must preserve superseded rows. Extend the persisted-state readers to the source states (draft, pending, ready_for_review, reviewed, hidden, superseded), retaining `sent` only for legacy rows. Counts accept pending/ready_for_review and exclude all other states. Historical `sent` rows cannot reveal whether the old application only attached or actually handed off their comments; do not fabricate a migration or relabel them as proven ready-for-review.
- Keep the original exact-path count plumbing/positive-only badge hunks. Do not touch SAME135's Composer modified-key or Cancel branches.

## Fixtures and admission

The f9655c38 historical fixture is retained unchanged and is not parity acceptance. The frozen v3 frontend input has 15 mounted count/membership cases, 8 actual shared-runtime handoff cases and 3 actual-host persistence/IPC cases. All are unrun. Pair native fake-transport success/failure/order tests with the actual frontend event consumer during implementation. The existing ReasonACP/agent standalone harnesses do not by themselves cover Claude runner or Tauri command Channel wiring; those remain explicit verification requirements, not implicit green credit.

The normal-tail ACC row is unchanged. No install, compile, tests, server, browser, package, provider, native execution, extra runner or priority change is authorized by this source contract. Proposed serial validation must be finalized with ACC after the complete successor fixture is frozen. Native test commands require explicit existing-row capacity admission, not inheritance of #1172's released slot.

## Limits

Static retained REA closure, not live native observation. Pre-handoff cancellation routing in the reference is not completely traced; absence of a handoff cannot be credited as success, but full cancellation timing parity remains a native gap. The new runtime input is not final until the signal producer, persistence mapping and behavioral fixtures are complete.
