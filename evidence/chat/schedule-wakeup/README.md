# ScheduleWakeup result ingestion time

Conductor Rebuild owns the test-first successor. BE7 retains the original source and frozen contract. PR #847 is unchanged.

## Source

The baseline is main `a2ef261711b439e7ab00a25b3cb3275a5b55c823`, after #1102 released Transcript. Its module-lifetime disclosure store remains intact. The original retained Conductor 0.87.6 source joins each newly persisted result-message ingestion time through `TOo` to `Epo`, then schedules a cancelable deadline rerender through `xpo`. It does not establish provider or CLI completion time. See `source-provenance.json` for asset hashes, exact retained spans and current-source pins.

The sealed proposal and contract are copied byte-for-byte. Their historical source pin remains historical; the new source rebind is recorded separately rather than editing frozen inputs.

## Baseline

`node --test src/features/chat/scheduleWakeup.test.ts` drives actual `reasonChat`, `startTurn`, `applyReasonPayload`, and `applyChatEvents`, then mounts the complete production Transcript and ToolRows modules, including their row shell, projection, grouping, helper, disclosure store and day clock. It never fabricates separate result messages or injects timestamps.

The test host controls UTC Date and timer boundaries. Unrelated menu, markdown presentation, search, preference and native-action leaves are explicit inert boundaries. The production adapter, reducer, view, grouping, formatter, wake helper, Transcript, ToolRows and day clock are not replaced or AST-selected. Every independent case gets a fresh production module graph. Update and unmount phases preserve that graph's real stores.

The first result is accepted 30 seconds after tool start. Its output specifies 90 seconds, overriding the input's 120 seconds, so the row must wait until 12:02 PM. A repeated result at 12:01 must not reset that deadline. The actual mounted row is inspected at 12:02:00.250 after the duplicate, because minute-only labels cannot distinguish a 30-second reset. A second case advances only the external clock, then independently verifies wake-deadline cancellation on unmount. Midnight timers are not counted as wake timers. Pending, stop and failure paths are controls.

Qualification requires exactly `WAKE_RESULT_TIME_NOT_PROJECTED` and `WAKE_DEADLINE_TRANSITION_MISSING` assertion failures and all three controls passing. Loader, import, clock, mount and boundary errors are invalid baseline evidence. Hosted baseline head `4ca29ee69e23c8b61b0296fe80f9191b59667be2` produced exactly those two assertion failures and three passing controls in run `43129205127`, unit job `130888858041`. See `hosted-baseline.log`. Its only other full-suite failure is the independently owned disclosure historical/live dependency drift, repaired separately in #1109. The typecheck job passed compilation, then encountered the same two wake assertions and shared harness failure; build was skipped.

The candidate retains an optional `resultCreatedAt` on each result block at first terminal ingestion, preserves it on repeated terminal updates, mirrors it in Rust serialization, and projects it to the actual tool row. Missing legacy times remain unknown. The wake row uses the same live clock supplied to Transcript, with a separate cancelable deadline callback at wake time plus 250 ms. The existing module-lifetime disclosure store and midnight clock are unchanged. The five-case regression and both contract files remain byte-identical.

## Verification state

- Static archive, manifest, retained-span and historical snapshot checks passed.
- `git diff --check` passed.
- Hosted five-case baseline qualified with two intended assertion failures and three passing controls. Baseline `npm run typecheck` passed; build was skipped after test failures.
- Candidate `git diff --check`, frozen-byte comparisons, current-main target-path comparison and released-disclosure-store preservation checks passed. Candidate behavioral tests, typecheck and build are pending the automatic hosted workflows.
- Automatic hosted CI is the only admitted behavioral execution route for this unit.
- No local allocator, native app, provider, database, installed-app or visual verification was run. There are no screenshots because local/native execution is not admitted.

After qualified RED, the same fixture must pass with the smallest coherent per-result first-ingestion model and reactive consumer fix. Every exact-head workflow must pass before merging, followed by consuming-main and package checks.

## Remaining limits

Grouped shared-frame clock identity, failed persistence/retry, restart/legacy unknown result times, actual SQLite roundtrip and original/current native clock comparison remain unverified. Historical REA semantic analysis exhausted its heap and literal/tracing limitations remain; exact retained shipped-source bytes, offsets and hashes support the source claims. No new REA acquisition or runtime observation is claimed.
