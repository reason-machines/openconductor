# Custom Mono Font selection

Conductor Rebuild, 2026-11-10. This correction matches a retained shipped selection callback, not rendered or persisted behavior.

## Retained reference

Conductor 0.87.6's REA-extracted `renderApp-D_fmY7hW.js` has 11,600,457 bytes and SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. The complete `ula` row is retained in [the source owner's Session](https://reasonmachines.com/agents/de6c02f4-4880-4a0d-bf8f-9e3954522753), tool-output source `beb786e4-7faa-4355-ac54-1d66e7952255`, revision `25658633`. This pass read that record's character range `[6300,13000)`.

The row occupies zero-based, half-open UTF-8 bytes `[10215065,10217318)`. Its SHA-256 is `ac75b5543935ba7fa397a52442c87d9ef61d94f677a23847ca812e24c7abf36a`. It binds `{monoFont:e,setMonoFont:n}=zk()` and passes this callback to the font selector:

```js
R=>{n(R==="custom"?"Menlo":R)}
```

The same row selects the custom option when the current font is not in `wZn`, and binds the custom input's value to `e`. Selecting Custom therefore forwards `Menlo`, not an empty draft or an earlier custom value. This is a static callback observation. The retained record does not resolve `zk`, prove persistence completion, or establish runtime appearance. Imported Conductor code was treated as inert data and never evaluated. No new REA operation or tool failure occurred.

## Correction

Fetched main `92c5f4304f133ee971be2a7f11283086d9250078` retains a different Custom branch in `AppearancePage.tsx`. It changes only the local selection when the draft is empty or invalid, and saves the previous draft when it is valid.

The corrected branch sets the local draft to `Menlo` and calls the existing `save(withAppearance(settings, "mono_font", "Menlo"))` path. Built-in choices, input change handling, validation, trimming, blur and Enter fallbacks, other settings, CSS, workspace Markdown, and global appearance application are unchanged. The obsolete comment describing an unsaved Custom selection is removed.

## Verification

All checks below ran on the shared Reason cloud computer without installing dependencies or launching an app.

- Before the production edit, `node --test --test-concurrency=1 src/settings/monoFontCommit.test.ts` failed the new Custom selection case with `'' !== 'Menlo'`. Five neighboring cases passed. The failing regression was committed separately before the correction.
- After the correction, the same regression assertions passed in the focused and neighboring command below. All 27 cases passed.
- `git diff --check` passed.

```bash
node --test --test-concurrency=1 src/settings/monoFontCommit.test.ts src/settings/terminalFontCommit.test.ts src/settings/tuftePreview.test.ts src/features/files/tufteTypography.test.ts src/settings/model.test.ts src/settings/prefs.test.ts
```

The regression isolates OpenConductor's actual `chooseFont` callback and its existing pure helpers. It checks Custom selection from both default and named built-in fonts with empty, old, and invalid retained drafts. It also checks unchanged built-in mappings and preservation of unrelated settings. Existing input-change tests remain unchanged. Type System Discipline keeps the existing `Settings` field and save interface instead of adding another state model. Prove It Works limits the result to the actual callback exercised.

This is source-only coverage, not a mounted React lifecycle, browser selection, computed font, persistence, or restart test. Installed-dependency typecheck/build and complete frontend coverage are left to ordinary automatic hosted CI. No local install, build, server, browser, native app, or screenshot ran. Native admission remains closed and #847 FULL STOP is unchanged. #893's separate packaging follow-through does not establish this change's behavior.
