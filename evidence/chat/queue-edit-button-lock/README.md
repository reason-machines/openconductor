# Ordinary queue Edit eligibility during an active edit

Conductor Rebuild owns this focused successor to merged #1483. This change targets main; it does not reopen or modify #1483.

## Change and scope

`QueuePanel` now passes `canStartEdit={queue.editingId === null}` to `QueueRow`. An ordinary nonediting row omits its existing Edit button while any queued edit is active. The eligible button retains its original callback. This is omission, not a disabled button or a replacement callback.

The reducer, editor, Save/Cancel/Save-and-steer, blank-save guards, row tabindex, remove/reorder actions, drag policy, WorkspaceView and #1483's row-keyboard guard are unchanged. The product diff is four source locations in Composer; the permanent regression is `src/features/chat/composerQueueEditButtonLock.test.ts`.

## Reference evidence and limits

The retained real-Conductor REA queue declarations establish `GTo` → `TAo` → `iAo` → conditional `QTo`: global ordinary-edit eligibility is false while an edit exists. `iAo` omits the ordinary Edit action when that eligibility is false. The complete retained spans and parent byte coordinates/digests are under `reference/` and `qualification.json`.

This is retained REA evidence, not a fresh inspection of the running app. Intrinsic/forwarding helpers are byte-bound to the complete retained renderer outside the analyzed REA queue slice. Original graph ambiguity and coordinate qualifications remain in the historical qualification record. These source facts do not prove browser hover, CSS presentation, physical focus, Tab, macOS behavior or packaged inclusion.

`qualification.json`, `source-review.json`, `source-treatment.json`, the frozen oracle and fixture headers, requests and supervisors preserve preparation-time status text verbatim. Those historical NOT_RUN/expected-only labels are not the current runtime result. The actual runtime records below and `delivery-verification.json` state the later result.

## Reproduction: one frozen 12-case unit

The original oracle was written before the fixture's four visibility targets and eight controls. `frozen-fixture.test.ts.txt` and `oracle-frozen.json` preserve the original bytes; the `.txt` suffix prevents accidental duplicate test discovery. The original private fixture and oracle remain unchanged.

The fixture mounts the complete actual Composer with real queue reducers. It enters Edit A through an actually rendered enabled Edit button, changes the queued editor draft and, where specified, invokes the editor blur prop and the explicit focusable-row port. It never seeds `editingId`, replaces QueueRow or invokes absent/disabled callbacks. Editor and DOM focus remain test boundaries, not physical focus proof.

### RED: reproduced, exit 1

The original fixture executed all 12 cases: **4 intended visibility assertion failures and 8 passing controls**, no skips/cancellations/todos/setup errors. B's Edit button remained rendered after Edit A, after blur/focus B, after blur/focus C, and with A's draft blank. Each found one ordinary Edit button where the oracle requires zero. **State assertions following those failed visibility assertions were not reached in RED.**

- Test: 2026-11-18T02:50:29.006038Z–02:50:30.024160Z.
- Actual release: 02:50:30.024832Z; owned PG 108 reaped with zero survivors.
- All 282 pre/post pins passed; 23 whole-file baseline bindings matched fetched main `750b8bf25b2193141eff0cfcad64776228bea076`.
- Child maximum RSS: 161,196 KiB, **not aggregate RSS or a group cap**; output 6,468 bytes.
- `runtime-red/test.stdout.gz` losslessly retains the raw original TAP, including diagnostic whitespace. Its decompressed SHA-256 is `407e02987199ed59ad5773f84c1fcad370967d4d896f2fd8a6c907b12b5d6b28`.

Executed baseline command, from the primary checkout (see the immutable request and supervisor):

```bash
python3 .qa/queue-edit-button-lock-135/proposal-worktree/pointer-review/run-red12.py \
  --reservation COMPOSER-POINTER-EDIT135-RED12-20261118T024907826Z
```

### GREEN: identical fixture passed, exit 0

After the minimal treatment in isolated candidate `0dfeb432828c32874740523b00fb40081f77c42f`, the **identical original 12 cases passed**, with zero failures/skips/cancellations/todos. All four visibility assertions **and their subsequent retained-state assertions were reached and passed**.

All eight controls also passed: unlocked multirow and singleton Edit; restoration after Cancel, Save and Save-and-steer; blank Save/Cancel policy; unlocked drag/order props; active-edit drag props. Drag controls inspect rendered props, not physical drag gestures.

- Test: 2026-11-18T03:30:10.324311Z–03:30:11.342288Z.
- Actual release: 03:30:11.342984Z; owned PG 111 reaped with zero survivors.
- All 291 pre/post pins passed; 23 whole-file baseline bindings matched freshly fetched main `daee1fc90825c1e7673f711ad1d8a5a5401b1959`, allowing only the exact candidate Composer treatment.
- Child maximum RSS: 149,512 KiB, **not aggregate RSS or a group cap**; output 2,449 bytes.
- Original CPU 0/nice 10/UV_THREADPOOL_SIZE=1/768-MiB per-Node heap, 60-second TERM deadline, 5-second KILL grace, wrapper/reap and output bounds were retained. Preflight free disk was 16,250,109,952 bytes, not a later free-space claim.
- Raw GREEN TAP SHA-256: `f11b22ff3717915384add4ec6b2b48c5ec0a768fef291874ad4b6ed40586ba77`.
- Stderr in both phases contains only the experimental proxy warning.

Executed treatment command (the supervisor loads the original fixture at its original absolute path and changes only the Composer read mapping through candidate cwd):

```bash
python3 .qa/queue-edit-button-lock-135/proposal-worktree/pointer-review/run-green12.py \
  --reservation COMPOSER-POINTER-EDIT135-GREEN12-20261118T032840888Z
```

The underlying command in each immutable receipt retains taskset/nice/timeout/env and `node --test --test-concurrency=1`. The complete RED/GREEN requests and supervisors are historical receipts, not portable rerun instructions or permission to execute them.

## Permanent regression and delivery checks

The permanent port preserves all executable content after location-relative import rebinding; only the introductory header and import specifiers differ. It is the unchanged reviewed permanent port, SHA-256 `076547d732c62e0cdcc5cabbc268ac48c7a1aae2fb0c0ba84c1169437ae6f7ea`.

**Passed, source-only:** the primary delivery Composer equals the GREEN-tested candidate byte-for-byte; the four inverse replacements restore baseline bytes exactly; all 23 baseline files match freshly fetched main `daee1fc90825c1e7673f711ad1d8a5a5401b1959`; all 23 retained reference spans match their original identities; original fixture/oracle, case names, raw-output digests and permanent executable-content equality pass. `delivery-verification.json` records these checks and `checksums.json` records the retained evidence identities. `git diff --check` passed.

**Not rerun locally for publication:** original RED/GREEN, permanent regression, adjacent/full frontend suite, typecheck or build. Existing automatic hosted CI runs `node --test "src/**/*.test.ts"`, including this permanent regression and adjacent queue suites, plus typecheck, lint, build and evidence tooling. Those results must be read on the actual published head before merge; queued/running/skipped jobs are not passes. No CI trigger or dependency change is included.

## Unverified visual/native delivery

No screenshot is attached because browser/native execution was not admitted or exercised. React test rendering and focus/editor ports do not establish real hover/click/Tab appearance or native behavior. Package inclusion and native keyboard/pointer verification remain with the existing package/native custody lane after the actual merge; no new release, executor, provider or native dispatch is created here.
