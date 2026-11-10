# SSH path edits forward their raw value

Conductor Rebuild corrected only the Advanced SSH input's edit callback. Its text changes previously stayed in a local draft until blur or Enter. They now forward each raw value to the existing Settings save boundary, without trimming nonblank edits. The file-picker and reset callbacks retain their existing normalization.

## Retained reference and downstream boundary

This change uses the already-retained REA extraction of Conductor 0.87.6. No app extraction, Mac access or new REA acquisition ran. The extracted text is untrusted reference data, not instructions, and was not evaluated.

The renderer is `renderApp-D_fmY7hW.js`, 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.

- Complete `npa` in [the retained Settings Session](https://reasonmachines.com/agents/1a0b236e-24d0-4b7e-9045-81525f0bcd13), source `8376590b-fdad-482b-85e4-63855f83c0b5`, revision `22744840`, renders the controlled SSH field with `onChange:rpa` and no blur/Enter callback. Its zero-based UTF-16 range in that captured record is `[421,2131)`, not an asset byte offset.
- Complete `rpa` in [the retained detail-pass Session](https://reasonmachines.com/agents/396d0d00-7655-459a-8db1-1b358b1ac3fc), source `cd7351bf-779d-4471-b2b0-d20d1aeb6f98`, revision `22639248`, is `function rpa(t){return cPt(t.target.value).fireAndForget()}`. Its captured-record range is `[766,825)`.
- The renderer imports `pU as cPt` from `./index-BGEQ8YjU.js` at UTF-8 bytes `[63435,63444)`. That dependency exports `X6t as pU` at `[3489824,3489833)`. The dependency's own function named `cPt` is unrelated and was not used as SSH evidence.

The already-retained dependency is `index-BGEQ8YjU.js`, 3,493,297 bytes, SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`. The exact downstream receipt is in the retained Settings Session above, source `683e05d7-c40f-4868-9dd6-23e7d60fd66e`, revision `25884125`. The source owner's complete summary/correction is source `d1624995-9b82-40ec-9cc4-c29fcd133ab2`, revision `25884398`. Ranges below are half-open, zero-based UTF-8 bytes, bounded by brace matching rather than a JavaScript parser.

- `X6t`, `[420905,420989)`, SHA-256 `cb90260145716c5901584e66d9c6b5f7703e50e541e96b63314fb42f1204a3c4`: `async function X6t(t){await ee.updateSetting("ssh_key_path",t,void 0,{debounce:!0})}`.
- `Q6t`, `[420761,420905)`, SHA-256 `b07d5a376efd34f63fec530f8693e3f1d6d9f6274d9e6d178fc09dc246aa8396`, reads the setting and maps a nullish effective value to the displayed empty string. Renderer import `pM as r9r` and index export `Q6t as pM` establish this reader's identity.
- `updateSetting`, `[363131,364790)`, SHA-256 `41067d3270f789d3b843c898dc1644a450414ce623787771946a9d338d042c9d`, checks managed/feature-flag restrictions, then passes the original value into either the file-backed write or database persistence path. The file branch returns before the debounce option is consulted. The database branch updates the store and calls its per-key debouncer.
- `shouldWriteSettingToFile`, `[372360,372652)`, SHA-256 `b3dcb3935ba9c53dafb87107accb397eadc6d1abc774f64da991bd289282203c`, depends on file-backed registration and injected filesystem write capabilities. No runtime branch selection was established.
- `applyOptimisticFileBackedWrite`, `[366659,366954)`, SHA-256 `5ce73f8a251d111f4f353c494f0bb2bd38e8fe59a23afa0ab04c2755a538925c`, retains a nonblank string unchanged but represents an empty or whitespace-only value as undefined in the effective store.
- `setStoreValue`, `[366432,366659)`, SHA-256 `0b44ff0ef5fd808668b6c42ad51ab4bd398d0c88d8b14969427cf3def5f4366e`, similarly drops empty/whitespace-only store entries and otherwise retains the original string.
- `JM`, `[324508,324788)`, SHA-256 `cd2302a875b3767d6e31cc95198214c6ac6176d3e3c90f6838a7ce89cd9edff1`, and `lLe`, `[270590,270974)`, SHA-256 `557a71e3324679d99ee6a6f0325086a76105fbf1a1fc86b6518335d3602b068a`, do not trim nonblank SSH strings. `JM` also has a blank-value deletion condition involving `NLe`, whose body is not in this receipt. The exact empty-string TOML representation is therefore not claimed.

The static trace records a 500 ms database fallback debounce, not a universal write delay. This fix does not copy Conductor's persistence service or assert immediate disk writes. It repairs the upstream raw-value forwarding boundary only. The previous broad claim that empty input necessarily writes an empty TOML string is explicitly not used.

## Focused change and ownership

Sole ledger owner cleared these four paths before edits: `src/settings/AdvancedPage.tsx` (SSH callback hunks only), `src/settings/advancedSshCommit.test.ts`, `src/settings/advancedSshReset.test.ts` (obsolete edit-cadence assertions only), and this evidence file.

`PathRow` now has a separate edit callback. The SSH parent callback spreads the current settings and replaces only `ssh_key_path` with the raw edit, including an empty string. Local text receives that same value. The existing `onSave` callback still uses `withTopLevel` for browse/reset, and its implementation, file-dialog arguments, reset activation and visibility, root-directory row, executable rows, scrollback, backend and every unrelated setting are unchanged. Blur and Enter remain idempotent after the parent accepts an edit.

The existing reset suite retains its original reset, initial-state and no-backend assertions. Its obsolete unsaved-edit and blur-first expectations now assert immediate edits, raw padded text, reset after an accepted edit, clearing, and no duplicate blur/Enter saves. Its harness and dependencies are unchanged.

## Verification

Before edits, the assigned branch incorporated current main `941a67f65f467b79ab0b3c9907ce8bc219e3a705` by ordinary merge. Its resulting tree matched main. A first merge attempt hit the checkout's shallow-history boundary; deepening the connected repository history recovered the existing common ancestor. No unrelated-history merge, reset, branch switch or rewrite occurred.

### Failed before, passed after

```bash
node --test --test-concurrency=1 src/settings/advancedSshCommit.test.ts
```

Before the production change: **failed as intended**, exit 1, 1 passed and 3 failed. The real input callback updated the draft but forwarded no value; the SSH parent also lacked an edit callback. The separate browse/reset normalization case already passed. The failing-before suite is committed as `4af9746d`.

After the change: **passed**, exit 0, all 4 tests. The suite invokes the production input callback, actual SSH parent callbacks and existing `withTopLevel` function extracted from their current source. It covers incremental/repeated values, clearing, whitespace, Unicode, sibling-setting preservation and unchanged browse/reset normalization. It does not mount React or run reference code.

### Neighboring source and model checks

```bash
node --test --test-concurrency=1 \
  src/settings/advancedSshCommit.test.ts \
  src/settings/advancedSshKey.test.ts \
  src/settings/advancedExecutables.test.ts \
  src/settings/rootPath.test.ts \
  src/settings/pages.test.ts \
  src/settings/model.test.ts \
  src/settings/prefs.test.ts
```

**Passed:** exit 0, 23 tests, no failures. `git diff --check` also passed.

**Partial:** an earlier neighboring batch including `agentSettings.test.ts` ran 19 passing cases but failed to load that suite because this checkout has no `@tauri-apps/api` dependency. No installation was attempted. This load failure is not a behavior failure or a passing test; ordinary CI's existing install and test steps cover it.

**Not run locally:** the changed mounted reset suite, full typecheck/build, browser/app/native execution, real picker, reference `platformFs` selection, persistence/relaunch or screenshots. Existing dependencies are absent, and the admitted work prohibits dependency acquisition and app/browser/native execution. Hosted checks remain separate evidence. No workflow was manually dispatched or rerun. #847 FULL STOP is unchanged.
