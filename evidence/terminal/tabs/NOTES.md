# Terminal tab labels and running indicators

Owner: Conductor Rebuild. Continuation after merged PR #719, based on main `f16d9338`.

## Reference

The unchanged Conductor 0.87.6 frontend was extracted from `/Applications/Conductor.app` on Sven's authorized Mac in the earlier REA investigation. This pass uses that retained extraction on Reason Cloud, not a new transfer or native app launch. Its renderApp SHA-256 remains `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.

The focused source read corroborates [the retained output review](../output/NOTES.md):

- `b9i`, character offset 6,905,447, UTF-8 byte offset 6,948,594: one visible terminal is labeled `Terminal`; multiple terminals are labeled by their current zero-based index plus one. The running program is appended in parentheses.
- `zno`, character offset 6,905,571, UTF-8 byte offset 6,948,718: a running connection has no status indicator. Starting, restored, exited, and spawn-error states have separate indicators.

Fresh REA `capture-browser-scenario` runs drive the retained reference frontend and the current built OpenConductor frontend through visible New terminal and close controls. The single state opens one terminal. The renumbered state opens three and closes the middle tab. Exact scenarios, screenshot hashes, Evidence IDs, and URLs are in [the capture manifest](all-captures.json). Full screenshots are retained without recoloring or geometry changes.

## Fix

The strip now derives display labels from visible order, rather than the stored title counter, and omits the green running dot. IDs, persisted tab titles, spawn count, history, working directories, and active-tab selection are unchanged. Running-program suffixes still use the existing shell-integration adapter. Startup and exited indicators are not changed in this increment.

## Checks

- Failed before the product change: `E2E_BASE=http://localhost:4404 node --test --test-name-pattern='terminal tab labels' tests/e2e/script-output.e2e.mjs`. It expected `Terminal` and received `Terminal 1`. See [before.tap](before.tap).
- Passed after: `npm run build`, including TypeScript.
- Passed: `node --test src/features/terminal/*.test.ts src/scripts/*.test.ts`, 81 tests.
- Passed: `E2E_BASE=http://localhost:4404 node --test tests/e2e/script-output.e2e.mjs tests/e2e/terminal-restore.e2e.mjs tests/e2e/terminal-shell-integration.e2e.mjs`, 9 cases. See [after.tap](after.tap). The tests ran inside the supported Cloud preview process, which owns the fixture server. The restored saved IDs and history assertions remain; visible-label expectations now follow the reference.
- Passed: `npm run lint:colors`, `git diff --check`, and `node --check tools/terminal/tabs-capture.mjs`.
- REA captures use `PORT=4404 REA=/home/runner/rea/node_modules/.bin/rea node tools/terminal/tabs-capture.mjs evidence/terminal/tabs`, inside that same preview process with `DIST_REF` pointing to the retained extraction.

Prove It Works led to the failing-before and passing-after browser test. Test Behavior, Not Implementation kept the assertions on visible labels, running-program display, and retained saved history rather than changing the tab-storage model.

## Scope and remaining gaps

The screenshots use synthetic IPC and matching Stone dark palettes. That proves neither default-palette parity nor native macOS behavior. Reference and OpenConductor workspace data and terminal text intentionally differ. The side-by-side strips are raw crops at `(939, 410, 1280, 452)` from 1280 by 820 screenshots; no pixel or palette normalization is applied. This is a bounded label and running-indicator fix, not full strip parity.

The extra Clear scrollback button, Setup indicator and spacing, exited/startup indicator parity, and complete terminal-tab geometry remain outside this increment. Native PTY execution, real scripts, and Find in the containing macOS build are still unverified here and exclusively owned by runtime Session `d8e894e9`. No native app launch, Mac driver, real data mutation, agent turn, credential handoff, or duplicate CI dispatch was performed.

See [REA capture limits](REA-GAPS.md) for rejected capture attempts and the corrected selectors.
