# Reset chat: late settlement must retain a different turn's dialog

Conductor Rebuild. Qualification `RESET-CHAT-LATE-SETTLEMENT-6013`, coordinated with the feature-ledger owner. Default main checked: `6cc9a9c75cb2ee4cdec678bc51f6b2960dac2280`. No app installation, acquisition, browser/native run, real checkpoint restore, provider request or workflow dispatch is part of this unit.

## Complete retained reference contract

[source.json](source.json) records original asset identities, zero-based UTF-8 half-open ranges, complete declarations, alias joins and SHA-256 hashes. Source is inert reference data, never executed vendor code. The original REA-qualified renderer is `renderApp-D_fmY7hW.js`, 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`; its index is 3,493,297 bytes, SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`. No new REA analysis or native observation is claimed. The earlier incomplete semantic graph is not the proof.

- Complete `MDo` is a turn component and passes its own `r.id` to `TDo`.
- Complete `TDo` `[8919506,8927404)` owns `[R,O]=$.useState(false)`. Its Reset menu item opens `O(true)`. Its `uDo` mount uses this same row's `open:R`, `onOpenChange:O`, and `turnId:u`. Thus the completed reset of A has no path to B's separate open-state setter.
- Complete `uDo` `[8909221,8909638)` includes `dDo` only while open; closing unmounts that content. Complete `dDo` submits the captured session/turn and per-call `onSuccess:()=>d(false)`.
- Exact renderer/index import/export joins establish `pSe` as `M9t`; its `useResetChatToTurn` is complete `qDt`, which calls `Be`. Complete `Be` subscribes a per-hook `Zqe` observer; complete `mh.subscribe` and `Zqe.onUnsubscribe` remove that subscription when unmounted. `Zqe` delivers per-call callbacks only while it has listeners. It cannot use an old A completion to call a newer B callback.
- Complete `UDt` performs the checkpoint work and deletes messages after A's watermark. Earlier B survives. `TDo` separately gates Reset and its dialog on `!isLastTurn`: same-target A becomes latest after its own reset and its dialog is no longer eligible. A blanket unmounted-component suppression is therefore not the proposed product change.

## Current source and ordinary reach

Current `WorkspaceView` owns one `resetTurn` for the chat and mounts the actual `ResetChatDialog` with `onClose={() => setResetTurn(null)}`. That component runs `onConfirm(resetFiles).then(onClose, ...)`. Cancel is enabled while pending. Consequently, after opening A from its actual turn menu, confirming, cancelling and opening an earlier turn B, late A success unconditionally clears B's target.

The actual chat runtime's `reset` awaits `restoreCheckpoint` without marking the transcript active or queue working. This is not a direct-setter or artificially concurrent route: both A and earlier B's actual turn menu items remain resettable while the checkpoint boundary is pending. Successful A truncates only later messages, retaining B and A. Successful B can still complete and truncate A afterwards.

## Frozen regression

`src/features/chat/resetChatLateSettlement.test.ts` uses the existing React test renderer and TypeScript AST projection pattern. It executes:

1. The real `createChatRuntime`, ordinary synthetic chat submission/event reduction and `buildRows` to produce B, A and latest C. Real `canReset` values are `[true,true,false]`.
2. Actual `TurnFooter`, `TurnMenu`, menu model and actual WorkspaceView `onResetChat`/disabled bindings; no test directly sets `resetTurn`. Only menu portals/DOM, decorative content and icons are boundary hosts. The host performs normal selection dismissal through the actual TurnMenu close callback.
3. The exact WorkspaceView Reset state declaration and mount/captured callbacks, actual ResetChatDialog/preferences and real checkpoint/truncation logic. Only synthetic checkpoint I/O and agent I/O are deferred. The whole App/WorkspaceView is **not** mounted.

The six cases are two intended failures (late A must retain ready/pending B) plus four controls: late rejection does not leak into B; the current failure can retry without resetting files; same-turn reopen still closes when A becomes latest; dismissed A still truncates its own later messages without reopening anything.

Before product edits, the final fixture reports **4 passed / 2 intended failures / 0 skipped**. Both failures are visible-dialog assertions after late A success, not setup failures. An earlier draft had a VM-realm error-format assertion mismatch and an incomplete menu-host dismissal; those were corrected before freezing. `initial-harness-error.tap` is explicitly **not** the frozen RED. The first typecheck also identified a fixture `Object.hasOwn` lib mismatch; it was replaced with the repository's established `hasOwnProperty.call` pattern. Typecheck then passed.

```bash
node --experimental-strip-types --test --test-concurrency=1 src/features/chat/resetChatLateSettlement.test.ts
npm run typecheck
python3 evidence/dialogs/reset-chat-late-settlement/verify-source.py --original-root .rea-work/dlg-pr-title-cancel-focus-retained
sha256sum -c evidence/dialogs/reset-chat-late-settlement/fixture.sha256
```

The final fixture `1198de444d4c13f7f5cfd5cfbb9af516360dca8f94365c90352c64dfcb6779d1` is frozen by `fixture.sha256` in test-first commit `6718c281fd2caf1a2fc0ab1f85dcaafc4cf3cf29`, before the first production edit. Ledger subsequently granted only the existing WorkspaceView Reset mount's identity-checked functional close setter. The applied correction is that one production line; ResetChatDialog, runtime, checkpoint helpers, menu model and shared frames are unchanged.

## Executed result

On Reason Cloud, the unchanged six-case fixture went **4 passed / 2 intended failures → 6/6 passed**. The combined focused and adjacent command below passed **72/72**, with no failures, skips or cancellations. The 66 adjacent cases also passed before the production edit.

```bash
node --experimental-strip-types --test --test-concurrency=1 src/features/chat/resetChatLateSettlement.test.ts src/features/chat/resetChatFocus.test.ts src/features/chat/resetChatDismissal.test.ts src/features/chat/resetChatFrame.test.ts src/features/chat/resetChatPendingIndicator.test.ts src/features/chat/chatRuntime.test.ts src/features/chat/checkpoints.test.ts src/features/chat/reducer.test.ts src/features/chat/turnMenu.test.ts src/features/chat/view.test.ts
npm run build
npm run lint:colors
```

`npm run build` passed branding, full TypeScript and Vite production compilation. The existing large-chunk warning remains. Color lint passed. Original full-asset/range verification, 12 retained bindings, lifecycle joins, the unchanged fixture checksum and diff hygiene passed. Logs are retained alongside this note; CI status belongs to the published exact head and is recorded separately, not inferred from local checks.

## Verification limits

These are source/component/runtime-boundary checks on synthetic data, not full-App, DOM, focus, browser, physical shortcut, native, real deletion, package embedding or installed-app acceptance. No screenshot is available because browser/native execution remains excluded. E1/#1425 and the existing serialized release/package custodian remain untouched. An admitted successor must prove packaged inclusion and exercise A pending → Cancel → earlier B → late A success, retaining B and its own completion, without real user-data deletion.
