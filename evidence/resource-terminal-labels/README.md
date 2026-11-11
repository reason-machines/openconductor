# Resource rows show terminal labels

Conductor Rebuild fixes the labels sent by the Resource Usage poll. Before this change, enabling terminal processes in Resources shows each shell as `zsh`, even though the app knows which panel or center tab owns it.

## Reference evidence

The retained Conductor 0.87.6 renderer is `renderApp-D_fmY7hW.js`, 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. It came from REA evidence `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. The retained index is `index-BGEQ8YjU.js`, SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`. Neither bundle was executed by this investigation.

The accepted source receipts establish these facts:

- `NFi`, UTF-8 bytes `[9973089,9973401)`, SHA-256 `f9a52bcff7e0a7786b065e13f2152f011a5bf073101ce0200c1149d42d7a3ca7`, labels panel IDs as `Terminal N` in workspace-map and array order. Repository terminals receive `Repository terminal`. Center terminals receive `Terminal tab N` in their separate global map order.
- `dVe` imports `ki`, exported from the index as `Ns`. Its `workspaceTerminals` retains an empty workspace entry when the last tab closes and removes that entry when the workspace is destroyed.
- `yce` imports `nd`, exported as `Gr`. Its terminal map preserves global center insertion order. Placement changes preserve terminal IDs, so ID prefixes cannot determine label families.
- `zta` passes the resulting map through `RFi` to `get_resource_usage`. The completed `bna` to `vna` to `qta` caller chain displays snapshot labels in reachable flat and tree rows. The terminal-process toggle is off by default.

The original producer, store-writer, and mount receipts remain intact in this Session. Their checks were not repeated or counted as new. This pass pinned 12 current source files at main `9e4df51294ab5cd6abdd73aa1212ae501c551b13`. The relevant product files were unchanged when main advanced to the implementation base `887964ad496b1069e6ef0fb54f16df373e82932a`.

## Cause and fix

The current tab ID passes unchanged into `ptySpawn`, `SpawnRequest`, the terminal manager, and the resource sampler's shell PID list. The current Rust sampler applies `terminal_labels[id]` to that shell's row. `ProcessRow` displays that label unchanged. The mounted poll previously supplied `{}`.

The terminal session now exposes a fresh ID-to-label map. Panel numbering follows first panel insertion by workspace, then each workspace's panel tab order. A small insertion-ordered set is necessary because a center tab can create an entry in the existing shared workspace map before any panel tab exists there. Closing the last panel tab retains its workspace's order. Destroying the workspace removes it. Center numbering follows the global live-terminal map, filtered by placement.

Each poll reads the map again. No terminal title, ID prefix, repository list, or process-table order substitutes for terminal state. The adapter adds no repository-terminal entries because this local session has no repository-terminal creator. It changes no PTY lifecycle, native code, Sidebar, WorkspaceView, PanelStrip, or ScriptsPanel paths.

## Regression proof

The permanent fixture loads the actual current terminal session, reducer, ResourceUsagePill hook, and ResourcesPanel. DOM, xterm, and IPC boundaries are mocked. Opening the actual pill and activating **Include terminal processes** reaches its real callback and rendered label cells.

The same frozen regression was run against the pinned pre-fix files and the patched files. Before the fix, its mounted test fails because the poll sends `{}`. The separate pure Rust fixture produces four visible `zsh` rows from that map, recorded in [before.json](before.json). After the fix, the rows receive `Terminal 1`, `Terminal 2`, `Terminal tab 1`, and `Terminal tab 2`.

```bash
node --test src/components/resourceUsageLabels.test.ts
node --test src/components/resourceUsage*.test.ts src/features/terminal/*.test.ts
npm run typecheck
git diff --check
```

Results:

- Focused regression passed all 5 tests after the fix. On the pinned pre-fix source, 3 failed and 2 polling guards passed. The decisive mounted failure was the empty label map. The other failures were the then-absent adapter export.
- All 95 related resource and terminal unit tests passed.
- Typechecking and whitespace validation passed.
- The unchanged five-test regression also passed with `RESOURCE_LABEL_SAMPLER` pointing to the existing compiled pure Rust fixture. That fixture calls the actual current `resource_usage::build` with synthetic process rows. It never calls `collect` or starts a process sampler or PTY.

The tests cover interleaved workspaces, a center-first workspace, global center order, empty panel-key retention, close and reopen renumbering, workspace destruction, restored IDs with custom titles, fresh poll data, and disabled or non-desktop polling. Current session APIs do not transfer tabs between placements. The adapter uses current placement rather than IDs, but no live transfer interaction is claimed.

The optional [pure sampler fixture](sampler.rs) is preserved for reruns. Its existing compiled binary was reused after the ledger restricted further Cargo or dependency builds. No full app build was run locally.

## Remaining acceptance gap

This is deterministic source and mounted-fixture proof, not native or visual acceptance. Reference-native label application, real process collection, browser behavior, native focus, and visual appearance remain unverified. No screenshot was captured because browser and native execution were outside this lane's admission. No deployment, installation, or notarization is claimed. CI and consuming package results are separate delivery checks.
