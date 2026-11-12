# Keyboard cancellation restores Composer focus

Conductor Rebuild fixes `CANCEL-HOTKEY-FOCUS-135-01`. The registered `chat.cancel` callback now calls the existing stop callback, then focuses the live Composer editor without moving its selection to the end. Idle cancellation still returns `false`. Pointer Stop is unchanged. A detached editor ref does not prevent stopping.

## Source

[source.json](source.json) retains the REA acquisition identity, original asset hashes, byte coordinates, and source spans. The original accepted keyboard callback calls `cancelSession(...).fireAndForget()` then `de()`. The live-editor callback `de` calls `commands.focus()` with no position. Pointer Stop has a separate path.

This is retained Conductor 0.87.6 compiled-source evidence, not a fresh observation of the installed app. The original REA JavaScript worker exhausted its heap and skipped semantic parsing. The recorded spans were inspected as inert text, not an REA-generated call graph. No new REA gap or original-app runtime claim is introduced.

## Executed checks

Baseline OpenConductor main was `9c276e2e86c0bd7ed97c8ccd0467f30c7a8ebcab`. The frozen fixture was copied unchanged to `src/features/chat/composerCancelFocus.test.ts`, SHA-256 `d496b631ae63976b9128405eba09bc61c6fd6d4fd4d5e6ece6b70ed1ba823f42`.

The exact command below failed before the fix with three missing-focus assertions and three passing controls. It passed after the fix with all six tests passing. See [baseline TAP](red.tap) and [candidate TAP](green.tap).

```bash
nice -n19 timeout --kill-after=5s 90s node --max-old-space-size=768 --experimental-strip-types --test --test-concurrency=1 src/features/chat/composerCancelFocus.test.ts
```

The admitted adjacent command passed all 52 tests. See [adjacent TAP](adjacent.tap).

```bash
nice -n19 timeout --kill-after=5s 90s node --max-old-space-size=768 --experimental-strip-types --test --test-concurrency=1 src/features/chat/composerQueueFocus.test.ts src/features/chat/composerFirstVisualLine.test.ts src/features/chat/composerSlashDirectory.test.ts src/features/chat/composerMinimize.test.ts
```

Both commands ran on Reason Cloud using existing dependencies. Python's monotonic clock measured wall times of 1.040 seconds, 0.953 seconds, and 3.963 seconds respectively because `/usr/bin/time` was absent. These are execution receipts, not performance measurements. `git diff --check` passed. The frozen inputs and assertions were not changed. [SHA256SUMS](SHA256SUMS) pins the fixture and evidence.

## Verification limits

The regression renders the actual Composer with a mocked editor handle and keybinding-registration boundary. It verifies stop/focus ordering, the default focus argument, unchanged selection, idle and pointer controls, a detached editor, and rich-draft, attachment, queue, and other-chat isolation.

There is no screenshot or recording: this serialized admission explicitly excluded browser, native, and provider execution. Native caret behavior and visible parity remain unverified. No local typecheck or build ran in this admission. CI is tracked separately in the pull request. AddMenu29 and Modified36 are separate, unexecuted work and are not included in this fix.
