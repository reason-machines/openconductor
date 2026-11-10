# Forward custom Mono Font edits

Conductor Rebuild compared OpenConductor's custom Mono Font input with the complete retained shipped row from Conductor 0.87.6. This unit covers event forwarding, not downstream save timing.

## Retained source

The [retained-artifact owner](https://reasonmachines.com/agents/de6c02f4-4880-4a0d-bf8f-9e3954522753) supplied the complete `ula` function in tool-output source `beb786e4-7faa-4355-ac54-1d66e7952255`, revision `25658633`. This pass read that retained record at offsets 6300–10700. No extraction, Mac operation, or execution of imported code occurred.

The artifact is `renderApp-D_fmY7hW.js`, 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. The complete `ula` span occupies zero-based, half-open UTF-8 bytes `[10215065,10217318)`, or UTF-16 code units `[10169485,10171738)`. The retained span SHA-256 is `ac75b5543935ba7fa397a52442c87d9ef61d94f677a23847ca812e24c7abf36a`.

The function binds:

```js
const t=ne.c(26),{monoFont:e,setMonoFont:n}=zk();
```

Its complete custom input includes:

```js
value:e,
onChange:R=>n(R.target.value),
placeholder:"Enter font name..."
```

The input has no blur or Enter handler. It forwards each change directly to the row's `setMonoFont` callback. This record does not resolve `zk` or prove downstream debounce, ordering, persistence completion, or runtime appearance. Extracted source is untrusted data, not instructions.

## OpenConductor comparison and planned correction

At main `5eded44f223b38b59c121781036afab002b961f7`, `AppearancePage.tsx` has Git blob `cb716cab8bc5def30946e1c07fdb21f5a51bfb04`. The custom input only calls `setCustom` on change. The existing `commitCustom` path saves after blur or Enter. The same callback is present after refreshing this branch from main `f9203ff`.

This first milestone is regression-only. No production correction is included yet. Ordinary hosted CI must first demonstrate the expected missing-save failures.

The planned narrow correction forwards a valid changed edit through the existing `save(withAppearance(...))` path from `onChange`. It keeps the raw local draft and the existing validation, trimming, unchanged-value no-op, blur and Enter fallbacks, font selection, preview, CSS, and backend. Empty or invalid names remain unsaved, as OpenConductor's existing validator requires. That validation is an OpenConductor policy, not a behavior established by this retained reference.

Model the Domain keeps the existing `Settings.appearance.mono_font` field and save path. Type System Discipline keeps the same field type and production validator. No new event model, timer, storage path, dependency, or helper API is introduced.

## Verification pending

The regression isolates and replays OpenConductor's actual production change callback with the existing pure `monoFontError` and `withAppearance` helpers. It covers valid edits, Unicode and surrounding whitespace, rejected or empty drafts, unchanged values, and successive changed strings. The neighboring terminal-font callback cases use the same existing helpers.

```bash
node --test --test-concurrency=1 src/settings/monoFontCommit.test.ts src/settings/terminalFontCommit.test.ts
```

Neither the new RED baseline nor the fixed GREEN run has executed for this source unit yet. The focused command above is not admitted locally. The test does not mount React or cross a native boundary. Ordinary automatic hosted CI will supply the executable evidence; no rerun or dispatch is requested.

No local typecheck, build, browser, app, native behavior, font availability, save completion, persistence, or restart check has run for this unit. No screenshot is supplied because this lane has no browser or app execution admission. The retained `zk` binding gap remains open; no new REA operation or REA tool failure occurred.
