# Sidebar Archive tooltip follows the saved primary shortcut

Conductor Rebuild owns SIDEBAR-ARCHIVE-TOOLTIP-REMAP-271. Ledger deduplication confirmed no competing writer and cleared ordinary automatic hosted CI for the regression-only publication. The corrected hosted regression reproduced all four intended remap assertion failures with three passing controls. The caller-only correction is now applied; unchanged-fixture hosted GREEN is pending. No local or native runtime is admitted.

## Source finding

At inspected default-branch commit `021aeaa4027770258b4daae127bc829d1575d0ab`, `SidebarWorkspaceRow` computes `ARCHIVE_SHORTCUT` once from registry defaults. The selected row passes that constant to its Archive tooltip. Neither a saved override loaded after mount nor a live remap changes that label.

The retained Conductor 0.87.6 REA-decoded renderer instead computes `nFt("workspace.archive")` inside `DZo`. Its `nFt` calls `jde`, which reads `Mde`'s live external-store snapshot and resolves the primary key through the index bundle's override resolver. `SFi` passes the archive model through `wFi` and `eea` to `iea`. `DZo` and `iea` both gate the shortcut on selection. `QZo` renders that shortcut label. The first shortcut, not the additional-key list, is the source contract.

`source.json` pins both complete original assets, eighteen byte spans and six current baseline files. The spans include the renderer/index import and export aliases. The retained source provenance is in [the earlier real-app REA record](../help/shortcut-overrides/reference-provenance.md). Static source does not establish current installed-app freshness, visible remapping behavior, or native parity. Existing renderer heap and index graph-budget gaps remain recorded there; no new REA runtime was started.

## Frozen mounted regression

The frozen regression is `src/components/sidebarArchiveShortcut.test.ts`. SHA-256 is `8ad78950e3a408f4adbeb432541064156e8ea6c016eeb6d5f5d034fb1ae17187`.

The fixture mounts actual `SidebarWorkspaceRow`, `KeybindingsProvider` and `Tooltip` using the real override parser, resolver, registry and glyph formatter. It focuses the archive trigger through the real tooltip handler and reads rendered tooltip text. ReactDOM's portal destination and native/DOM/hook boundaries are substituted; positioning and actual native focus are not exercised.

Seven cases cover the default selected tooltip, a saved override arriving after mount, a live remap while the tooltip is open, primary-only display when additional shortcuts exist, reset on the same row, unselected omission before and after a remap, and archive-click callback plus propagation behavior. The corrected regression-only head `084472476b3787b5b12bc716384b7ac2d4003ec9` reproduced all four intended remap assertion failures in both frontend jobs of automatic CI run `43133892679`; default selected, unselected and archive-click controls passed. Each failure was actual `Archive workspace ⌘⇧A` versus expected `Archive workspace ⌘⌥K`, not a mount/setup failure. Typecheck passed. See [the hosted RED receipt](hosted-red.json).

## Fixture typing repair

Initial head `207f932e` failed hosted typecheck because React.createElement requires KeybindingsProvider children in its props type. This is not qualified behavioral RED. The only test change moves the same Rows child into the children prop. Static comparison confirms that all seven scenario bodies, assertions and event sequences are unchanged. The new fixture hash is frozen for the corrected regression-only baseline; product code remains unchanged. See `setup-repair.json`.

## Checks and limits

Before the correction, Python source verification passed on Reason Cloud for both full original asset identities, all eighteen retained spans, six fresh-main baseline pins and the frozen fixture hash. Fresh main remains `021aeaa4027770258b4daae127bc829d1575d0ab` and matches those six product inputs. `git diff --check` passed.

The correction removes the module-level default-only archive constant, reads the existing live `useKeybindingOverrides` snapshot in the row, and formats only the effective primary `workspace.archive` key. The active-row gate, archive callback, registry default, switch-modifier hint and shared Tooltip are unchanged. All seven regression cases remain byte-identical to the qualified RED fixture.

The full baseline unit suite reported 3,230 tests, 3,225 passes and five failures. Four failures are this lane's qualified remap RED; the fifth is an unrelated disclosure-remount baseline source-pin drift (`src/scripts/api.ts`) reported to root for the existing owner. It remains a merge gate; this PR does not change that harness.

No local Node, Rust, install, browser, native app, workflow dispatch, rerun or extra watcher was run. Hosted candidate execution is PENDING. Physical keyboard/focus behavior, installation, visual parity and native acceptance remain NOT_RUN; no screenshot is available because browser/native execution is not admitted in this lane.

The first ready main-based publication contained only the frozen regression and source evidence, using ordinary automatic CI. The four intended assertion failures were observed before the caller correction. Preserve the same fixture and require every exact-head workflow to pass before protected merge and consuming-main verification. Switch modifier hints, shortcut navigation, archive action semantics, other rows, footer actions and the shared tooltip primitive are excluded.
