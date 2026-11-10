# Section emoji search

Conductor Rebuild, 2026-11-10. This increment adds search to the existing 20 section emoji choices. It does not claim full picker parity.

## Retained evidence

Existing artifact owner 13576d11 supplied the read-only packet in message `37d0623b-77f6-4494-983f-a1b2d5f6da4d`. No new acquisition or reference execution was performed.

- Conductor 0.87.6 decoded renderer `renderApp-D_fmY7hW.js`: SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`, 11,600,457 bytes.
- Matching index `index-BGEQ8YjU.js`: SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.
- `Tya`, UTF-8 half-open bytes `[11054936,11056145)`, SHA-256 `27ab9fe6fc9eafa2055b7bd44b61365181da1af8fba0b4740b83e6dab28c49ac`, renders local `Aya`.
- `Aya`, `[11056145,11058891)`, SHA-256 `3217043d3c0b71c509cdd3c786d814a7f6045d159b05c1f0c1980535a42eddfa`, renders local `uUi`. Its selection callback changes emoji and closes the picker. Its conditional clear callback removes the draft emoji and closes the picker.
- `uUi`, `[10839876,10842357)`, SHA-256 `e66d5db5b7448f8477bf5174a1d826cbb4512e6d2f9decd4ced62b4cefed3eb3`, explicitly renders the Search emoji input and No emoji found state. It passes `uba` as the filter callback.
- `uba`, `[10839756,10839845)`, SHA-256 `9d7cb6763a105bb6e12b782ebdec14678db2ea87a6bf082e48736ee86734772d`, trims and lowercases the query, then accepts an empty query or a substring match on search text.
- `lba`, `[10839416,10839756)`, SHA-256 `a72c620092491936d77afa7bdafa8179cda2f18a1d3a416b2172ec313510adf5`, builds lowercased search text from labels and tags.
- `fba`, `[10842357,10843563)`, SHA-256 `d1ab54393a64a3413d0b1dc4e9a53d32a836c0e9711e5270956aa0629cc4f741`, connects item clicks to the supplied emoji selection callback.

The source binds its full catalog to `/assets/compact-BngpUg68.json`, 571,441 bytes, SHA-256 `1c7cf539328563743c2b2adff7117ccff0ae6852d591366f4363f50503d5e398`. This is not the AppleDouble member. The catalog is not copied or acquired by this change.

## Current-main discrepancy and scope

At `3f6435a2bacf5c6fe0507b59eee2d898575947e0`, `SectionDialog.tsx` offers 20 fixed glyphs with no search input or empty-search state. The complete app component bodies establish that narrow discrepancy independently of the unclosed generic combobox internals.

The exact reserved scope is `SectionDialog.tsx` search and empty-state rendering, adjacent `sectionEmoji.ts` and `sectionEmoji.test.ts`, and this evidence file. Existing selection, clear, submit, cancel, name validation, and composing-Enter callbacks are preserved. Labels and keywords are authored for the existing subset. No shared dialog, CSS, onboarding, native, resource, or dirty-comment-cancel path is changed.

## Regression and verification

The first checkpoint contains only the actual-component regression fixture and this evidence file, with production unchanged. The fixture compiles the real TSX and mounts it with React test renderer. Only the outer Modal boundary is replaced by its children; unknown imports fail. It does not start a browser, server, native app, or backend.

Expected RED: the seven search-dependent cases fail because the real component has no Search emoji input. Three preserved controls cover create Cancel, edit Cancel, and the primary name and composing-Enter behavior.

Pending: hosted RED observation, minimal fix, unchanged regression GREEN, exact-head complete CI, and consuming-main checks. Local dependencies are absent; no installation is authorized, so local mounted component, typecheck, and build checks are not run.

## Open parity boundaries

Full catalog content, generic `hCi` and `Gso` filter and keyboard semantics, popup dismissal, focus containment and restoration, Unicode icon validation, schema internals, native behavior, and visual matching remain unverified. The source packet does not close them. No screenshot is produced because browser and native runtime admission remain stopped under #847. #916 and other owners' exclusions are unchanged.
