# Section emoji search autofocus

Conductor Rebuild, 2026-11-18. Scope: request autofocus when the existing section emoji search input mounts, in create and edit. No catalog, popup architecture, filtering, keybinding, submit, provider or native changes.

## Reference and current source

Retained historical real-app REA lineage: `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. Decoded Conductor renderer `renderApp-D_fmY7hW.js`: 11,600,457 bytes, SHA256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. This increment reads retained source; it does not acquire or execute the reference app again. The packet's exact byte ranges and hashes are in [source.json](source.json), with unchanged excerpts in [reference](reference).

The mounted path is `kya → Tya → Aya → uUi → bCi → Es("input")`. `Aya` supplies the emoji trigger/open state and mounts `uUi`; `uUi` explicitly passes `autoFocus: true` on its Search emoji input. `bCi` forwards that property through its rest/validation props to the input prop assembly. Initial section-name autofocus is separate and already exists.

Fresh main `5100f02abdc1129050d5f020f8de552680fc2994` lacks `autoFocus` on `SectionDialog.tsx`'s Search emoji input (SHA256 `329c511cbd62d38291a47e1881445aad724d8322738600fddfe2c8b40c9f4313`). The existing test fixture at that main has SHA256 `a666cda4ee1a1bda0561e43d907be52267deebb1c100ad44425733043d4df599`.

## Frozen regression and controls

Append exactly the two prequalified create/edit checks to `src/components/sectionEmoji.test.ts`; preserve every byte of the original fixture and its ten tests. The added checks inspect the real mounted component's search input prop. They also cover absent search before opening, initial name autofocus, closing/reopening the picker, and no submit/close while toggling. The existing tests retain empty and normalized filtering, no results, selection, removal, Cancel, trimmed-empty name, and composing-Enter controls.

This fixture uses React test renderer and replaces `DialogFrame` with its children. Calling the trigger handler is not a trusted browser click. `autoFocus === true` proves the requested prop is mounted, not that a browser or macOS actually moved focus.

Hosted tests-first RED was observed on PR head `e9b9763eec476671817964750b6a246d208193ac`, [run 44219665246, frontend job 134518101607](https://github.com/reason-machines/openconductor/actions/runs/44219665246/job/134518101607). Both new create/edit assertions failed at the search input's `autoFocus`: `undefined !== true`, at test line 189. All ten original emoji controls passed. The full frontend test step reported 5,754 tests: 5,752 passed, two failed, none cancelled/skipped/todo. Typecheck and colour lint passed; subsequent build/DOM steps were skipped after the test failure. The [unchanged fetched log excerpt](hosted-baseline-excerpt.txt) contains the original controls and both failures; it is an excerpt, not the complete job log.

The treatment adds only `autoFocus` to the existing Search emoji input. Re-read fresh main `735db18c9141cb409b26d142b8d0a305edaf91c8`: its SectionDialog still exactly matched the original source hash above before the fix. The test file remains byte-identical to the RED head, SHA256 `00cd8166635a996a666fe9f25a43ae5ddb47b2e8e03670f9d60135151b1da235`; the original fixture plus frozen addition is unchanged. Identical hosted GREEN is pending; this source edit is not a passing behavior claim.

Existing mandatory hosted CI runs `NODE_ENV=development node --test "src/**/*.test.ts"`, including the emoji fixture and adjacent `sectionNameInput`, `sectionCompositionEscape` and `sectionWriteError` fixtures. No workflow changes or local dependency install are made. The narrower four-file command in the source proposal is not separately executed.

## Verification limits

Local whitespace and source/fixture identity checks are source checks only. No local Node/test/build/browser/native run is admitted for this increment. No screenshot is claimed or supplied: trusted trigger → focused search → typing without section-name mutation needs a separate authorized browser phase under the real DialogFrame/keybinding graph. Packaged/native/full-app focus behavior and visual parity remain unverified. Release/package custody is shared with the existing owner; no duplicate native/package dispatch is requested by this change.
