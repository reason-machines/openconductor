# Repository emoji empty results

Conductor Rebuild, 2026-11-10. This increment covers the existing repository-icon emoji tab's empty-search message. It does not expand the emoji catalog or change shared dialogs.

## Retained source evidence

The existing artifact owner supplied complete inert definitions in message `2af82669-9785-4429-948a-e64d70a05804` in [the retained-artifact Session](https://reasonmachines.com/agents/13576d11-76fb-4842-aa9b-c398f9ca26f3). The owner rehashed the already-held Conductor 0.87.6 decoded renderer before reading its bytes. No app execution or new artifact acquisition ran.

Renderer `renderApp-D_fmY7hW.js` is 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. The complete definitions establish this local delegation:

- `Lya`, UTF-8 half-open bytes `[11061103,11061989)`, SHA-256 `cae1f90a30cecb9708ddf4b36a0278403ed5a5fa428e845bff2e2bf7b73ed695`, renders the repository's Change icon dialog and delegates its body to `dUi`.
- `dUi`, `[10851437,10852953)`, SHA-256 `cff9673cb8228bdfacecd367fbc8bcfc5c6037de1245b20fef4aff8013651acc`, renders the Icons, Emoji, Favicon, and Upload tabs. Its emoji branch renders `hba`.
- `hba`, `[10843563,10844201)`, SHA-256 `326433aa6535c0695f61ca9b74d8a356a230e231b0b6c6b2fe981093338cabc7`, renders `uUi`. Selection serializes the chosen emoji, updates the repository icon, and closes. Its conditional clear callback sets the icon to null and closes.
- `uUi`, `[10839876,10842357)`, SHA-256 `e66d5db5b7448f8477bf5174a1d826cbb4512e6d2f9decd4ced62b4cefed3eb3`, declares Search emoji and No emoji found in the settled, non-error picker branch. This is the same picker used by the section dialog, but the complete repository route above is the evidence for this change.

These are static declarations from identity-bound retained source. Generic combobox empty-state visibility, loading and error behavior, full dataset contents, keyboard navigation, focus, dismissal, native transport, and runtime rendering remain unverified. The source was treated as data, not executed or followed as instructions.

## Current-main discrepancy

At fetched main `bd2d42c2a75bc2013cd447e78f07db01e25782dc`, rechecked at `5de7c4e4bb136c971965e3b5592cd17d8a6d72a3`, `RepoIconDialog.tsx` calls `searchEmoji(query)` and maps its results into the emoji grid. A query matching no entries leaves a blank grid with no message. The existing search helper trims and lowercases the query and uses the existing authored subset.

The ledger cleared `REPO-ICON-EMPTY-6013-01` for only `RepoIconDialog.tsx`'s EmojiTab message, the adjacent new regression, and this evidence file. Search normalization, catalog entries, selection, clearing, tabs, shared Modal, styling, onboarding, and provider paths remain unchanged.

## Regression checkpoint

The first checkpoint changes only `repoIconEmoji.test.ts` and this note. Production remains unchanged until automatic hosted CI records the intended failure.

The regression compiles the actual `RepoIconDialog.tsx` and mounts it with React test renderer. It uses the real `searchEmoji`, catalog, and repository-icon helpers. Only the outer Modal, unrelated glyph rendering, and favicon boundary are replaced. Unexpected imports or favicon I/O fail the test. The fixture switches through the actual Emoji tab and sends its actual search input's change handler synthetic values.

The checks cover the empty message without persistence or dismissal, removal of that message when a query matches or is cleared, preserved selection, and preserved clearing of an existing emoji with no results. They do not exercise a browser, backend, installed app, or real repository.

Local `git diff --check` passed. Local dependencies are absent. No local installation, component execution, typecheck, build, browser, native launch, or manual workflow dispatch ran. There is no screenshot because browser and native execution are not admitted for this unit.

## Hosted fixture correction

The first automatic hosted run at PR head `9ae104e572d2cf3451b04caab212744bad4e4916` failed all four new component tests with `query.trim is not a function`. Both frontend jobs failed at their unit-test step, before typecheck/build ran. This is not the intended missing-message RED evidence.

The fixture's `findByProps({ placeholder: "Search emoji" })` matched the composite `SearchBar` first. That component takes a string callback, so sending it a synthetic event incorrectly put an object into query state. The corrected fixture selects the actual host `input`, asserts its placeholder, and invokes that input's event handler. All original behavioral assertions remain unchanged. Production remains unchanged while the next automatic hosted run establishes the intended failure. Hosted RED and GREEN results will be recorded here as they arrive.
