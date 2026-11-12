# Sidebar modified-click activation

Conductor Rebuild adds the original local sidebar row's event guard to `useWorkspaceRows`. The row already passes its click event through `onClick={onSelect}`. Its callback type now carries that event instead of discarding it. Prevented, non-primary, Meta, Alt, Control, and Shift clicks leave selection and attention chats alone. Ordinary primary clicks keep their existing selection and unread-chat behavior.

## Source

Qualified default-branch head `7dc8bbd014ccfeb2202fdd153c33aa3e9060dcb3`. Its row bytes equal the retained baseline snapshot. [Source identity and complete retained caller spans](source.json) bind both original shipped artifact hashes to REA evidence `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`. Both artifacts and all six spans were checked again before editing.

The original `lJn` calls `NCi` for selected state and renders `SFi`. `SFi` passes its guarded handler to `wFi` as `onNavigate`; `wFi` binds that handler to the anchor's `onClick`. The guard runs before onboarding, run-app activation, workspace navigation, unread mutation, or session navigation. This change copies only that guard into the local row callback. It does not add anchor navigation or run-app behavior.

## Verification

- **Failed before as intended.** `node --experimental-strip-types --test src/components/sidebarRowActivation.test.ts` failed all seven blocked cases because the mounted production row dispatched workspace selection. All three ordinary-primary controls passed. [Readable baseline](red.tap), with trailing spaces removed. [Unmodified baseline output](red.original.tap.gz).
- **Passed after.** The identical command passed all ten tests. Each blocked case also checks the current unread and current waiting-chat states. No selection, unread mutation, attention-chat request, new preventDefault, or stopPropagation occurs. [Raw candidate](green.tap).
- **Passed adjacent checks.** `node --experimental-strip-types --test --test-concurrency=1 src/components/sidebarArchiveShortcut.test.ts src/components/sidebarArchiveBusyVisibility.test.ts src/components/sidebarNumberHintOverrides.test.ts src/state/chatUnread.test.ts src/state/openChat.test.ts` passed all 32 tests. [Raw adjacent results](adjacent.tap).
- **Passed integrity checks.** `sha256sum -c evidence/sidebar/modified-click/frozen.sha256`, the source verifier, and `git diff --check`. The fixture hash is `755524d9d17768568db12736beb3114c26eecb1d1be72f00282a756a072d192a` before and after. The [ten-case source contract](expected-cases.json) is preserved byte-for-byte, including its original pre-execution status. The logs above record execution.

These checks ran sequentially in the assigned checkout on Reason Cloud, within the existing ordinary test slot. One `npm ci --ignore-scripts --no-audit --no-fund` installed 394 packages in five seconds. The package-lock hash stayed `0714cb6ccdd0e8332f4ff08dc6b9ec0eb786e8f7b6b386663d31b9323579796a`. The slot was released after the focused checks.

Test Behavior, Not Implementation kept the regression at the mounted production row and hook, with real attention selection and chat-request helpers. The test substitutes external status, script, PR, and visual adapters. It does not copy the activation predicate.

## Limits

No browser, native, provider, server, E2E, heavy build, or local full-project typecheck ran. No screenshot exists because UI and native execution were not admitted. Calling a mounted callback with a non-primary event does not show that a browser emits that click. Anchor defaults, popup behavior, physical input, current installed Conductor identity, and macOS WebKit parity remain unverified.

An earlier full REA graph parse exceeded 120 seconds. The complete retained original bytes, hashes, offsets, and caller spans support this bounded source claim, not a fresh whole-graph analysis. No new REA execution was attempted.

This unit is outside the existing package cut. It changes no header, dispatcher, IME, timestamp, section, workflow, provider, or release policy. Main/package/native follow-through remains with the existing owners. Enabled exact-head checks must pass before merge; skipped or manual-only jobs are not passing checks.
