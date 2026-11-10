# Composer paste undo boundary

Conductor Rebuild, 2026-11-10. Scope is text and structured-mention paste history in `ComposerEditor.handlePaste`. Attachment callbacks, submit and queue wiring, settings, and native clipboard paths are excluded.

## Retained reference

The already-retained decoded Conductor 0.87.6 renderer is `renderApp-D_fmY7hW.js`, SHA256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. Its installed-app provenance and previous REA observations are recorded in [the Composer reference](../../chat/composer/current/README.md#source-identity-and-evidence).

REA analysis `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367` has a partial graph and cannot supply these JavaScript source ranges. These are direct literal reads of that retained artifact, not fresh REA runtime observations. The existing limitation is recorded in [chat REA gaps](../../chat/rea-gaps.md). No new REA gap was encountered in this source pass.

Ranges below are zero-based, half-open. Character offsets address the decoded JavaScript string; byte offsets address its UTF-8 file.

- The complete `Qxo` extension occupies characters `8337293..8337562`, bytes `8382877..8383146`, SHA256 `839085ffebe1b71ac727726194e34c3655b94751dbf7610447d732316542ae0d`. It is named `pasteUndoBoundary`. Its `handlePaste` dispatches `ZIt(view.state.tr)` and returns false. Its `appendTransaction` returns `ZIt(state.tr)` when any transaction has `uiEvent === "paste"`, otherwise null.
- `ZIt` and its history keys occupy characters `8319997..8320092`, bytes `8365538..8365633`, SHA256 `f1f703dbe50f90a4f7096762b3b2cb9a6a94870b0ce063718264e8bd305f256d`. `ZIt` sets the `closeHistory` plugin key to true. The history reducer `fxo` reads this key at character `8318040` and resets previous ranges, time and composition before processing further steps.
- The actual `lHt` composer editor registers `Qxo` in its extensions list at characters `8374840..8375084`, bytes `8420429..8420673`. This connects the complete extension to the composer rather than merely finding an unused helper.

This source establishes history boundaries before and after a paste. It does not independently prove macOS key handling or a live Conductor undo sequence.

## OpenConductor source boundary

On main `fc521bdf`, `src/features/chat/ComposerEditor.tsx` handles clipboard files first. Its remaining paste path synchronizes the selection, decodes custom mention parts or normalizes plain text, then calls `editor.commands.insertContent`. It does not close undo history around that insertion. Existing file-mention insertion and range deletion already use `closeHistory` on either side.

The intended fix uses that same primitive around only the existing text/custom-content insertion. It does not replace the clipboard decoder, change attachment precedence, mutate Composer props, or add a native adapter.

## Verification status

- Passed. Retained renderer hash and the complete source controls above were checked. `git diff --check` passed after normal integration of main into the assigned branch.
- Not run. The new behavioral regression and fixed behavior. Product implementation is unchanged at this source checkpoint.
- Not run. Local Node, installs, builds, browsers, native app, provider, signed-in, or macOS clipboard checks. No local runtime admission is held.
- No new screenshot. This checkpoint is source evidence, not a visible behavior change or runtime acceptance.
