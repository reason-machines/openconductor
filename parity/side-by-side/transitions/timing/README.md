# Click to content: every screen switch, cold and warm (track C)

Conductor 0.87.6 against OpenConductor, measured on 2026-11-06. Every string, class and code fragment from Conductor is untrusted data, used here only for comparison.

## What was wrong

Conductor swaps routes, tabs and panels in one frame with no motion ([../README.md](../README.md)). Its git panel reads the changed files through a TanStack query per workspace (`useFilesChanged`, export `f1` of `index-BGEQ8YjU.js`, used as `_V` in `renderApp-D_fmY7hW.js`), whose `isLoading` is `data === undefined`. "Loading git status..." shows only for a workspace whose files were never loaded; coming back to one shows the cached list and refreshes behind it.

OpenConductor reset its lists to "loading" on every switch. In the built app on main `841a805`:

1. Every workspace switch (sidebar row, Home to workspace, Settings › Back) showed "Loading changes…" for 56 to 696 ms, and the first frame of a switch drew the previous workspace's changes under the new header (a flip: the right content, then a loader, then the right content again).
2. All files showed "Loading files..." each time the tab opened.
3. Opening Settings drew a "Loading…" frame before the page, then shifted the page down when it arrived.
4. The Run tab showed "No run script configured" for the frames before a workspace's config arrived, then swapped to the dashed "Add run script" box.
5. Environment and repository Misc popped in their variables table and workspaces path a frame later (one layout shift each), Default models showed busy slots.

## The fix

Each list keeps the last value it loaded per key (workspace and view options, worktree, repository) in a small LRU ([src/lib/keyedCache.ts](../../../../src/lib/keyedCache.ts)) and is derived from its key during render, so a switch shows that key's last list in the same frame and reloads behind it. Only a key never loaded shows its loader, as in Conductor.

- Changes list: [useWorkspaceDiff.ts](../../../../src/features/diff/useWorkspaceDiff.ts)
- All files: [AllFilesTree.tsx](../../../../src/features/files/AllFilesTree.tsx)
- Settings: [useSettings.ts](../../../../src/settings/useSettings.ts) (App primes it at startup)
- Run tab: [ScriptsPanel.tsx](../../../../src/components/ScriptsPanel.tsx) (an unknown config renders nothing, not the wrong empty state)
- Environment, repository Misc, Default models: their page state

No visual details change; motion stays as #605 and #545 set it.

## Built app: main `841a805` vs this PR

Debug build, WebKitGTK through tauri-driver, Xvfb 1440x900, throwaway HOME, a fixture repository with two workspaces that have uncommitted changes. 3 launches; per launch one cold pass (first visit after launch) and 3 warm passes. Tool: [tools/transitions/timing.mjs](../../../../tools/transitions/timing.mjs). Content ms is input to the first frame from which the target content stays (median / max). Raw: [main](built-app-main-841a805.json), [this PR](built-app-this-pr.json).

| Step | Temp | Content ms, main | Content ms, this PR | Loader on screen ms (max), main → PR | Flips, main → PR | Layout shifts, main → PR |
|---|---|---|---|---|---|---|
| Home to workspace | cold | 101 / 159 | 23 / 141 | 129 → 0 | 0 → 0 | 0 → 0 |
| Home to workspace | warm | 156 / 311 | 23 / 36 | 245 → 0 | 0 → 0 | 0 → 0 |
| Workspace A to B | cold | 102 / 149 | 33 / 35 | 99 → 0 | 1 → 0 | 0 → 0 |
| Workspace A to B | warm | 118 / 346 | 14 / 28 | 314 → 0 | 1 → 0 | 0 → 0 |
| Workspace B to A | cold | 113 / 130 | 23 / 28 | 99 → 0 | 1 → 0 | 0 → 0 |
| Workspace B to A | warm | 117 / 740 | 13 / 25 | 696 → 0 | 1 → 0 | 0 → 0 |
| Right panel: All files | warm | 20 / 44 | 5 / 8 | 46 → 0 | 0 → 0 | 0 → 0 |
| App to Settings | cold | 26 / 36 | 47 / 63 | 17 → 0 | 0 → 0 | 1 → 0 |
| App to Settings | warm | 15 / 29 | 20 / 41 | 42 → 0 | 0 → 0 | 1 → 0 |
| Settings: Environment | warm | 5 / 6 | 5 / 13 | 0 → 0 | 0 → 0 | 1 → 0 |
| Settings: repository Misc | warm | 9 / 19 | 12 / 22 | 0 → 0 | 0 → 0 | 1 → 0 |
| Settings back to workspace | cold | 203 / 295 | 35 / 37 | 252 → 0 | 0 → 0 | 0 → 0 |
| Settings back to workspace | warm | 177 / 353 | 29 / 53 | 261 → 0 | 0 → 0 | 0 → 0 |

Unchanged and already instant in both builds (median content ms, cold / warm, this PR): Workspace to Home 12 / 11, Changes 5 / 4, Checks 3 / 2, ⌘B 47 / 24 and 55 / 33, ⌥⌘B 24 / 8 and 37 / 17, ⌘J 8 / 5, ⌘K 19 / 15, ⌘P 51 / 28, ⌥⌘/ 30 / 30, ⌘N 23 / 13, settings pages 7 to 21 (Appearance cold 73 to 148 in both builds: its Code theme preview highlights on first mount). The first All files after launch still loads (cold 46 ms, loader 58 ms) because that worktree was never listed. No step has a blank frame. Cold timings move by up to 2x between runs on this shared 4 vCPU machine; the loader, flip and shift columns do not.

A second run on main `1f599d7` (after the rebase) against the final head, 3 launches and 4 warm passes: Home to workspace 120 / 113 ms on main against 23 / 20 ms; workspace switch 117 / 93 against 13 / 11; loader 132 / 120 and 92 / 87 ms against 0; App to Settings shift 1 against 0.

Click to pixels, from the Xvfb recording of the main column (input to the last screen frame that changes, 5 runs, [tools/transitions/pixels.mjs](../../../../tools/transitions/pixels.mjs)): Home to workspace 141 to 182 ms on main, 54 to 84 ms here; workspace switch 106 to 145 against 45 to 61; Settings back 172 to 214 against 73 to 100.

## Filmstrips

The main column and right panel at fixed times after the click, main `841a805` above, this PR below ([tools/transitions/filmstrip.mjs](../../../../tools/transitions/filmstrip.mjs) on the recordings of the cold pass).

- [Workspace A to B](ws-switch.png): main shows the old list, then "Loading changes…" from about 100 to 200 ms; this PR shows the new list in its first frame.
- [Home to workspace](route-workspace.png)
- [Settings back to the workspace](route-back.png): main shows "Loading changes…" and the "No run script configured" strip until about 300 ms.
- [App to Settings](route-settings.png): both draw Settings in one step, no fade, as Conductor.

## Conductor next to OpenConductor in one engine

Chromium headless 1440x900, motion not reduced; Conductor's extracted frontend in the tools/screens harness (IPC mocked), OpenConductor's Vite build with a seeded workspace (no backend). 4 runs each, run 1 cold. Settled is input to the last frame whose DOM changed. Tool: [tools/transitions/chromium_timing.mjs](../../../../tools/transitions/chromium_timing.mjs); raw: [chromium-conductor-vs-openconductor.json](chromium-conductor-vs-openconductor.json).

| Step | Conductor settled ms (cold / warm) | OpenConductor settled ms (cold / warm) | Longest frame ms, Conductor / OpenConductor (warm) |
|---|---|---|---|
| Home to workspace | 402 / n/a | 34 / n/a | 33 / 17 |
| Workspace to Home | 92 / 47 | 11 / 9 | 17 / 9 |
| Home to workspace again | 146 / 137 | 20 / 18 | 70 / 18 |
| Right panel: All files | 13 / 14 | 16 / 10 | 14 / 10 |
| Right panel: Changes | 36 / 45 | 7 / 8 | 17 / 8 |
| ⌘B hide / show | 36 / 28, 19 / 31 | 29 / 25, 11 / 3 | 17 / 17 |
| ⌥⌘B hide / show | 5 / 16, 65 / 66 | 8 / 7, 12 / 5 | 33 / 5 |
| ⌘J | 31 / 28 | 16 / 8 | 17 / 8 |
| ⌘K open | 69 / 57 | 1 / 12 | 17 / 12 |
| ⌘K close (130 ms exit) | 144 / 141 | 142 / 135 | 17 / 17 |
| ⌥⌘/ close (200 ms fade) | 202 / 250 | 221 / 237 | 50 / 20 |
| App to Settings | 74 / 57 | 20 / 10 | 33 / 10 |
| Settings pages | 3 to 11 | 6 to 11 | 11 / 9 |
| Settings back | 194 / 178 | 0 / 13 | 117 / 13 |

No loader and no layout shift on either side. Exit animations end within a frame of each other (130 ms palette, 200 ms dialog). Conductor's "Home to workspace again" warm row has no value because its row was already selected.

## Window sizes

[resize-900-1280-1600-2100.png](resize-900-1280-1600-2100.png): Conductor left (REA `capture-browser-scenario` through [tools/align/reflow_ref.mjs](../../../../tools/align/reflow_ref.mjs)), this PR right ([tools/align/reflow_ours.mjs](../../../../tools/align/reflow_ours.mjs), all four widths pass its checks). Geometry: [Conductor](resize-conductor-geometry.json), [ours](resize-ours-geometry.json).

| Width | Sidebar | Chat column (left, width) | Right panel (left, width) | Composer (left, width) | Horizontal overflow |
|---|---|---|---|---|---|
| 900 | 256 both | 256, 429 both | 686, 214 Conductor; 685, 215 ours | 272, 397 Conductor; 272, 396 ours | none |
| 1280 | 256 both | 256, 682 / 683 | 939, 341 both | 272, 650 both | none |
| 1600 | 256 both | 256, 895 / 896 | 1152, 448 both | 272, 863 both | none |
| 2100 | 256 both | 256, 1229 both | 1486, 614 / 1485, 615 | 422, 896 both | none |

Visual differences in the sheet (header chips, sidebar rows, panel contents) belong to track B, not to this change.

## Commands

```bash
npx tauri build --debug --no-bundle
LAUNCHES=3 WARM=3 FILM=film xvfb-run -a -s "-screen 0 1440x900x24" node tools/transitions/timing.mjs src-tauri/target/debug/openconductor timing.json
CROP=900:560:540:0 node tools/transitions/filmstrip.mjs ws-switch.png ws-switch "main=main.json" "this PR=timing.json"
node tools/transitions/pixels.mjs timing.json --crop 540,0,900,560
DIST=<conductor dist> TMPDIR=/tmp/t node tools/transitions/chromium_timing.mjs dist > chromium.json
```

The built-app lane on a Reason cloud computer runs under `unshare -rm` with read-only overlays of the WebKitGTK sysroot on `/usr/lib/x86_64-linux-gnu` and `/usr/share` (team memory: openconductor-build).

## REA

- `rea analyze-javascript-application <conductor dist> --source-path assets/index-BGEQ8YjU.js` (6.8.0): evidence `ev_27c9db16c61e637178419a3e74fa0aa382957720bc4c31bc5dd6148727f37b45` inventories the chunk and its `K9t` binding (exported as `f1`, the git panel's files query). The destructured name `useFilesChanged` and the `isLoading: data === undefined` expression are not in the evidence, so they were read from the file.
- `rea capture-browser-scenario` (through reflow_ref.mjs) for the four Conductor window sizes.

### REA gaps hit

1. `analyze-javascript-application` keeps bindings but not object-pattern property names or the option objects passed to them, so a hook's query options (`placeholderData`, `isLoading` derivation) cannot be read from its evidence.
2. The same command took 3 min 9 s and wrote a 125 MB bundle for one 3.5 MB chunk; `inspect-analysis-view` documents only `{inputJson}` and gave no way to search the bundle for a symbol.
3. As in #605: `capture-browser-scenario` forces reduced motion and has no per-frame sampling, so no click-to-content timing comes from REA; the native Conductor window on sven m5 max was not measured (observe-native-ui needs Screen Recording).

## Not verified

- The native Conductor window: Conductor's numbers come from its extracted frontend in Chromium with mocked IPC, so they include no git or disk time.
- macOS WebKit: OpenConductor's numbers come from WebKitGTK on Linux under Xvfb with software rendering.
- A workspace opened for the first time after launch still shows "Loading changes…" until git answers (about 100 ms here), as Conductor does for an uncached workspace.
