# Sidebar Archive visibility during run scripts

Conductor Rebuild owns SIDEBAR-ARCHIVE-BUSY-VISIBILITY-271. The ledger cleared only the row's Archive affordance gate and script subscription, this new regression, and this evidence directory. This checkpoint contains no product change. It follows merged #1113 and pins fresh main `649f47b9d80eb1d7510c2b405b25e026ffddf78b`.

## Retained real-app source

The two complete retained REA-decoded Conductor 0.87.6 assets match the identities in [the real-app provenance record](../../help/shortcut-overrides/reference-provenance.md). `source.json` retains 22 exact byte spans and five fresh-main product pins. The spans are evidence, not executable inputs.

`DZo` reads `q_.useIsProcessBusy(localWorkspaceId)`. Its archive model exists only when the process is not busy and the workspace permission is not `read`. The renderer import and index export resolve `q_` to `ARt`. Without a task ID, its selector checks every process keyed to that workspace. `Pv` includes `starting`, `waiting_for_setup`, `running`, and `stopping`, but not `stopped`. The complete process store includes the state writers. An older stopped script does not override a later busy script.

`SFi` passes selection to `DZo`, then sends the model through `wFi` to `eea`. `eea` renders `iea` only when the archive model exists and there is no run model. Selection changes only the shortcut label in `DZo` and `iea`. Both selected and unselected local rows suppress Archive while busy.

The permission join is complete, not an inference from the word `read`. Renderer `Ld` resolves to index `kYt`, whose query selects `workspace.permissionLevel` from the live workspace store. The reader's `t9e` normalizes local workspaces to `write`. Remote workspaces use the stored `read | write` discriminator. Store writers publish those updates. This finding concerns local workspace Archive visibility only, not read-only files or cloud UI.

Fresh main's `Sidebar` passes `useWorkspaceRows.rowProps` to its workspace rows. Those props always supply `onArchive`. `SidebarWorkspaceRow` renders its Archive button whenever that callback exists, with no script-state query or subscription. The existing `activeRun` predicate already recognizes the same four busy states. Neither Archive execution nor the process state machine needs to change.

## Frozen behavioral contract

The regression is `src/components/sidebarArchiveBusyVisibility.test.ts`, SHA-256 `6be914881b28ce6f221da2e2cf0d4cd555a2808d17eb7ad294e347b56f2a3eea`. Each of its seven cases exercises both selected and unselected rows.

- A stopped or idle workspace keeps Archive and its click callback and propagation behavior.
- Each of the four busy states hides Archive, even after an older stopped script.
- Another workspace's busy snapshot and start or finish events leave Archive available.
- A start event hides Archive, and a finish event restores it on the same mounted row without a forced rerender.

The fixture mounts actual `SidebarWorkspaceRow`, `KeybindingsProvider`, and `Tooltip`. It uses the real `activeRun` module, keybinding resolver, labels, and status functions. The scripts API snapshot and event delivery are substituted external boundaries, available before the row imports them. DOM placement, native I/O, and unrelated diff, chat, and PR hooks are also substituted. Assertions read rendered `workspace-archive-button` presence. They do not inspect an internal hook or reproduce the visibility predicate.

The predicted baseline is five intended button-presence assertion failures and two passing controls. This is not an observed RED. Ordinary automatic hosted CI must show the intended failures before the minimal product correction. The exact same fixture must then pass, and every exact-head workflow must succeed before merge. The seven #1113 tooltip tests remain byte-identical at SHA-256 `8ad78950e3a408f4adbeb432541064156e8ea6c016eeb6d5f5d034fb1ae17187`.

## Verification and limits

The source verifier runs on Reason Cloud and checks both complete original asset identities, every retained byte span, the fresh-main snapshots, and both frozen fixture hashes.

```bash
python3 evidence/sidebar/archive-busy-visibility/verify_source.py \
  --renderer .ara-state/retained-conductor-renderer.js \
  --index <original-index-BGEQ8YjU.js> --baseline
sha256sum -c evidence/sidebar/archive-busy-visibility/fixture.sha256
git diff --check
```

These checks establish source consistency only. Hosted behavioral execution is pending. Local Node, Rust, browser, installation, native UI, and visual acceptance are NOT_RUN. No screenshot is available because this lane has no browser or native execution admission. No manual workflow dispatch, rerun, new runner, or extra watcher is used.

The retained REA renderer heap and index graph-budget gaps remain documented in the linked provenance record. No new REA runtime was started. Freshness against the currently installed Conductor app and native behavior are unverified.

Archive action dispatch, context menus, shortcuts, registry, navigation, footer, permission policy, backend, process lifecycle, and icons remain outside this change.
