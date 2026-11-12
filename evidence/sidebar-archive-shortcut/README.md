# Sidebar Archive tooltip follows the saved primary shortcut

Conductor Rebuild owns SIDEBAR-ARCHIVE-TOOLTIP-REMAP-271. Ledger deduplication confirmed no competing writer and cleared ordinary automatic hosted CI for the regression-only publication. This is not an executed regression or product correction. No local or native runtime is admitted.

## Source finding

At inspected default-branch commit `021aeaa4027770258b4daae127bc829d1575d0ab`, `SidebarWorkspaceRow` computes `ARCHIVE_SHORTCUT` once from registry defaults. The selected row passes that constant to its Archive tooltip. Neither a saved override loaded after mount nor a live remap changes that label.

The retained Conductor 0.87.6 REA-decoded renderer instead computes `nFt("workspace.archive")` inside `DZo`. Its `nFt` calls `jde`, which reads `Mde`'s live external-store snapshot and resolves the primary key through the index bundle's override resolver. `SFi` passes the archive model through `wFi` and `eea` to `iea`. `DZo` and `iea` both gate the shortcut on selection. `QZo` renders that shortcut label. The first shortcut, not the additional-key list, is the source contract.

`source.json` pins both complete original assets, eighteen byte spans and six current baseline files. The spans include the renderer/index import and export aliases. The retained source provenance is in [the earlier real-app REA record](../help/shortcut-overrides/reference-provenance.md). Static source does not establish current installed-app freshness, visible remapping behavior, or native parity. Existing renderer heap and index graph-budget gaps remain recorded there; no new REA runtime was started.

## Frozen mounted regression

The frozen regression is `src/components/sidebarArchiveShortcut.test.ts`. SHA-256 is `0545e3d99ceed893c1d005aa46e8465d436c7788e0588f80e56580a671be741a`.

The fixture mounts actual `SidebarWorkspaceRow`, `KeybindingsProvider` and `Tooltip` using the real override parser, resolver, registry and glyph formatter. It focuses the archive trigger through the real tooltip handler and reads rendered tooltip text. ReactDOM's portal destination and native/DOM/hook boundaries are substituted; positioning and actual native focus are not exercised.

Seven cases cover the default selected tooltip, a saved override arriving after mount, a live remap while the tooltip is open, primary-only display when additional shortcuts exist, reset on the same row, unselected omission before and after a remap, and archive-click callback plus propagation behavior. The source predicts four intended remap assertion failures and three passing controls. All cases are NOT_RUN.

## Checks and limits

Python source verification passed on Reason Cloud for both full original asset identities, all eighteen retained spans, six current baseline pins and the frozen fixture hash. `git diff --check` passed. Product source remains unchanged.

No local Node, Rust, install, browser, native app, workflow dispatch, rerun or extra watcher was run. Mounted execution, physical keyboard/focus behavior, installation, visual parity and native acceptance remain NOT_RUN.

The first ready main-based publication contains only the frozen regression and source evidence, using ordinary automatic CI. Require intended assertion failures before changing product code. Then use the existing live overrides and primary-key resolver at the tooltip caller, preserve the same fixture, and require every exact-head workflow to pass before protected merge. Switch modifier hints, shortcut navigation, archive action semantics, other rows, footer actions and the shared tooltip primitive are excluded.
