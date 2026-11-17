# Create composer configured newline

Conductor Rebuild · `COMPOSER-CREATE-NEWLINE-135` · default main checked: `1d8c37ab634e4eca9f86d54c138dc73fb0ee3fb5`.

## Defect and bounded fix

Create read the configured backlog and submit bindings, but not `chat.newLine`. A custom Ctrl+Shift+Enter newline therefore passed through the actual shared editor callback without invoking its newline handle. The installed TipTap HardBreak fallback covers Shift+Enter and Mod+Enter, not this custom chord. Ordinary chat already has the configured-newline dispatch.

The only product change is in `CreateWorkspaceComposer.tsx`: read `effectiveShortcuts("chat.newLine", overrides)` and, after the existing backlog/submit branches, prevent the event default and invoke the existing `composerInputRef.current?.newline()`. That handle calls `editor.commands.setHardBreak()` in `ComposerEditor.tsx`. Preventing default makes the shared editor return handled rather than also applying a fallback. No new API/helper, propagation policy, dialog change, provider path or existing fixture edit.

## Retained reference contract

This is retained REA-derived, inert compiled source from Conductor 0.87.6, not new target execution. Renderer lineage: `renderApp-D_fmY7hW.js`, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. The complete original assets were not reacquired or rehashed in this pass. The previously recorded REA semantic-worker heap failure and source/cleanup provenance remain in the linked packets.

UTF-8 half-open ranges:

- [Complete Create caller `oya` and composer `Hji`](../../../dialogs/workspace-launch-close/retained-source.json): `oya` `[11035422,11048735)` omits `layout`; `Hji` `[9770840,9779927)` defaults to boxed. Its `lHt` call therefore receives `cHt`, not the document-only `q5o` capability.
- [Configured capability adapter and complete `lHt`](../modified-suggestion-keys/retained-source.json): adapter `[8426745,8428012)` maps `newLine` to `chat.newLine` through `$Ii → Qh`; `lHt` `[8418728,8426168)` calls `cqn`, then dispatches `EIt(state, dispatch)` when `shouldInsertNewline` is true.
- [Complete `cqn`](../ime-send/source/packet.json), `[8416974,8417459)`, SHA-256 `00e837bd6da66311537a60f81b172a79de73c1e7e0130618936be2cdc8dd6725`: configured opposite-submit → submit → newline precedence. Existing composition/reserved-key and active-suggestion handling precede dispatch.
- [Configured matcher closure](../ime-send/source/matcher-closure.json): renderer `ca as Qh` `[54795,54803)` joins index `TQt as ca` `[3481691,3481700)`; effective-binding lookup `nh` `[3393417,3393608)` and matcher `TQt` `[3394706,3394765)` close configured overrides rather than only defaults.

All 29 retained embedded-span self-hashes in these bounded packets passed; exact hashes, ranges and packet locators are in `qualification.json`. These checks establish source consistency, not independent full-asset custody. **The complete `EIt` implementation/import closure is absent: reference document mutation, browser delivery and native outcome remain unverified.** No vendor source was evaluated.

## Frozen regression and mounted route

`src/components/createWorkspaceNewlineShortcut.test.ts` mounts the actual Create dialog or page composer and actual shared `ComposerEditor`. It enters the actual `editorProps.handleKeyDown` callback and runs the real override resolver and shortcut matcher. TipTap's DOM engine is an inert boundary recording the final `setHardBreak` command; React lifecycle, local editor handler, callback plumbing and imperative handle are real. This is not a browser default-action or document-mutation test.

Final paired fixture SHA-256: `e6039e73bf6ac3990af0a37519f18f2cf35a88088add9f14bcb6fb236b494223`.

- **Failed as intended before:** `CREATE_NEWLINE_REF=1d8c37ab634e4eca9f86d54c138dc73fb0ee3fb5 node --test src/components/createWorkspaceNewlineShortcut.test.ts` — 10 pass / 4 dispatch failures, zero skip/cancel. Two failures are the material custom chord, in page and dialog. Two default Shift+Enter cases qualify explicit dispatch through the same configured path; the old default could still use TipTap fallback, so these do not claim broken visible default editing.
- **Passed after:** same bytes, `node --test src/components/createWorkspaceNewlineShortcut.test.ts` — 14/14.
- Ten controls include both submit collisions, backlog collision, ordinary Enter, synthetic/native-editor composition rejection, keyCode 229, unrelated/extra-modifier chords and no unwanted launch/close/newline.
- Historical callback-only probe is archived byte-identically, SHA-256 `f67f52f2d7b171b87ede12fe44961b39f4380628505f53679b901fb1764f37a8`: 8 pass / 2 intended failures before; 10/10 after. Its editor handle was a stub, unlike the new mounted shared-editor route.
- An initial test-only `Map` inference error was corrected with one explicit generic annotation. Runtime bodies/assertions were unchanged. Initial fixture/hash and build error are archived; the final fixture was replayed against baseline and candidate after that type-only refreeze.

Raw compressed outputs and historical probes are retained in this directory. No older fixture was changed; 43 adjacent fixture hashes are preserved in `qualification.json`.

## Verification and limits

**Passed on Reason Cloud:** mounted 14/14, unchanged historical callback 10/10; `node --test src/components/createWorkspace*.test.ts src/features/chat/composer*.test.ts src/keybindings/*.test.ts` — 490/490; `npm run build` — branding, full TypeScript and Vite, existing chunk-size warning only. Whitespace and source/fixture scope checks passed.

**Fresh main integration:** default main `51e6b1be397ebd294a11f5c827a68abbb7f57c3f` includes the actual #1416 merge. Relevant Create/dialog/editor/shortcut source is byte-identical to the qualified baseline. After merging main and applying the isolated increment, the unchanged mounted fixture again fails as intended against that main (10 pass / 4 fail), then passes 14/14 on the candidate. Expanded integration command `node --test src/components/createWorkspace*.test.ts src/features/chat/composer*.test.ts src/features/chat/modelPicker*.test.ts src/keybindings/*.test.ts` passes 653/653, and `npm run build` passes. `integration/` retains this separate replay; historical fixtures/logs above are unchanged. The successor targets main, not either earlier PR branch.

**Not run:** full-repository suite, browser/WebKit/IME/default-action delivery, native app or installed identity, provider execution, package production and successor containment. No screenshot because app/browser/native runtime acquisition is excluded from this lane. Existing package `44070332569` at `eef01e9b` excludes this successor. Existing serialized release owners retain package/native acceptance; no dispatch or watcher was created.

[Composer source audit](https://reasonmachines.com/agents/13576d11-76fb-4842-aa9b-c398f9ca26f3?page=0c58efb0-2de0-4ad2-aa79-67115c65d420).
