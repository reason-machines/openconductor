# Composer text-assistance attributes

Conductor Rebuild, 2026-11-10. This unit matches the editable element's declared HTML attributes. It does not establish native autocorrection, autofill, or OS writing-suggestion behavior.

## Retained reference

The retained decoded Conductor 0.87.6 renderer is `renderApp-D_fmY7hW.js`, SHA256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. The installed-app identity and earlier REA captures are recorded in [the Composer reference](../../chat/composer/current/README.md#source-identity-and-evidence).

REA analysis `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367` has a partial graph and does not supply these JavaScript source ranges. This pass reads small literal ranges from that already-retained renderer, not a new extraction or runtime observation. The existing limitation is recorded in [chat REA gaps](../../chat/rea-gaps.md). No new REA failure occurred. A whole-renderer read timed out under shared CPU pressure; bounded byte reads succeeded.

The ranges below are zero-based, half-open UTF-8 **byte offsets**, not decoded JavaScript character offsets or native addresses. Their SHA256 digests were checked in this pass. The full renderer identity above is the previously verified identity, not a new whole-file hash measurement.

- Complete `lHt` component. Bytes `8418728..8426168`, SHA256 `2b86481687009f77ff169d0e5f52e349ee541b80a71c205e07d691862e938215`.
- Its complete `editorProps.attributes` declaration, including the `editorProps:{attributes:` prefix. Bytes `8421834..8422012`, SHA256 `4f2733ff466836d98badb95c98e4b5aa008cf2113b239b79890f45503eb73702`.

The literal declaration is:

```javascript
editorProps: { attributes: {
  class: "composer-tiptap-editor",
  spellcheck: u ? "true" : "false",
  autocomplete: "new-password",
  autocorrect: "off",
  autocapitalize: "off",
  writingsuggestions: "false"
} }
```

`lHt` defaults its `spellCheck` prop to false. It supplies this declaration directly to the `n4o` editor creation options. The complete component closes by rendering `PAi` with that same editor as `ue`. Its later effects update content, editability, and placeholder state; they do not replace these attributes. This is a connected editor declaration, not an unused string or a separately inferred callback contract.

## Current OpenConductor boundary

On main `f41cfd703f350f7dfec89d29f5563f5fd8777665`, `src/features/chat/ComposerEditor.tsx` supplies role, accessible name, multiline state, test ID, and `spellcheck: "false"` to `editorProps.attributes`. The four explicit text-assistance attributes above are absent. The editor implementation matched this Session's branch before the regression was added.

The reserved product hunk is only that attributes object. No Composer props, attachment handling, submit, queue, mention, ModelPicker, Stop, provider, settings, workflow, dependency, helper, or native code is changed. The previous paste-history boundaries remain intact.

## Verification

- Passed. The complete retained component and attributes spans were read, and their byte-range digests were checked.
- Passed. `git diff --check` on the regression-only increment.
- Pending. The new `tests/e2e/composer-input-attributes.e2e.mjs` uses the existing public demo app, Vite preview, Chromium, and `npm run test:e2e`. It reads `getAttribute` from the real mounted editable element before typing and after typing and refocusing. No source-string matching, copied editor, synthetic handler, or new fixture infrastructure is used.
- Not run. Local Node, browser, installs, builds, native app, provider, signed-in, or OS writing-assistance checks. No local runtime admission is held.
- No screenshot. The tested contract is the editable DOM attributes. Native writing-assistance UI and its platform-specific effects are not observed.

The first hosted run must demonstrate the missing-attribute failure before any product correction. The same assertions must pass after the smallest attribute-only fix.
