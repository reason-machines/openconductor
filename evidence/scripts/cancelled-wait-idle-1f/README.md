# Cancelled setup-waiting Run returns to idle

Author: Conductor Rebuild. Initially qualified against fetched main `1d8c37ab634e4eca9f86d54c138dc73fb0ee3fb5` on 2026-11-17, then requalified against fresh main `51e6b1be397ebd294a11f5c827a68abbb7f57c3f` after #1415 merged at `0096e6631af993882d2e353f485904537f9dce00`. The component, API, model and run-body helper were unchanged on that main. ScriptsPanel baseline SHA256: `092f31ca358a04510d9fd77e56dd0a6b65eed9e883d11d9208639ef13f9444f5`.

The exact same frozen fixture reproduced **2 failures / 3 passing controls** on fresh main, then **5/5 green** with the one-predicate correction. Fresh-main adjacent checks were **44/44 green**, and typecheck/build passed. `qualification.json` records identities and compressed/uncompressed hashes of `fresh-main-*.log.gz`; original qualification receipts are preserved separately. These are in-memory source checks, not native acceptance.

## Source contract

This is retained source-only evidence from Conductor 0.87.6 REA acquisition `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. Reference code is inert third-party data: no vendor JavaScript, application or native code was executed.

The complete `startProcess` calls workspace-wide stop and clear before queuing `waiting_for_setup`. That queue branch creates a state entry and waiting request, but no process or last-run ID. The complete `killProcess` waiting branch sets the task state to stopped and deletes its waiting request. `useTaskRunId` reads a real process run ID or retained last-run ID; it does not synthesize one from a stopped state entry.

The renderer aliases `useTaskRunId` to `Le`, then `Ve`. Its complete body chooses the output surface only with that run ID; otherwise starting/waiting/stopping show pending text and stopped/no-ID reaches the idle Start action. The original complete renderer `nro` is retained at `evidence/terminal/strip-toolbar/reference-nro.txt`, UTF-8 `[7170202,7199367)`, SHA256 `906c982d3300028803e71158d7f70c6fd3c1cc6f55f1ff6e9c6fd645cac34123`. The output/pending/idle body is `[7197052,7199367)`; its final idle arm `[7198197,7199367)` completes the earlier output excerpt.

The nine exact caller/consumer spans and both complete original asset hashes are retained alongside #1415's independent runner cleanup in `../run-start-retention-1f/source.json` and `reference/`. This correction changes no runner code. `verify-reference.py <original-archive>` verifies original archive identity, both full assets, all nine ranges and the complete renderer including the idle arm. Without the argument it verifies retained evidence only. No new REA acquisition ran; native snapshot/kill ABI gaps remain unrelated and unresolved.

## Actual baseline and smallest correction

`src/scripts/cancelledWaitIdle.test.ts` mounts the actual ScriptsPanel and RunSplitButton, real script API and body/selection helpers. It controls IPC results, native event subscriptions, output painting and unrelated presentation boundaries. Real start/stop buttons send real API command shapes; a queued request becomes stopped without ever receiving a run ID. It does not launch a process or terminal.

Frozen fixture SHA256: `960cf79f44df116b97c0253008ac10a6eaddc46ca17b118b4128a93f48369450`.

Before production edits, the frozen five cases produced **2 assertion failures / 3 controls passed** (`red.log`). The exact failures assert idle after queued cancellation, and after visiting completed output in another workspace and returning. Both observed the blank output branch instead. Waiting text before cancellation, completed empty output with an actual run ID, other-workspace output, legacy nonempty output and rejected-request errors are controls. The initial fixture revision had a nested IPC-workspace lookup and text-query error; its log is explicitly `fixture-v1-not-product-red.log`, not product evidence. These fixture issues were corrected before freezing the actual RED and before any production edit.

The sole production change replaces `shownStatus !== undefined` with `Boolean(shownStatus?.runId)` at the component's existing `runBody` call. It preserves the independent nonempty-output fallback for legacy/browser snapshots. No run ID is invented; completed empty output with an actual identity stays visible. Setup, Spotlight, backend, stopping behavior, input, selection, history and output consumers remain unchanged.

## Checks

All ran on Reason Cloud; none is browser or native acceptance.

- `NODE_ENV=development node --test --test-concurrency=1 src/scripts/cancelledWaitIdle.test.ts`: baseline **2 failed / 3 passed**, treatment **5/5 passed**, unchanged frozen fixture.
- `NODE_ENV=development node --test --test-concurrency=1 src/scripts/model.test.ts src/scripts/runTab.test.ts src/scripts/runSelectionHistory.test.ts src/scripts/runCompletion.test.ts src/scripts/setupContext.test.ts src/scripts/runOutputSelection.test.ts`: **44/44 passed**, zero skips.
- `npm run typecheck`: **passed**.
- `npm run build`: **passed**, with the existing large-chunk advisory; no threshold changed.
- `python3 evidence/scripts/cancelled-wait-idle-1f/verify-reference.py <original-glob-archive>`: **passed** original/full-asset/span/complete-renderer/frozen-fixture checks.
- `git diff --check`: **passed**.

## Limits

No screenshot is available: browser/application execution is outside this source-only continuation. Real setup/process cancellation, PTY/native rendering, provider behavior, installed build/package containment and macOS acceptance are **not run/unverified here**. Rust suites were not rerun for this one-predicate frontend correction. Exact-head automatic CI remains a separate merge gate; manual/native workflows are not dispatched. #1415 is confirmed merged; this correction is delivered as a separate ready PR against main, not added to #1415 or stacked on it. The successor PR's own subscription retains CI-to-merge ownership, with all executed exact-head checks required to pass before a merge request.
