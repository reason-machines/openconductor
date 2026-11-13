# Create a section without retaining its workspace pin

Conductor Rebuild reproduced issue #1033 against main `7dc8bbd014ccfeb2202fdd153c33aa3e9060dcb3`. The real reducer retained the captured workspace's `pinnedAt`. The mounted store's desktop persistence path also omitted the unpin write. Removing the workspace from the new section would therefore restore its old pin.

The retained original Conductor 0.87.6 `A$t` function unpins the captured workspace after section creation succeeds. `WIr` and `tve` implement the local persistent section layout. [Source identities and original byte ranges](source.json) retain the REA lineage. The original assets were rehashed and sliced, not executed.

The fix clears captured members' pin metadata in the reducer and queues their existing `db_set_workspace_pinned` writes behind an accepted layout write. Failed or superseded layout writes do not unpin persisted workspaces. A failed creation reloads pin metadata alongside the layout. Plain creation, unrelated pins and the existing error callback retain their behavior. No Rust or sidebar persistence API change is needed.

## Verification

- **Failed before as intended.** `node --experimental-strip-types --test src/state/createSectionUnpin.test.ts` produced three assertion failures and three passing controls. [Raw RED](red.tap).
- **Passed after.** The identical command passed all six cases, including remove and hydration, plain creation and rejected creation. [Raw GREEN](green.tap).
- **Passed nearby checks.** `node --experimental-strip-types --test src/state/createSectionUnpin.test.ts src/state/navigationSections.test.ts src/state/sidebarPersist.test.ts src/palette/paletteComposition.test.ts` passed all 46 cases. [Raw nearby output](nearby.tap).
- **Passed typecheck.** `npm run typecheck` passed after replacing the new fixture's overly broad `Action` annotation with `satisfies Action`. Values and assertions were unchanged. The corrected fixture was rerun against both the baseline source snapshot and the fix. [Typecheck output](typecheck.txt).
- **Passed integrity.** `python3 evidence/sidebar/create-section-unpin/verify_source.py` verifies retained spans and the unchanged corrected [fixture hash](fixture.sha256). This is not behavioral verification.
- Browser, native GUI, physical SQLite, provider and released-install acceptance were **not run**. The mounted store uses an inert synthetic IPC adapter. There is no screenshot because no visible menu or browser change is included, and native execution remains outside this lane.

Fix Root Causes kept the repair in section creation rather than masking the pin in the sidebar projection. Test Behavior, Not Implementation kept the checks on actual metadata, persistence calls, removal and hydration.

The separate Move to section fixture and UI are not part of this dependency change. Its pinned Create control remains preserved.
