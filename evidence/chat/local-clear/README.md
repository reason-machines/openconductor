# Idle local chat clear

Prepared by Conductor Rebuild. Unit `ACQ-CHAT-LOCAL-CLEAR-BE7-06`.

## Scope

The built-in `/clear` command replaces the selected idle local Claude or Codex chat. It hides the predecessor and its Claude runtime alias without deleting their transcript or provider resume fields. The replacement is selected, while the shell primary remains the oldest visible chat. Selection and primary identity are persisted separately and reconstructed from database rows.

The replacement keeps the chosen model, effort, and supported Codex personality. Permission and Fast come from new-session defaults. A same-name agent command still shadows the built-in. Busy, pending, permission-waiting, archived, and non-local chat handling are not expanded by this unit. The transaction is OpenConductor's non-destructive failure policy, not a claim that the reference rolls back a failed creation.

No schema migration, provider execution, cloud Claude or Codex path, #847 change, or RightPanel change is included.

## Retained reference source

[The source manifest](source/manifest.json) records the original asset hashes, byte offsets, excerpt hashes, and historical REA provenance. The retained source establishes the successful clear chain through `clearSession`, `Met`, session creation, active-session selection, navigation, and visible-session rendering. The selected chat is not a permanent primary slot.

These are hash-verified retained bytes, not a new reference-app run. The original renderer semantic-analysis heap exhaustion remains a REA gap. The original archive was not reacquired. No extracted JavaScript was executed.

The source-only comparison for the candidate was refreshed against main `11a5f73df99faa0d33bcc0c19b78606bc2c0b992`. All twelve scoped product files match the frozen candidate used by the sole executor. The fixture is tracked separately. Unrelated main changes were merged into this delivery branch without changing those product bytes. A later source-only reconciliation includes main `c2041a9273c17e0bbafa4326633002e75e311901`; its only Composer change is the existing ArrowUp queue guard's added `!e.ctrlKey` check. The [reconciliation manifest](v3-reconciliation.json) pins that dependency separately from the clear product candidate.

## Original two-case regression

The [immutable corrected baseline fixture](baseline/workspaceLocalClear.test.ts) has SHA-256 `6b1b9245ce1e996359db4f87286278c907cb280fa85eeccbd5867660cdce58fc` and was frozen at local commit `f442590fc0d50fb94d1f734172f4c7979f366f5e`. Earlier test-first checkpoints `52a6ded` and `682019f` remain separate in local history. Their setup failures are retained and are not product RED results.

The sole executor ran the baseline and exact same fixture after the product correction on Reason Cloud. Both used a private source snapshot, isolated public dependency resolver, disposable HOME, one worker, `nice -n 19`, 768 MiB Node heap, and a 90-second timeout with a 95-second outer bound. No dependency installation, provider invocation, app launch, or native runtime occurred.

```bash
NODE_OPTIONS=--max-old-space-size=768 nice -n 19 timeout --kill-after=5s 90s node --experimental-strip-types --test --test-concurrency=1 src/features/chat/workspaceLocalClear.test.ts
```

- **Expected RED observed.** Both mounted idle Claude and Codex cases reached the intended replacement-operation assertion, actual zero versus expected one. Exit 1, two failures, zero passes, 1.872 seconds. There were no setup failures, skips, cancellations, or timeout.
- **Identical-fixture GREEN passed.** Both cases passed after overlaying the exact frozen product candidate. Exit 0, two passes, zero failures, 3.023 seconds. No assertions were changed.

[The genuine RED receipt](receipts/clear-f442-genuine-red-receipt.json) and [combined terminal receipt](receipts/clear-v2-terminal-receipt.json) retain commands, times, TAP, hashes, and source pin comparisons.

## Extended fixture correction

The first twelve-case extension, fixture SHA-256 `af8719be135313c35a21d71d4d6bb2190b8af77b59e6d366b6f9dc1a340e058f`, ran once. It passed eight cases and failed the four cap/provider/secondary combinations at their final attachment assertion. Primary targeting passed; raw programmatic-send payloads had empty attachment arrays. The executor stopped, so state controls, DB tests, DTO tests, typecheck, and formatting were not run in that pass.

Source review located an invalid test-driver assumption. On unchanged main `11a5f73`, `ChatPanel.bridge.send` calls `submit` with its default empty attachment argument. It does not consume the composer's staged draft. Only normal Composer form submission goes through `onSubmit` and `ComposerSession.send` to enumerate and deliver staged attachments. `useWorkspaceChatAttach` uses its own queued state to stage attachments in the primary composer. It does not merge them into raw programmatic sends. An independent source review reached the same conclusion against the exact frozen archive.

The [v3 helper-only patch](v3-fixture-only.json) preserves every twelve-case scenario and existing assertion byte-for-byte. It still invokes the raw shell send and now asserts its primary target, verifies the staged `shell.txt` attachment chip, then drives the real mounted editor and form to exercise attachment delivery. The original final attachment assertion remains unchanged. All twelve product files are unchanged.

[The v3 fixture manifest](v3-fixture-manifest.json) records the new fixture hash `b026606ec58fc9ee41d96bfb519c558f0435239705ae5643423d94cf4f8e1e94`, scenario-tail equality, exact helper patch, and original candidate identities. This is a fixture correction, not a second product fix.

The initial v3 attempt stopped before Node because Composer had changed on main and the tail-hash definition was ambiguous. No fixture was overlaid and no test ran. The original v3 hash covers the 5,399-byte suffix excluding the 51-byte loop header. The [reconciled manifest](v3-reconciled-manifest.json) defines the canonical raw tail to include that header: 5,450 identical bytes with SHA-256 `73cbd6ce347f409c66ac122b764ef0db000dd7c23ab6b340d768bc6b4074b71d`. The fixture and all product bytes are unchanged.

The corrected extended run passed on the sole executor's Reason Cloud snapshot. It ran from `2026-11-11T09:06:02.868070Z` to `2026-11-11T09:06:17.803436Z`, exited zero, and passed all twelve cases with no failures, skips, cancellations, or limit termination. All four staged-attachment assertions passed through the real composer session and form. The executor verified the reconciled Composer dependency, all twelve product pins, and the 87-file candidate import graph before running. This result does not cover Rust, DTOs, typecheck, or native behavior. The [combined frontend receipt](receipts/local-clear-frontend-green-receipt.json), SHA-256 `e27f83c274e43bd9d068a33be7e3b240e9de4845fed209b34cdfec27c5a35c66`, retains the complete TAP and input checks.

The five existing state-control files also passed on that snapshot, with 34 passes, zero failures, skips, or cancellations. The run exited zero from `2026-11-11T09:07:03.973746Z` to `2026-11-11T09:07:04.855933Z`. The same resource limits applied. Paths below are relative to the frozen source snapshot.

```bash
node --experimental-strip-types --test --test-concurrency=1 src/state/openChat.test.ts src/state/persisted.test.ts src/state/chatUnread.test.ts src/features/chat/chatTabs.test.ts src/features/chat/chatModelChoice.test.ts
```

These controls exercise open-chat identity, persisted rows, unread state, chat tabs, and model choice. They do not exercise the Rust database or native command boundary.

## Static delivery checks

- **Passed.** Exact patch digest and all thirteen baseline and candidate file hashes before and after source integration.
- **Passed.** All twelve product hashes unchanged by the v3 helper correction.
- **Passed.** All extended scenario and assertion bytes unchanged by the v3 helper correction.
- **Passed.** Original asset hashes and every retained reference excerpt's size, hash, and byte offset against those assets.
- **Passed.** Four original receipt hashes, the combined frontend receipt hash, the immutable baseline fixture hash, and source whitespace checking with `git diff --check`.
- **Not run in this checkout.** Node tests, compiler, formatter, Rust checks, builds, app or provider execution. All local runtime remains serialized through the existing executor.

## Initial hosted CI failures

The ready main-based PR was published as [#1020](https://github.com/reason-machines/openconductor/pull/1020), initial hosted head `81e1a52ced3ea1b066497e7e894f77fd79b00eea`. Its first hosted checks exposed these failures.

- Persistence on Ubuntu and macOS stopped at `cargo fmt --check`. The later database tests did not run in those jobs. The sole executor then attempted the exact four-file local formatter command, but its stable toolchain lacks the `rustfmt` component. No file changed and no installation or retry occurred. After that writer released the files, this branch applied all sixteen formatting hunks from the hosted formatter output to the two exact baseline files. [The formatting record](hosted-formatting.json) links the failing job and records the scope. Hosted formatting and database tests must still pass.
- Two keybinding tests failed with `primaryId is not defined` in their extracted chat-host JSX. Their isolated VM now supplies the same primary identity as its workspace fixture.
- Seven Diff auto-close tests failed with `tabOfChat is not defined` in their extracted workspace initializer. Their probe now includes the real source declarations for `tabOfChat` and `primaryId`.

The test-driver corrections do not change product code, scenarios, or behavioral assertions. Their hosted recheck has not passed yet. No failing check is bypassed.

## Remaining acceptance limits

Synthetic mounted tests do not prove native persistence, actual local Claude or Codex behavior, side-by-side visual parity, running or queued clear semantics, installed macOS behavior, or reference rollback semantics. The provider and DB boundaries in the mounted fixture are synthetic. There is no screenshot because native and visible app execution has not run for this unit.

A protected main-based pull request, passing hosted checks, protected merge, and a consuming macOS package remain delivery work. A packaged build is separate from installed native acceptance.
