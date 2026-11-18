# Grouped center-terminal close history

Conductor Rebuild / SAME1F. **Prepared, not executed; no product treatment applied.**

## Source-derived oracle

Retained real Conductor REA parent `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`.
Complete original renderer: 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
Complete original index: 3,493,297 bytes, SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.
Original-byte source archive attachment `e78b8633-85a2-4561-a67c-ff7181b1d9fc`, SHA-256 `991f15ebf130ccb8e705fc74f612dbb46095bd6d73b420fbced1ffbcd94165bc`.

This is enabled-mode, writable ordinary-local behavior: split tabs and big-terminal mode are enabled. Full source qualification already closed the permission/factory/mount path: `hFt → aYo/g8i → gXo/bXo/vXo → cYo/dYo/fYo/pYo/d8i → yYo.te/Q → Ps/Gr → selected grouped mount`.
Reference JavaScript is inert evidence and is never evaluated.

In `yYo`, navigation `z` records a workspace-local viewed tab; `Q` removes the closed tab from history and the grouped layout. If the closed tab was active/current, it searches surviving viewed keys across groups before falling back to structural selection. Inactive closes do not navigate. `te` invokes this transition before terminal destruction.

Counterexample at freshly fetched main `234ec70ea89135b83f68f287330a3701d27f2b2d`:

- Three groups `[chat,A] | [B] | [C]`, left active tab chat, selected group B.
- View chat, then C, then B; click B's visible close button.
- Reference source selects C (surviving MRU) and collapses B's empty group.
- Current source directly destroys B and structurally reconciles to the first group's chat.

This is not a native observation or an executed failing test. #822 covers a different right-panel store. #1395 supplies grouped structural reconciliation but no MRU close transition.

## Frozen regression boundary

`src/features/workspace/centerPanelCloseHistory.test.ts` mounts the real `useCenterPanelLayout`, `CenterPanelGroups` and controller/model. TypeScript AST extraction retains the complete actual `MainTabs` parent and complete `renderCenterTabs` declaration from the selected source root, including its real `onCloseTerminal` wiring. The test invokes actual host-tab and close-button callbacks and asserts the selected route, surviving groups and rendered focused-pane prop.

Preference and decorative/keybinding-scope leaves are inert. The terminal destruction adapter records exact workspace/id and removes the fixture's terminal row; no terminal session module, process, provider, PTY or native app is loaded. It does not simulate DOM propagation, physical focus, keyboard shortcuts, native signal termination or packaged-app behavior.

Eight frozen contracts: original cross-group MRU, stale closed-key skip, workspace isolation with identical terminal IDs, empty-history structural fallback, inactive close preserving selection, false/unset ordinary controls, and non-persistence across a fresh owner. Ordinary controls deliberately leave the existing missing-terminal route fallback to its ordinary caller; this test does not replace that caller.

## Treatment design (unapplied)

Own non-persisted workspace MRU at the center-layout boundary, record real tab selections, and add a narrow explicit grouped close transition before existing destruction. History must never be added to persisted layout JSON. Disabled mode must remain a no-op.

Only the model/controller and grouped hook are exclusively owned here. The separately coordinated shared-file edit is exactly the `renderCenterTabs` `onCloseTerminal` callback: run the hook's close transition before `closeTab(workspace.id, id)`. No imports, other WorkspaceView functions, ComposerSession, attachment callbacks or platform adapters change.

## Verification state

Only source preparation / Python integrity checks / `git diff --check` may run before separate serialized admission. Node, tests, builds, installs, browser/native/provider/PTY execution have **not run**. Product treatment is held until an actual admitted RED. No old-cache scan, preservation rebind, cleanup, reinstall, old RED9 execution or mutation is part of this unit; the historical same-call inode preservation failure remains FAILED and unexplained.
