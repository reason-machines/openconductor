# Home workspace-list sidebar hint

Conductor Rebuild owns HOME-LIST-HINT-271-02, independent of parent #1041. The production scope is the existing override context import, read, and resolver argument in AllWorkspaces. Menu, filters, selection, archive, row status, callbacks, and CSS stay unchanged.

## Retained source qualification

Default main `248b6c359c830c6ac5e050721bae18e44e168068` has AllWorkspaces SHA-256 `f2cd29c810d99a0ea8cbb6fa59d09c00134e28bb2e48f6a681f1ef604e89c4b5`. Its render calls `effectiveShortcuts("view.toggleLeftSidebar")` without overrides and does not subscribe to the existing provider. This is a source candidate until the new hosted regression exercises it.

The [received source packet](reference.json) has SHA-256 `2c63cf615c9de2f145efe3b907741c12a0fa481a28593589fba942b25214c1a7`. The received 11,600,457-byte renderer has SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. Python independently recomputes this digest, all six absolute UTF-8 and UTF-16 ranges, and span digests without executing reference code.

In that retained asset, `UJo` constructs `YJo` when the sidebar is hidden. `YJo` constructs `Ss` for `view.toggleLeftSidebar`. `Ss` resolves primary and additional shortcuts through `jde` and `Mde`'s external-store snapshot. The three shared helper sources and byte offsets exactly match the [retained focused receipt](../help/shortcut-overrides/reference-focused.json). The existing [Home source validator](../home-sidebar-hint/verify-reference.py) closes the imported resolver, setting-store aliases, and configurable registry command. Its prior HomeScreen behavior test is not this caller's RED evidence.

The sole artifact owner's [identity receipt](../home-sidebar-hint/reference-caller.json) records Conductor 0.87.6, binary SHA-256 `0ba55751aea5ecf592d2c78379760af641fb912a34b2c3573d41df031ffb831d`, REA parent `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367` and focused evidence `ev_118f9505f2b69a7f36f24659a649ccc235c40e8a64f65a2b1d8fd0371ba7f4bb` as supplied by this Session's source packet. This Session does not reread the binary or start another Mac executor.

## Frozen regression

`src/components/allWorkspacesSidebarHint.test.ts` mounts actual AllWorkspaces with a populated repository and the actual KeybindingsProvider. It uses the real override parser, formatter, dispatcher, and listeners. Unrelated archive, preferences, session-status, and decoration dependencies are controlled. EventTargets replace browser targets. A deferred persisted read and the provider's public setter drive changes while the parent element and props stay fixed.

Six cases cover defaults/click dispatch, delayed primary/additional hydration, live updates/reset, a single replacement, malformed saved data, and the hidden toggle. The three existing controlled AllWorkspaces fixtures receive only the new context dependency stub, with their assertions unchanged. `homeLoading.test.ts` already supplies that stub, and `createSection.test.ts` replaces AllWorkspaces itself.

The regression-only publication leaves production unchanged. Automatic hosted `node --test "src/**/*.test.ts"` must fail on the intended title mismatch before any production fix. Import, fixture, and typecheck failures are setup failures, never behavioral RED. Hosted results are pending.

## Source checks and limits

- `python3 evidence/home-list-sidebar-hint/verify-reference.py --renderer <received-renderer>` validates the complete received renderer and retained chain.
- `git diff --check` checks the patch.
- No local Node, installation, tests, builds, browser, native execution, workflow dispatch, or speculative reruns are admitted.
- No screenshot is available under those runtime restrictions. Mounted title-property checks do not establish native tooltip rendering, same-Cairo geometry, installed-provider behavior, or side-by-side visual parity.
- The REA semantic graph did not enumerate the embedded Tauri renderer. Raw retained spans fill that source gap, not runtime or fresh identity gaps. No new REA call or bug was encountered in this unit.
