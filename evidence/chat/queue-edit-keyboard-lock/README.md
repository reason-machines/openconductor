# Queue-row keyboard lock while a queued edit is active

Conductor Rebuild owns this focused follow-up to merged #1480. This is a new change against main, not an update to #1480.

## Change and scope

The only product change is the existing early return in `QueuePanel.onRowKeyDown` in `src/features/chat/Composer.tsx`: add `queue.editingId !== null` alongside the existing child-target and IME exclusions. An active queued edit therefore leaves other rows' shortcut and navigation events unconsumed.

No changes to the reducer, `queueRowKey`, configured shortcuts, editor Save/Cancel/Save-and-steer, row focusability, drag policy, pointer Edit eligibility, or providers. The seven published queue regression files and #1474/#1480 behavior are preserved in source, not claimed rerun here.

## Real-app evidence

`qualification.json` is the **historical pre-treatment source audit**, bound to fetched main `8f0f8707a529e17937cd8e9447b8b769b6bc5e21`. Its preparation-time classification is not the current execution result.

The retained real-Conductor REA extraction binds the ordinary edit producer through `JNi` → `AAo` → `GTo`, then the guarded list-key handler into `DTo`'s actual focusable list. `GTo` derives the global edit state and returns before queue commands or navigation while an edit is active. The extracted declarations and original coordinate/digest receipts are retained under `reference/`.

This uses retained REA analysis, not a fresh Conductor inspection or native observation. Original graph-cap, ambiguous receiver, no-match, range-helper and corrected-digest qualifications remain in the reference receipts. The separate pointer-Edit packet and its retained-parent helpers outside the analyzed REA slice are not part of this fix.

## Reproduction: original frozen 26 cases

The original fixture is retained byte-for-byte as `composerQueueEditKeyboardLock.test.ts`; `oracle-frozen.json`, the original request, supervisor and baseline source snapshots are immutable historical evidence. `runtime-red/test.stdout.gz` losslessly retains the original TAP bytes (including diagnostic whitespace); its decompressed digest matches the original execution receipt. The live private original remains unchanged.

The fixture mounts the complete actual Composer with real queue reducers. It enters Edit A via the actual rendered Edit button, changes the actual queued-editor draft, invokes its actual blur callback, focuses a still-rendered row B through the explicit DOM port, then dispatches B's actual row-key callback. It does not inject `editingId` or substitute a fake row.

**RED passed as a reproduction:** Node exited 1 with **11 intended failures and 15 passing controls**, all 26 executed, no skips/cancellations/setup failures. Eight active-edit row keys and three remapped Edit/Delete/Steer shortcuts were incorrectly consumed. Unlocked keys, child/IME/unknown keys, editor actions and session isolation were the passing controls.

- Test: 2026-11-18 01:33:08.870173Z–01:33:10.037414Z.
- Cleanup/release: 01:33:10.038219Z; zero owned process-group survivors.
- All 266 frozen identities passed before and after; all 22 source pins matched actual main.
- Child maximum RSS 163,308 KiB, **not aggregate RSS**; retained output 17,727 bytes.
- Original fixture SHA-256: `ce6ccead15be69e2b780f02c04e29a97ee28104e5eaf6eb14ac8bb170d940e02`.
- Oracle SHA-256: `466ada994d18d5b7d2f632f01998163d040c6fa17edf026ba2795a1ad8807b7c`.

Original command (executed unchanged for both RED and GREEN):

```bash
taskset -c 0 timeout --signal=TERM --kill-after=5s 60s \
  env -u COMPOSER_QUEUE_EDIT_KEYBOARD_LOCK_SOURCE_REF \
  NODE_OPTIONS=--max-old-space-size=768 \
  node --test --test-concurrency=1 \
  .qa/queue-edit-keyboard-lock-135/composerQueueEditKeyboardLock.test.ts
```

## Permanent regression and current validation

The permanent port is `src/features/chat/composerQueueEditKeyboardLock.test.ts`. Only its header and location-relative import specifiers differ from the frozen fixture; the remaining executable content is identical after import rebinding. The source receipt verifies that relation and that the product change is exactly the one-line predicate extension.

**Passed:** source-only identity, import-rebinding, baseline/treatment equivalence and whitespace checks. The original RED TAP is preserved unchanged. `source-treatment.json` remains the historical pre-GREEN preparation receipt, not the current execution result.

**GREEN passed:** the identical original fixture executed once on the one-line treatment: **26/26 passed**, exit 0, no failures, skips, cancellations or setup errors. All 11 formerly failing cases and all 15 controls executed in the original order. The raw receipt and TAP are retained under `runtime-green/`; `green-verification.json` links their hashes and the permanent-port identity check.

- Test: 2026-11-18 01:52:45.697465Z–01:52:46.916394Z.
- Cleanup/release: 01:52:46.917089Z; zero owned process-group survivors.
- All 266 frozen identities passed before and after; all 22 source bindings matched freshly fetched main `5100f02abdc1129050d5f020f8de552680fc2994`, allowing only the exact Composer guard.
- Child maximum RSS 162,556 KiB, **not aggregate RSS or a group cap**; retained output 3,962 bytes. The preflight free-space observation was 16,520,966,144 bytes, above the 4 GiB floor; it is not a later free-space claim.
- CPU 0, inherited nice 10 and `UV_THREADPOOL_SIZE=1`, 768 MiB heap per Node, original 60-second timeout/5-second kill grace/30-second cleanup bounds.

**Not run locally:** the permanent-port runtime, full adjacent suites, build, browser, native or packaged-app verification. No second local runtime or native owner was created. The permanent port is covered by mandatory automatic hosted CI on the ready PR; its result must be checked on that exact head before merge.

The existing automatic `CI` frontend job runs `node --test "src/**/*.test.ts"`, so it covers the permanent 26-case port and adjacent suites on the published head. Conditional workflow skips are not passing tests. Merge waits for every executed exact-head check to pass.

## Verification limits

React test rendering, editor lifecycle and DOM focus ports are unit boundaries. They do not prove physical keyboard dispatch, real Tab focus, browser appearance, macOS behavior or packaged inclusion. No screenshot is attached because none of those surfaces was exercised; native/package verification remains with the existing release owner, without duplicate dispatch. Source preparation and historical receipts are not GREEN or parity claims.
