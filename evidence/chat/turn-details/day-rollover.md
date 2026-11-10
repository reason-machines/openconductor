# Completed-turn date rollover

Conductor Rebuild, 10 November 2026. Bounded source comparison against main `e1687ee8`. No new app extraction, REA invocation, provider, browser, native app, build, install or workflow dispatch ran.

## Retained reference

The Conductor 0.87.6 renderer `renderApp-D_fmY7hW.js` was rehashed as SHA256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. It matches the [retained extraction manifest](../../frontend/tauri-assets-manifest.json). The original [chat evidence](../README.md) records the REA renderer-worker heap limit and the decoded-bundle fallback. These are minified shipped bytes, not original source or a runtime observation. Offsets are zero-based UTF-8 bytes.

- `IKn` at 8,918,260 returns local start of day.
- `SDo` at 8,918,344 formats the end time as time-only today, a weekday for the previous six days, or a calendar date. It includes the year when it differs.
- `EDo` at 8,918,713 retains a clock value in React state. It computes `new Date(year, month, date + 1).getTime()`, supplies `Math.max(nextMidnight - now, 1000)` to `B9`, and updates the state from `Date.now()` when called. The label then runs through `SDo` again.
- `B9` at 1,938,093 uses a cleanup-managed `setInterval`. Re-rendering with the new clock value changes its delay to the following local midnight. This is not a fixed 24-hour interval.

## Source mismatch and correction

Before this change, [Transcript](../../../src/features/chat/Transcript.tsx) read `ctx.now()` only while rendering a completed-turn footer. No day-change subscription invalidated the transcript. The existing formatter was correct, but an otherwise idle transcript had no scheduled render when a time-only label became a weekday, or a weekday became a date. This is a source-established scheduling mismatch, not a reproduced mounted-app incident.

[turnDayClock](../../../src/features/chat/turnTime.ts) now exposes a day-stable snapshot and a local-midnight subscription. `Transcript` consumes that exact store through `useSyncExternalStore`, and feeds its returned snapshot into the existing footer `turnTime` call. The hook is not disconnected from the label. One subscription serves the transcript, rather than one per footer. The implementation uses a rescheduled timeout and cleans it up on unsubscribe. It retains the reference's one-second minimum delay and calendar-date scheduling across daylight-saving changes.

No provider, model attribution, persisted timestamp, composer, scroll or workspace code changed.

## Checks

- Initial red run of `node --experimental-strip-types --test src/features/chat/turnTime.test.ts` failed because the prior module had no `turnDayClock` export. That is an API-absence failure, not evidence of mounted stale text.
- A temporary copy of the corrected module with only its `onChange()` invalidation removed failed four of the nine formatter and clock tests. The idle-label assertion retained `8m, 0s · 10:37 AM` instead of adding `8m, 0s · Thu 10:37 AM`. This is a regression-sensitivity mutation, not an execution of the old mounted component.
- The unmodified code passed all 55 focused tests with `node --experimental-strip-types --test src/features/chat/view.test.ts src/features/chat/toolGroups.test.ts src/features/chat/turnTime.test.ts src/features/chat/fork.test.ts src/features/chat/turnMenu.test.ts`. The nine formatter and clock tests include repeated midnight rollover, the six-day weekday boundary, stable snapshots, unsubscribe during a callback, resubscription, and 23-hour and 25-hour local days in `America/New_York`.
- `node --experimental-strip-types tools/chat/check-turn-day-reference.mjs <retained-renderer-path>` passed four differential cases against the hash-checked extracted `EDo`, `SDo` and date helpers. The script uses a minimal hook shim, not a mounted React tree.
- `node --check tools/chat/check-turn-day-reference.mjs` and `git diff --check` passed.
- Local typecheck was not run because this checkout has no installed dependencies or TypeScript executable. No installation was started. Exact-head CI remains the typecheck gate.

## Acceptance boundary

Rendered React, browser and native acceptance are **NOT RUN**. No screenshot is supplied because this task excludes those operations. The pure clock/label tests and direct source wiring do not prove a mounted transcript renders correctly or survives real machine sleep.

The existing runtime owner can verify an unchanged completed-turn transcript across a controlled local-date boundary in an isolated test environment, without changing the person's Mac clock or app data. Confirm that the same footer changes from time-only to weekday without another message or user action, then unmount and remount it to check cleanup. Packaging and mounted acceptance remain separate from source and CI results.
