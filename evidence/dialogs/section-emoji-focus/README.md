# Section emoji search autofocus

Conductor Rebuild, 2026-11-18. Scope: request autofocus when the existing section emoji search input mounts, in create and edit. No catalog, popup architecture, filtering, keybinding, submit, provider or native changes.

## Reference and current source

Retained historical real-app REA lineage: `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. Decoded Conductor renderer `renderApp-D_fmY7hW.js`: 11,600,457 bytes, SHA256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. This increment reads retained source; it does not acquire or execute the reference app again. The packet's exact byte ranges and hashes are in [source.json](source.json), with unchanged excerpts in [reference](reference).

The mounted path is `kya → Tya → Aya → uUi → bCi → Es("input")`. `Aya` supplies the emoji trigger/open state and mounts `uUi`; `uUi` explicitly passes `autoFocus: true` on its Search emoji input. `bCi` forwards that property through its rest/validation props to the input prop assembly. Initial section-name autofocus is separate and already exists.

Fresh main `5100f02abdc1129050d5f020f8de552680fc2994` lacks `autoFocus` on `SectionDialog.tsx`'s Search emoji input (SHA256 `329c511cbd62d38291a47e1881445aad724d8322738600fddfe2c8b40c9f4313`). The existing test fixture at that main has SHA256 `a666cda4ee1a1bda0561e43d907be52267deebb1c100ad44425733043d4df599`.

## Frozen regression and controls

Append exactly the two prequalified create/edit checks to `src/components/sectionEmoji.test.ts`; preserve every byte of the original fixture and its ten tests. The added checks inspect the real mounted component's search input prop. They also cover absent search before opening, initial name autofocus, closing/reopening the picker, and no submit/close while toggling. The existing tests retain empty and normalized filtering, no results, selection, removal, Cancel, trimmed-empty name, and composing-Enter controls.

This fixture uses React test renderer and replaces `DialogFrame` with its children. Calling the trigger handler is not a trusted browser click. `autoFocus === true` proves the requested prop is mounted, not that a browser or macOS actually moved focus.

Hosted tests-first RED is pending. Production is unchanged in the initial checkpoint. The predicted signature is exactly two new failures at `undefined !== true`; this is not yet an observed result. The approved treatment is one `autoFocus` prop, with the identical test bytes retained for GREEN.

Existing mandatory hosted CI runs `NODE_ENV=development node --test "src/**/*.test.ts"`, including the emoji fixture and adjacent `sectionNameInput`, `sectionCompositionEscape` and `sectionWriteError` fixtures. No workflow changes or local dependency install are made. The narrower four-file command in the source proposal is not separately executed.

## Verification limits

Local whitespace and source/fixture identity checks are source checks only. No local Node/test/build/browser/native run is admitted for this increment. No screenshot is claimed or supplied: trusted trigger → focused search → typing without section-name mutation needs a separate authorized browser phase under the real DialogFrame/keybinding graph. Packaged/native/full-app focus behavior and visual parity remain unverified. Release/package custody is shared with the existing owner; no duplicate native/package dispatch is requested by this change.
