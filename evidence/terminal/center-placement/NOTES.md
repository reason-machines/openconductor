# Big terminal center placement

Conductor Rebuild owns this bounded correction. Setup PTY delivery (#798) and active-Setup shutdown (#804) are excluded.

## Retained real-app evidence

[reference.json](reference.json) records hashes, anchor offsets and inert excerpts re-read on Sven's `sven m5 max` from the retained Conductor 0.87.6 REA extraction. Offsets anchor the nearby symbol/function, not necessarily the first character of each shortened excerpt.

The local `terminal.newBigTab` handler checks that the experimental mode is enabled, resolves its preset, calls `q3.createTerminalWithCommand` (or `createTerminal` for no command), and navigates to that terminal. The import/export join is `q3` → index export `id` → `zc`, distinct from the right-panel terminal store. Navigation sets `activeTabType: "terminal"`; the local renderer uses `panelKind: "main"`, `persistence: q3`, the same terminal id, and the workspace's path. This establishes a center placement mismatch, not merely a stale score in the older terminal notes.

Before this correction, both the focused-terminal handler in `session.ts` and the workspace shortcut in `WorkspaceView.tsx` opened a right-panel terminal; the latter explicitly selected and opened that strip.

## Implementation boundary

Keep the existing PTY, xterm host, Find, output acknowledgement, history saving and deletion lifecycle. Add center placement to the existing terminal state and persist it, partition the two render surfaces, and include center terminals in the existing workspace tab strip and tab cycling/close controls. The chat remains mounted but hidden while a center terminal is shown, preserving its draft/queue; it is not marked as a visible chat. Right-panel Setup and Run are unchanged.

Conductor has separate persisted terminal stores. OpenConductor deliberately keeps its existing store with an optional `placement: "center"` extension; absent placement means a right-panel tab, preserving old records. This is an implementation choice, not a claim that the storage formats match. Restore retains placement and the screen but does not rerun a preset, as before. Cloud/mirrored terminals, center splitting/dragging, or new agent launch paths are not added.

WorkspaceView edits were coordinated with the Home/header owner: the branch-chip rename hunk is disjoint and is not changed here.

## Verification receipt

- Failed before: `node --test --test-name-pattern='center' src/features/terminal/terminal.test.ts src/features/terminal/tabList.test.ts` — both tests observed `undefined` instead of expected `center`.
- Passed after: same two tests, then `node --test src/features/terminal/*.test.ts src/scripts/*.test.ts` — 84 passed, including panel-selection isolation.
- Passed: `npm run typecheck`, `npm run lint:colors`, `git diff --check`.
- Browser fixture preparation: `tests/e2e/terminal-big.e2e.mjs` now asserts center placement, panel exclusion, selected-worktree cwd, preset/off behavior, switch-without-respawn and close-to-PTY cleanup. Browser execution and screenshots are pending the existing serialized slot; no local server/browser/native app was started for these source checks.

## REA and acceptance limits

REA's retained semantic graph does not join the minified cross-chunk aliases; bounded original-source reads supply that link. No new REA semantic analysis or native app launch occurred. Static source does not prove native execution, pixel parity, installed package identity, OS exit/relaunch, signed-in agents, or cloud behavior. Those remain unverified here.
