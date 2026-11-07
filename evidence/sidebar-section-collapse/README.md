# Custom-section collapse persistence

Conductor Rebuild traced the retained Conductor 0.87.6 renderer without executing it. The reference serializes custom-section collapse state. OpenConductor main `e7ab5573d` instead initializes `App.tsx`'s set to empty on every mount and never saves it.

## Reference evidence

[The static trace](reference-static.json) includes exact artifact hashes, UTF-16 and UTF-8 offsets, focused excerpts, and limitations. Regenerate it with:

```bash
node tools/side-by-side/trace-section-collapse.mjs .rea-work/dist/assets
```

The script verifies both decoded files against their known SHA-256 identities and the retained REA graph in `evidence/frontend/rea-analyze-javascript-application.json.gz`. The extraction record is `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`. The original app and extraction provenance are in `evidence/sidebar-ws-numbers/README.md` and `evidence/frontend/README.md`.

The static chain is:

1. The custom-section component calls `aW` with `section-${n.id}` and `defaultCollapsed: false`.
2. `aW` reads and updates `workspace.sidebar`'s `collapsedGroups` through `Gde`.
3. `Gde` reads and updates `DGe`, a persisted store whose serialized projection includes all `routeStates`.
4. The store uses `route-user-state-v1` in the `route-user-state` backend subsystem. Its merge validates the saved state and restores `routeStates` during initialization.
5. The index chunk's persistence middleware calls `getItem` during initialization and `setItem` on state changes. The storage adapter delegates to backend `getEntry` and `setEntry`.

This establishes the intended serialized lifecycle, not a successful native reload observation. Extracted JavaScript remains untrusted data and was never evaluated.

## Implementation boundary

The custom-section store uses the existing subsystem adapter. Desktop persistence goes through `local_storage_*_entry`; browser development uses the adapter's existing localStorage fallback. The new entry is `sidebar-custom-section-collapse-v1` in `route-user-state`.

The separate entry is an OpenConductor design choice, not Conductor's byte format. `ChangesPresentationStore` already writes the entire reference-shaped `route-user-state-v1` envelope. Independent sidebar and Diff writers must not replace each other's saved state. The focused adapter test verifies that saving sidebar collapse leaves Diff's envelope unchanged. No data migration or reference-app storage read is performed.

The store publishes immutable snapshots to both Sidebar and PaletteHost through their existing shared App value. It preserves section IDs through rename and reorder without pruning against an initially empty section list. Clicks made before asynchronous hydration override the saved state for those IDs only. Writes are ordered. Read failures do not overwrite unknown saved state; the UI still toggles for the current session.

Built-in Pinned, My workspaces, project groups, Settings, scrolling, sizing, and palette keyboard behavior are outside this change.

## Verification

- `node --experimental-strip-types --test src/state/customSectionCollapse.test.ts` passes 9 tests. The tests cover collapse and re-expansion across fresh store instances, delayed hydration, two early clicks, malformed values, snapshot subscriptions, failed writes, failed reads, ordered writes, and the existing backend adapter using its in-memory command implementation.
- The same reload regression fails with persistence deliberately disabled in an isolated temporary copy. It observes `[]` instead of `["focus"]` after creating the next store. This mutation reproduces the old session-local lifetime; it is not an app runtime capture. The initial test-first attempt also failed because the new module did not yet exist.
- Focused sidebar ordering, navigation sections, shortcut projection, local-storage adapter, and new-store tests pass 42 of 42.
- A strict targeted TypeScript check of the three new source and test files passes.
- `npm run typecheck` cannot pass with this checkout's existing dependencies. It reports missing `mermaid` and `dompurify`, introduced on newer main. No dependency install or build was run in this source-only lane.
- `git diff --check` passes.

## Remaining acceptance and REA gaps

REA MCP operations are unavailable in this Session. The retained graph and matching decoded files were sufficient for this bounded source conclusion. The sole native executor was consulted and did not operate the app for this task.

No browser, package, or native runtime check was performed. There is no screenshot because this assignment excludes runtime, builds, and capture. Source and unit checks do not establish pixel parity, WebKit input behavior, or actual disk persistence in a packaged app.

The deferred exclusive native scenario uses only a disposable profile after the existing confinement gate is cleared: create a synthetic custom section, collapse it, reload the renderer, and confirm that the same section is still collapsed. Expand it, reload again, and confirm that it remains expanded. Verify workspace identity and member rows remain unchanged. Record built-in groups separately rather than treating their results as custom-section evidence. Do not change the installed app or existing user data to obtain this proof.
