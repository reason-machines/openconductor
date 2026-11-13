# Notification denial feedback

Conductor Rebuild owns `NOTIFICATION-DENIAL-FEEDBACK-49-01`. This follow-up adds the missing error callback in General Settings. It does not change permission checks, persistence, other Settings controls, or the frozen Settings candidate `39c649c64a575dde189eeefa3e24b9ead6762336`.

## Retained real-app evidence

The [source proof](source-proof.json) requalifies the sealed source packet against main `49d56ee1719afcd3b895e85fddea65f86c108688`. All 26 packet manifest entries match. Seven retained REA excerpts match their recorded hashes, byte widths, and packet copies. Five relevant current-main source blobs match the packet.

The [existing provenance](../provenance.json) identifies Conductor 0.87.6 renderer `renderApp-D_fmY7hW.js`, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`, and index `index-BGEQ8YjU.js`, SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.

The retained `notifications_enabled` row renders `mei`. Its denied-permission branch calls `Bt.error` and `kt.error` with `Notification permission not granted`, then returns before the settings writer. Renderer and index aliases join `U9r` and `H9r` to `Aue` and `Iue`. The [retained excerpt](../reference/mei.txt) is static reference data, not evaluated JavaScript.

Current `SettingsView` forwards `miscActions.notify` through `UserPage` to `GeneralPage`. The General-page denied branch silently returns despite this existing callback. The fix calls that callback once with the retained error copy before returning. It keeps the awaited boolean helper, disable bypass, and `latestSettings.current` write unchanged.

## Frozen regression

The new [fixture](fixture.json) and [mounted replay](replay.test.cjs) are separate from the old seven-case permission-gate replay. [SHA256SUMS](SHA256SUMS) freezes the new fixture, replay, and CI wrapper before the baseline run. Neither the fixture nor the replay changes between RED and GREEN.

The replay mounts the actual `GeneralPage`, checkbox, permission helper, and settings model. Fake browser permission and fake Tauri permission-query boundaries replace OS operations. Unrelated actions throw if called. Assertions cover immediate and pending denial, exact one-error callback, zero writes, unchecked state, granted and disable controls without errors, and preservation of concurrent unrelated and unknown settings.

The old seven-case fixture remains SHA-256 `d27729fbf1c3df418708a3fcbb4ac2977cf71ea2e5c1dcea02250e46f4aa6140`. Its replay remains `815f2e5cf14044e64dbda174cd44a9f68028251434ef2aa38d84296f620d3c1d`. Historical permission-gate results do not prove denial feedback.

Run the new replay from the repository root after the locked dependency restore:

```bash
sha256sum -c evidence/settings/notification-permission/denial-feedback/SHA256SUMS
NOTIFICATION_DEPS="$PWD" NOTIFICATION_SOURCE_ROOT="$PWD" node --test --test-reporter=tap evidence/settings/notification-permission/denial-feedback/replay.test.cjs
node --test src/settings/notificationDenialFeedback.test.ts
```

## Verification results

All checks ran sequentially on Reason Cloud computer 301 under the existing serialized source-check slot. That slot was explicitly released at `2026-11-12T09:36:11Z`. No timeout, retry, or parallel dependency restore occurred. `package-lock.json` stayed unchanged.

- `npm ci --ignore-scripts --no-audit --no-fund` passed and restored 394 packages in 19 seconds.
- The frozen replay on unchanged main `49d56ee1719afcd3b895e85fddea65f86c108688` reproduced the defect. [red.tap](red.tap) records five passing controls and three intended assertion failures. Each failure expected the exact denial callback but observed `[]`. All write, checked-state, pending, call-count, and preservation assertions before those failures passed. There were no skips or setup failures.
- The only product change adds `notify?.("error", "Notification permission not granted")` and returns in the existing denied branch. The identical fixture and replay then passed all eight cases with zero failures and skips in [green.tap](green.tap).
- `node --test --test-reporter=tap src/settings/notificationDenialFeedback.test.ts src/settings/notificationPermission.test.ts src/settings/notificationConcurrentSettings.test.ts src/settings/configSync*.test.ts` passed all 12 top-level tests with zero failures and skips. [smoke.tap](smoke.tap) includes the new CI wrapper, unchanged old notification replays, and adjacent Sync regressions.
- `npm run typecheck` passed once. [typecheck.txt](typecheck.txt) retains its output.
- `sha256sum -c evidence/settings/notification-permission/denial-feedback/SHA256SUMS` passed before RED and GREEN. The old fixture and replay hashes also remained unchanged after the checks.

The test-first local commit `5c6afea` retains the failing regression before the product fix. Hosted exact-head checks and merge identity are reported on the standalone pull request, separately from these local receipts.

## Hosted CI verifier repair

The first hosted frontend run on head `ad948d7cff33aa58ddaa330024e86005acaac7a1` passed 3,584 tests and failed one. The Full Disk Access verifier compared the entire notification block with its historical baseline, so it rejected this unit's intended denial feedback. The notification regression itself passed.

The bounded repair reproduced that sole assertion failure in [verifier-red.txt](verifier-red.txt). The verifier now requires its hash-pinned historical block plus exactly the approved denial-feedback replacement. Every other byte in the notification block remains protected, and all Full Disk Access assertions remain in place. The new [mutation checks](../../full-disk-access/notification_guard_test.py) accept the intended code and reject removal of the callback, early return, permission await, disable bypass, or latest-settings write.

Sequential checks under the ACC slot passed:

- `python3 evidence/settings/full-disk-access/verify.py` passed all 37 static checks after the repair. See [verifier-green.json](verifier-green.json).
- `node --test src/settings/fullDiskAccess.test.ts src/settings/notificationDenialFeedback.test.ts` passed four top-level tests with zero failures or skips. This includes six mutation checks, the unchanged FDA seven-case baseline and candidate, the eight-case opener control, and the frozen eight-case notification regression. See [raw verifier replay output](verifier-smoke.tap.gz).
- The FDA fixture, replay, and baseline hashes, the new notification fixture and replay hashes, and the old seven-case notification fixture and replay hashes remained unchanged. Product code did not change during this repair.
- `git diff --check` passed. No dependency restore, typecheck, build, UI, native, package, dispatch, or watch ran during the repair. All foreground jobs were terminal with no lingering jobs when the slot was explicitly released at `2026-11-12T10:04:08Z`.

Hosted checks on the repaired exact head must pass before merge. Skipped jobs are not passes.

## Acceptance limits

These are source and mounted-component checks, not native acceptance. Whole original assets are unavailable in this Cloud checkout. The historical REA renderer semantic-analysis heap-exhaustion gap remains open. No original JavaScript is evaluated, and no fresh extraction is claimed.

Native permission prompts, installed-app toast appearance, native persistence, actual notification delivery, and side-by-side visual parity are not observed. There is no screenshot because this unit has no native, browser, UI, server, or new runtime admission. No Mac app, PID, credentials, playground, Bergen workspace, or scratch state is touched. This unit is outside the existing release-owner992 package cut and starts no build, package, dispatch, or watch.
