# Built-in sidebar collapse persistence

Conductor Rebuild, source-only functional correction.

## Reference and discrepancy

On fetched main `557230c244d1957751082f683e4ffbc87ad14e97`, Pinned's `SidebarGroup` and My workspaces' `Sidebar` use component-local `useState(false)`. App conditionally mounts Sidebar. Losing collapse on remount/reload follows from that lifecycle; no app scenario was run for this change.

`reference-static.json` reuses the retained real-app REA graph `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`. The repeatable trace checks both decoded artifact hashes against that graph before reading inert text:

```bash
node tools/side-by-side/trace-section-collapse.mjs .rea-work/dist/assets
```

The renderer calls `aW("navigation-section-pinned", ...)` and `aW("navigation-section-main", ...)`, both default-expanded. `aW` updates `workspace.sidebar / collapsedGroups` through `Gde`; `DGe` serializes routeStates through the persisted route-user-state store and backend adapter. Exact offsets, hashes, excerpts and limits are in the JSON. This is static control-flow proof, not observed successful reference-app disk I/O. No new REA operation or reference capture was attempted.

## Correction

Reuse the existing collapse store's hydration, immutable snapshots, early-click merge and ordered writes with a separate `sidebar-builtin-collapse-v1` entry in the existing route-user-state subsystem. One built-in store in Sidebar owns both keys; Pinned is controlled by that snapshot, and My workspaces uses the other key. The existing custom-section entry and Diff envelope are unchanged. The separate entry is our design choice, not Conductor's serialization format. No keyboard ordering, drag, archived-header, chat or visual styling changes.

## Checks

- RED: `node --experimental-strip-types --test src/components/builtinCollapse.test.ts` failed two tests before the fix. The rendered remounted Pinned group was expanded instead of collapsed; built-in load also read custom-section `focus` data instead of its own empty namespace. The early-toggle control passed. Retained in `red.tap`.
- GREEN: `node --experimental-strip-types --test src/components/builtinCollapse.test.ts src/state/builtinCollapseHook.test.ts src/state/customSectionCollapse.test.ts src/palette/shortcutOrder.test.ts src/state/sidebarOrder.test.ts` passed 33/33. Retained in `green.tap`.
- The regression renders actual transformed SidebarSections TSX with React server rendering after fresh store instances. Both group keys round-trip, expansion persists, delayed hydration preserves the other key, and custom-section/Diff entries remain unchanged. The production hook test executes transformed hook code with a minimal React lifecycle harness and in-memory adapter, not a browser or real React mount.
- `npm run lint:colors` passed six checker tests and source scan.
- `git diff --check` passed.
- `npm ci --ignore-scripts --no-audit --no-fund` passed, restoring this Session's lockfile dependencies only. Missing local mermaid/dompurify errors cleared.
- `npm run typecheck` still fails solely on the separately owned main regression at WorkspaceView line315: missing `attachmentPath` and `randomDir`. #816 owns the import repair. No duplicate fix is included. Retained in `typecheck.txt`.

## Unverified acceptance

No app runtime, preview, browser, build, native input/install/capture, provisioning or #793 slot was used. There is no screenshot because this lane has no runtime admission. Actual React unmount/blur/effect timing, native WebKit behavior, packaged disk I/O, initial hydration flash, rapid unmount before pending writes finish and native reload acceptance remain untested. Store/hook and server-render tests do not establish pixel parity. Source inspection checked My workspaces' wiring; its full Sidebar component was not mounted by these focused tests.

After serialized runtime admission, use a disposable profile: collapse Pinned and My workspaces independently, hide/show the sidebar, reload, and confirm both remain collapsed. Re-expand one, reload, confirm only that group expanded. Check custom sections and workspace identities remain unchanged; do not change stable app/data for proof.
