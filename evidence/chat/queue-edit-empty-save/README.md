# Empty queued-edit save — source-attributed component regression

Conductor Rebuild / `COMPOSER-QUEUE-EDIT-EMPTY-SAVE-135`.

## Change

The editing `QueueRow` previously let blank Save / Save and steer buttons and matching keys dispatch `saveEdit`. With no attachments, the real queue reducer intentionally interprets this as deletion, so the queued item vanished and editing closed. Conductor's retained row and composer/keyboard callers require nonblank input before dispatching a queued-edit save.

The fix owns that UI invariant in one local `canSave` / `save` boundary: both buttons are disabled for whitespace-only input, and both keyboard routes consume the key without dispatching. Cancel, explicit Delete, no-steer visibility, nonblank Save/steer, IME handling and structured file content remain unchanged. Attachment-only blank edits are also blocked at the UI, matching the reference's text predicate; direct `queue.saveEdit` deletion remains untouched.

Only production `src/features/chat/Composer.tsx` changes (9 insertions, 4 deletions). The regression mounts complete actual `Composer → QueuePanel → QueueRow`, invokes the actual row handlers, and applies real `queue.actionStep`. It never calls a disabled button's callback. The editor/presence/preferences/tooltip boundaries are stubs; this is not browser, native editor or provider proof.

## Immutable fixture and sources

- Fixture: `src/features/chat/composerQueueEditEmptySave.test.ts`, 17,423 bytes.
- Fixture SHA-256: `8739fb3f4ebbbdf4282b740ccce38f5a3572b213669b23a96016ec19535cb4e3`.
- RED source: `c22e27d48a0940c5793842cfddc023b7e5f838c5`.
- Fresh main before treatment: `3e54efdd71f44ab888ebd18d8fe37870e806a4ba`. The relevant Composer/helper bytes match the RED pins. The historical assigned branch was merged with main and verified to have an exact-main tree before the change; this PR is not stacked.
- Treatment Composer SHA-256: `8aca2474747054e9ed35885873c6ca9a5e21c76f276c6fd38fa0a090d3f5a3ad`.
- The frozen fixture and all assertions are byte-identical across RED and GREEN. Its preparation-time comment and frozen plan predate execution; the raw execution receipts below are the result of record.

## Executed checks

RED, exactly once:

```bash
taskset -c 0 timeout --signal=TERM --kill-after=5s 60s env NODE_OPTIONS=--max-old-space-size=768 COMPOSER_QUEUE_EDIT_EMPTY_SOURCE_REF=c22e27d48a0940c5793842cfddc023b7e5f838c5 node --test --test-concurrency=1 src/features/chat/composerQueueEditEmptySave.test.ts
```

**Failed as intended**, exit 1: 51 tests, 30 semantic assertion failures, 21 unaffected controls passed; no cancellation, skip or TODO. All 24 decisive blank button/key/steer cases and the six attachment-only blank availability cases failed. The raw first failure shows an enabled Save dispatching `saveEdit`, `q1` removed, and `editingId` cleared by the actual reducer. This is not a setup failure.

GREEN, exactly once:

```bash
taskset -c 0 timeout --signal=TERM --kill-after=5s 60s env -u COMPOSER_QUEUE_EDIT_EMPTY_SOURCE_REF NODE_OPTIONS=--max-old-space-size=768 node --test --test-concurrency=1 src/features/chat/composerQueueEditEmptySave.test.ts
```

**Passed**, exit 0: identical 51 tests all passed; no failures, cancellations, skips or TODOs. Only the source selector differs, selecting the treatment rather than the frozen baseline. The nine preserved case families cover nonblank Save, nonblank steer, Cancel, explicit Delete, IME, no-steer behavior, structured file content, attachment-only blank availability and direct-reducer deletion.

Static checks **passed**: 267 RED preflight checks and 255 treatment preflight checks, including the immutable fixture, 217 installed dependency-file digests, relevant source/helper pins, corrected reference/original receipt identities, CPU0 availability and fresh disk ≥4 GiB. Node v22.23.3 native TypeScript stripping passed before each run. Package manifests were reconciled to fresh main, not installed or modified for this test.

## Source and REA correction

Retained complete parent assets:

- `renderApp-D_fmY7hW.js`: 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- `index-BGEQ8YjU.js`: 3,493,297 bytes, SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.

The retained closure includes actual queue-row caller `JNi`, composer `ITo` and its `pTo` nonblank predicate, save normalization and the index queue store. Complete declaration spans/ranges/digests are retained under `reference/`; no JavaScript extracted from Conductor is evaluated.

**Historical REA gap, explicitly corrected:** original `evidence/chat-queue/rea-queue-sites.json` mislabeled REA's directory-subject digest `2e082e3c60eaae37f162dabcd19360ce239e500a1ac0d3c687a20ada6c733ad5` as a slice-file digest. The original receipt remains unchanged. The corrected renderer slice is UTF-8 `[8599657,8761291)`, 161,634 bytes, SHA-256 `e43f1cbced0bbad078e30162a1249c272d17e503215464a35115e73843572f88`. Existing retained source-owner construction records establish the mistake; all 20 historical REA call coordinates independently bind to the manifest-matching renderer, including both Save calls inside `JNi`. The old digest-as-file check remains failed/superseded, not retroactively passed.

## Resource release and limits

Both tests ran on the Session's Reason cloud computer under serialized CPU0 reservations (not host-exclusive). RED ran 21:19:03.807445Z–21:19:05.625102Z and released at **2026-11-17T21:19:05.626044Z**. GREEN ran 21:24:17.478564Z–21:24:18.644539Z and released at **2026-11-17T21:24:18.645491Z**. Process-group cleanup found no surviving PIDs. No dependencies were installed or removed; existing hash-pinned dependencies were reused. Own evidence output was under 100 KiB per run, below the 16-MiB incremental budget. Maximum observed child RSS was 165,272 KiB RED / 158,352 KiB GREEN; this is **not** aggregate process-group RSS.

**Not run locally:** full typecheck/build, full adjacent suite, browser, screenshot/recording, native/Tauri, provider/backend/steer effects, Mac/REA acquisition, package/installed-app or full side-by-side acceptance. Browser/native execution was not admitted, so no screenshot exists. The mounted component regression proves row state/action semantics only, not visual or native parity. Hosted exact-head checks remain a separate merge gate.

## Recheck retained evidence

```bash
python3 evidence/chat/queue-edit-empty-save/verify.py
# Optional complete retained parents (paths supplied by their current custodian):
python3 evidence/chat/queue-edit-empty-save/verify.py --renderer /path/to/renderApp-D_fmY7hW.js --index /path/to/index-BGEQ8YjU.js
```

This is a static evidence check, not another behavioral test. `execution/red.tap.gz` losslessly preserves the original RED TAP; `source-pins.json` records its decompressed digest. Original execution and preflight receipts are retained unchanged.
