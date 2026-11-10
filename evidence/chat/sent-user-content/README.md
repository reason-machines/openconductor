# Sent file identity V1

Conductor Rebuild — 10 November 2026.

## Contract and source boundary

Implementation follows [the retained design contract, revision 2](https://reasonmachines.com/agents/be7a40e4-7a95-4b4b-a75d-41eaf9426f8b?page=f41a534d-9dda-4e15-afc9-685a47d61dd4).
The assigned branch was normally merged with main `499980ed9eb2be0c468a1b558d0c39f012eac1fe`,
producing `84a2403cd189961752956a9a54ce0a5483735be7`. Before implementation,
both `git status --short` and `git diff --stat origin/main` were empty.
No reset, switch, rebase, frozen #847 source, #859 source, or unmerged Stop barrier was used.

The display-only optional `userContent` snapshot retains Composer file atoms and confirmed
attachment targets through submit, queue edits, shared/Codex sent messages, full-message JSON,
and user transcript rows. Provider text and transport attachment DTOs remain separate.
Literal strings, plain-text copy/export, the SQL content column, and provider prompts are not
replaced with rich markup. Queue edits reuse ComposerEditor without editing its implementation
or ComposerSession. Retry takes its exact source message and its exact legacy plain-text string.

Only a copy that completed in this host send callback grants an attachment navigation target.
An already-copied file without such a receipt stays an embedded label. No generation, staging
receipt, attachment bodies, credentials, or provider state enters display metadata.

## Retained Conductor evidence and gaps

The contract retains the shipped-code chain `WOo → IOo → jri / loe`.
Renderer SHA-256: `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
Index SHA-256: `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.

- `WOo`: renderer UTF-8 bytes [8888340, 8895883), SHA-256 `4b90b5a2139db4f56e35ecbb311d00f586d41c24ce1c6e0d1a61d4d5072173c3`.
- `IOo`: renderer bytes [8867370, 8870021), SHA-256 `edf267a71a8d14291d2c28d0b2f4551bd94c3b82dc6e818c6bd9aebbeb78e816`.
- Decoder `loe`: index bytes [1389713, 1390513), SHA-256 `d3bbc32bb2dd279fbe10f58751afe1a929c1cd817ed616172329ebce98d85812`.

These are previously retained, hash-pinned static ranges, not a new runtime observation.
REA receipt `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`
parsed the index but skipped the renderer after heap exhaustion. No new REA action ran here.
The review-only `Hki` range does not establish generic image/PDF cards. Directory navigation,
hover contents, native parity and Conductor legacy attachment IDs are not established and are
not claimed. Directory chips are intentionally inert.

## Verification state

Initial source-only pass: `git diff --check` PASSED. Subsequently the ledger-admitted focused
`userContent.test.ts`, `queue.test.ts`, and `composerSubmit.test.ts` run PASSED 33/33, exit 0,
TAP duration 20.179s. Actual guards: MemAvailable 26580320KiB; filesystem available 17694056KiB.
The command used heap512/nice15/CPU6s/inner wall45s and concurrency1, with zero installs.
That lease is released; no additional local check was inferred from it.

New ready main PR #877 was created at published head `d69c4af2c63de9742f5e5cdc832319da2b7a0cdb`;
merged #863 was not adopted. The initial hosted CI ran and failed on test assertion typing,
three old retry scalar expectations, an invalid new Codex fixture event, and rustfmt. Source
corrections preserve the assertions and use the typed Codex payload plus exact hosted formatter
output. Local reruns/typecheck/Rust format or tests/browser/native/provider execution remain
NOT RUN. No screenshot exists yet. The local main integration `5c1b52a7` contains the merged
Stop barrier `e411fc1f9bb2a3ea8c9c3c67741384721702a408` without conflicts.

The group-scoped queue editor selector is migrated under its narrow source lease; two
pre-existing Composer focus expectations that still say `TEXTAREA` are deliberately unchanged.

Focused commands prepared for separate sequential admission:

```bash
node --test --test-concurrency=1 src/features/chat/userContent.test.ts src/features/chat/queue.test.ts src/features/chat/composerSubmit.test.ts
COMPOSER_REGRESSION_REF=84a2403cd189961752956a9a54ce0a5483735be7 node --test src/features/chat/composerSubmit.test.ts
node --test --test-concurrency=1 src/features/chat/chatRuntime.test.ts src/features/chat/reason.test.ts src/features/chat/reasonChat.test.ts src/features/chat/codex.test.ts src/features/chat/codexChat.test.ts src/features/chat/persist.test.ts src/features/chat/view.test.ts src/workspace/archiveAgents.test.ts
npm run typecheck
rustfmt --edition 2021 --check src-tauri/src/chat/model.rs src-tauri/src/chat/tests.rs
bash tools/chat/run-rust-tests.sh
node tools/e2e/sent-user-content.browser.mjs <admitted-preview-url> <output-directory> <chromium-path>
```

The old-ref command is intended to demonstrate behavioral loss at the actual Composer/host
boundary before this change. It has NOT RUN, so no red-first result is claimed.
The browser script uses the existing Vite module-serving surface and mounts production
Composer, its queue editor, persisted/restored Transcript, the actual WorkspaceView submit
adapter, and a shared runtime with a fake backend. It does not start a server, native app,
or provider process. Its screenshots are functional evidence, not side-by-side native parity.

Acceptance coverage prepared in source (all execution pending):
1. Actual Composer form/default/opposite submission; ordered atoms and unchanged projection.
2. Literal at-path/email/token/envelope compatibility and handled slash commands.
3. Queue start/steer/drain/pause/resume/reorder/move/steerQueued snapshot isolation.
4. Actual queue editor preserves/replaces/removes atoms and supports cancel/save/save-and-steer.
5. Actual async host callback with real ComposerSession; copy failure, later draft and generation invalidation.
6. Shared runtime → actual ChatSaver → fullMessage → restore → buildRows → mounted Transcript.
7. Codex real invoke/listen adapter, inline attachments, skill links and queued metadata.
8. Old/null/unknown/malformed metadata fallback and matching Rust serde fixtures.
9. Actual Retry footer → actual host submit adapter → runtime, two identical texts with distinct atoms.
10. Mouse/Enter/Space navigation; inert unsafe/outside/directory/missing-callback targets.
11. Attachment-only/mixed/embedded/copy-failure/already-copied-without-receipt boundaries.
12. Reset/replay/copy/complete/fork/earlierConversation retain existing plain-text behavior.

Codex restart persistence remains a separate pre-existing capability gap; this unit preserves
Codex metadata in memory and in the common serializable message type, not across a Codex restart.
Retry preserves display metadata, not previously discarded embedded attachment body resend.
