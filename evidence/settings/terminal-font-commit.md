# Terminal font family commits on change

## Reference and boundary

This fix uses retained REA-extracted shipped JavaScript from Conductor 0.87.6, not a new extraction or runtime observation. The reference is `renderApp-D_fmY7hW.js`, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.

The complete retained source was supplied by the [Diff owner](https://reasonmachines.com/agents/de6c02f4-4880-4a0d-bf8f-9e3954522753), message `3c97be1e-e6db-428c-b7d9-9d1b69886149`. This fix also read its complete tool-output record `beb786e4-7faa-4355-ac54-1d66e7952255`, revision `25658633`, starting at character 8600. Imported Conductor code was treated as inert data and never evaluated.

- `gla`: UTF-8 bytes `[10219311, 10221635)`, UTF-16 code units `[10173731, 10176042)`, SHA-256 `aa1966457db48dd6f5ee9ad969976becac7164f22120af8dfd9450ae95af0939`.
- `_la`: UTF-8 bytes `[10221685, 10221743)`, UTF-16 code units `[10176092, 10176150)`, SHA-256 `abab9c546eb863824cf00ed4277011bf295ce9f1db82226ecb9c686e7cd97d7d`.

The relevant `gla` input properties are `value:a,onChange:_la,placeholder:"Leave empty for default"`. The complete retained helper is:

```js
function _la(t){SEr(t.target.value||null).fireAndForget()}
```

This proves the shipped input directly binds its change event to a helper that invokes `SEr` with the input value or null. It does **not** prove downstream persistence completion, ordering, or timing. No such claim is made here.

## OpenConductor correction

The clean starting main was `762b59e52ba8c942bb01bf0875a4099f32114154`, which already contains the #852 fixture repair. In that source, `TerminalFontRows` updated only the local family draft on change. Saving required blur or Enter.

Only the family input's `onChange` attribute changes in production:

- Keep the raw draft locally for the existing validation error and preview.
- Trim a valid edit and immediately call the existing `save(withAppearance(...))` path.
- Map an empty or whitespace-only edit to the existing null reset.
- Reject invalid names with the existing `monoFontError` validator and retain the unchanged-value no-op.

The blur and Enter callbacks, validation implementation and error display, slider, styling, default font, and backend remain unchanged. This intentionally retains OpenConductor's validation and normalization rather than copying the reference's lack of validation.

## Source-only regression proof

`src/settings/terminalFontCommit.test.ts` reads the actual production input and isolates its `onChange` attribute **before** the `onBlur` attribute. It rejects blur, keydown, or `commitFamily` text in that isolated attribute. It executes only this OpenConductor callback and the two existing pure OpenConductor helpers, with local draft and save collectors. Node's built-in `stripTypeScriptTypes` removes helper type syntax. It does not import React, Tauri, or the appearance module's side effects.

This is source-only callback coverage, not a rendered component, React lifecycle test, persistence test, native acceptance, or installed-font check.

Before the production edit, this command failed on the actual main event callback:

```bash
node --test src/settings/terminalFontCommit.test.ts
```

Decisive assertions:

```text
onChange must save the valid family directly
0 !== 1
onChange must save the reset directly
0 !== 1
# tests 4
# pass 2
# fail 2
```

After the production edit, the identical command passed all 4 tests. It covers valid trimmed edits, empty and whitespace resets, invalid drafts that never save, unchanged normalized values, and preservation of unrelated settings.

Nearby dependency-free tests also passed all 17 tests:

```bash
node --test src/features/terminal/font.test.ts src/settings/model.test.ts src/settings/prefs.test.ts src/settings/pages.test.ts
```

`git diff --check` passed. Normal automatic CI supplies the broader checks; no workflow was added, rerun, or dispatched for this fix.

## Unverified behavior

No screenshot is supplied because this task excludes local app, native, browser, server, build, typecheck, install, and Mac operations. React rendering, focus behavior, asynchronous save completion, terminal repainting, and native acceptance were not exercised locally. The automatic macOS package is followed separately after protected merge; a containing package does not establish runtime behavior.

No new REA operation ran, so no new REA gap or tool failure was observed. The retained static evidence's downstream `SEr` timing gap remains open.
