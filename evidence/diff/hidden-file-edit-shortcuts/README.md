# Only the visible retained diff file owns the edit shortcut

Conductor Rebuild, 2026-11-17. Source/dispatcher verification on Reason Cloud;
no reference execution, app/browser/native run, new capture or installation.

## Retained reference contract

Conductor 0.87.6 renderer `renderApp-D_fmY7hW.js`, 11,600,457 bytes,
SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
The existing extraction is REA artifact
`ev_a4ce503a76a3198b2d2bec127c09bb6940b806849318ccc51523f40701751ab5`.
No fresh acquisition or REA invocation was needed; the existing large-bundle
analysis limitations remain recorded in `evidence/rea/rea-invocations.tsv`.

The complete inert literal [bji](../../open-in/deleted-finder/reference/bji.txt)
is UTF-8 `[9643145,9646819)`, 3,674 bytes, SHA-256
`2d2b8aac64bada5ead6bc143ac6bb272544791374a9b71b38e57eab55c8f5688`.
Its provenance is [the retained manifest](../../open-in/deleted-finder/source.json).
The `isVisible:o=!0` argument feeds the `!o` early-false branch of its
`workspace.toggleFileEdit` registration. Thus a hidden retained file does not
consume that shortcut. The caller's retained [Jqo](../../open-in/deleted-finder/reference/Jqo.txt)
keeps five recently visited file views and forwards visibility separately.
Reference bytes were hashed and read as data, never evaluated or copied into
production implementation.

## Fresh-main mismatch and narrow correction

Freshly fetched main was `f60b6e365395ceb62b2b2ec6e1542a16a5b0d0ee`.
`DiffTab` already retains five visited `OpenFile` components and hides those
that are not selected (or all of them for a no-match filter). However both
preview/code `workspace.toggleFileEdit` handlers in `OpenFile` ignore
`isVisible`. Their state setters return undefined, which the real dispatcher
treats as handled. An earlier-mounted hidden view can therefore consume Cmd+E
and change its own mode while the selected file is unchanged.

`useKeybindings(isVisible ? existingHandlers : {})` follows the established
conditional-registration pattern in `SettingsSearch`. The existing hook's
command-ID dependency removes hidden registrations and restores visible ones.
File components, their state, edit eligibility, preview/code defaults, header
buttons, save operations and every other shortcut remain unchanged. This does
not reinterpret the full reference code-edit/preview-mode state machine.

Exact file lease was coordinated with ledger Session `ddfc6518` before writes:
`DiffViewer.tsx`, new `fileEditShortcuts.test.ts`, and this evidence directory.
No composer, queue, shared dispatcher, workflow or native fixture files changed.

## Reproduction and checks actually run

The test file evaluates only the unchanged ordinary-JavaScript
`useKeybindings(...)` call sliced from our production `OpenFile`, and feeds its
callbacks into the real `bindCommands`/registry/default bindings and dispatcher.
It does not copy the handlers or fake dispatcher ordering. The reference is
only a hash-checked inert control. Visibility transitions explicitly re-register
the production call while preserving fixture mode values; they are not React
hook-mount/lifecycle tests.

1. **RED, exit 1:**
   `node --experimental-strip-types --test src/features/diff/fileEditShortcuts.test.ts`
   against unmodified current-main production source: **9 passed, 9 failed**.
   Hidden-alone cases consumed the key; hidden-first code/preview combinations
   toggled the wrong owner; no-match and visibility-transition cases failed.
   The visible-only, visible-first and reference/caller controls passed.
   See the unmodified compressed receipt [red.tap.gz](red.tap.gz).
2. **GREEN, exit 0:** the identical test file/command after only the conditional
   registration change: **18 passed, 0 failed**. Both registration orders, code
   and preview combinations, fallback to another owner, all-hidden pass-through,
   eligibility and retained mode controls are covered. See [green.tap.gz](green.tap.gz).
3. **Combined controls, exit 0:**
   `node --experimental-strip-types --test src/keybindings/{bind,dispatcher,resolve,shortcut}.test.ts src/features/diff/{fileEditShortcuts,WrapLines,editorContents,draftStorage}.test.ts src/settings/prefs.test.ts`
   — **100 passed, 0 failed**. Before the correction the unchanged adjacent set
   excluding the new regression passed 82/82. See [controls.tap.gz](controls.tap.gz).
4. **Passed:** `git diff --check` and current-main scope comparison.

Full React/component suites, typecheck and build were not run locally because
this checkout has no installed dependencies. Automatic exact-head CI is a
separate receipt and must finish successfully before merge. The direct-call
source slice proves registration and dispatcher behavior for the supplied
visibility/eligibility inputs, not React hook cleanup timing, actual keyboard
delivery, native focus, packaged operation or visual parity.

## Package/native acceptance still required

`PACKAGE_NOT_VERIFIED`, `NATIVE_NOT_RUN`. No screenshots are provided because
this lane is source-only, not because Tauri screenshots are impossible.

The existing sole executor/ledger owns later acceptance on an identified
containing-main package, without parallel execution from this lane:

- Visit editable code A, then previewable B; Cmd+E changes only visible B.
  Return to A: its mode did not change while hidden. Repeat with kinds reversed.
- With both views retained, apply a no-match Changes filter; Cmd+E must not
  change either hidden file or prevent another eligible owner handling it.
- Clear the filter, revisit A and verify its existing mode/draft is retained;
  Cmd+E and the visible header toggle still work on the selected file.
- Retain the exact build/merge SHA, command/override/focus setup, outcome and
  visible evidence. Source/dispatcher GREEN is not a receipt for these cases.
