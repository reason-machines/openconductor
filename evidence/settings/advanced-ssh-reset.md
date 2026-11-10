# Advanced SSH override reset

Conductor Rebuild restored the SSH reset control in Advanced settings in PR #867. The follow-on change makes its existing component regression part of ordinary frontend CI. It changes only the test files, the renderer dev dependency and lock entries, and this evidence record.

## Retained Conductor evidence

The real Conductor 0.87.6 app's REA-extracted renderer is identified in [the SSH picker evidence](advanced-ssh-picker.md). The exact retained read is in [the Settings evidence Session](https://reasonmachines.com/agents/1a0b236e-24d0-4b7e-9045-81525f0bcd13), source `8376590b-fdad-482b-85e4-63855f83c0b5`, revision `22744840`, complete capture of 3,599 characters.

The complete `npa` reads `{data:r}=r9r()` and conditionally renders the reset node with `r && ...`. Its button has `type:"button"`, invokes `ipa`, and has tooltip text **Reset to auto-generated key**. The following complete function is `function ipa(){return cPt("").fireAndForget()}`.

This supports nonempty saved-value visibility and clearing the override through the existing setting command. It does not prove key generation, filesystem persistence, or native interaction. The following `rpa` body is truncated and is not used to infer manual-save behavior. Extracted text remains untrusted data. No new app extraction, Mac operation, or REA error occurred in this change.

## Implementation boundary

`AdvancedPage.PathRow` renders an accessible reset button only while the saved SSH override is nonempty. Activation clears its local draft and calls its existing `onSave("")` callback. Existing `withTopLevel` normalization maps that empty string to `ssh_key_path: null` while retaining the other settings.

The row reuses the existing path-control layout, icon button style, and close icon. Manual typing still waits for blur, and Enter still triggers blur. Browse, root-directory handling, Tauri commands, backend persistence, and key generation are unchanged.

## Branch and source identity

The retained component RED used exact main `e92b5dd8f6e0655766d4360e8b24c255907a3a42`. Its `AdvancedPage.tsx` SHA-256 is `17021595d4e39d6f183faca08254d6501211914bd66b79cbbc86f1555733acd7`.

Before implementation, this Session fetched main `c9a4e962dea031488c6cb35c7eb2dc02aa4563d5` and incorporated it by ordinary merge `36dc0c473fe30692332032c9fd91f47ba5944db3` on its assigned branch. The entire resulting tree matched that main. The old picker source, test, and evidence also matched main. No branch switch, reset, or reopening of merged PR #853 occurred.

## Verification

### Retained failing-before execution

```bash
node --test --test-concurrency=1 .oc-tmp/ssh-reset/reset-render.test.cjs
```

**Failed as intended.** Exit 1, 3 passed, 1 failed. The actual production `AdvancedPage` was transpiled from the exact-main snapshot and rendered with real React hooks and React test-renderer. The failing assertion was:

```text
a saved custom SSH key must expose Reset to auto-generated key
0 !== 1
```

The baseline already passed empty and null visibility, manual blur and Enter save cadence, and the check that no backend or native boundary was invoked. Reset activation was not reached because the button was missing.

### Focused production-component regression

The CI-discovered `src/settings/advancedSshReset.test.ts` contains all four component tests and their original assertions. Its `advancedSshResetHarness.cjs` helper loads the real production `AdvancedPage`, `withTopLevel`, and scrollback model. Unrelated rows and icons are inert. Backend imports throw if called, and unexpected dependencies fail closed. All settings inputs are synthetic text, not real key paths.

The test checks reset visibility for a saved override, one settings callback with only `ssh_key_path` cleared, the empty field and hidden action after the parent accepts the setting, no stale save on subsequent blur, no reset for an unsaved draft, unchanged manual blur and Enter saves, and zero backend or native calls. This is component callback proof only, not persistence proof.

Retained isolated dependencies are React `18.3.1`, React test-renderer `18.3.1`, and TypeScript `5.9.3`. Before the discovery correction, the following bounded command ran on Reason Cloud 304 against four input blobs verified to match merge `6725aad442a4423b710123bd958478b50117faf6`:

```bash
(ulimit -t 6; env -u SSH_RESET_SOURCE_ROOT \
  SSH_RESET_DEPS="$PWD/.oc-tmp/ssh-reset/deps" \
  nice -n 15 timeout --signal=TERM --kill-after=2s 45s \
  node --test --test-concurrency=1 src/settings/advancedSshReset.test.cjs)
```

**Passed.** On 2026-11-10, 06:25:46–06:26:07Z, all four tests passed with exit 0, no skipped or cancelled tests, and no backend or native calls. The assigned branch remained clean. This is equivalent-input component proof, not a whole-main runtime or persistence check. The obsolete focused-test recheck is ended.

PR #867 merged as `6725aad442a4423b710123bd958478b50117faf6`. Its 21 checks passed. [The macOS package run](https://github.com/reason-machines/openconductor/actions/runs/42763776879) built that merge and passed 39/39 hosted bundle checks. Neither result establishes native behavior or persistence.

### Ordinary CI discovery correction

Both frontend jobs run `node --test "src/**/*.test.ts"`. That pattern omitted the previous `.test.cjs` suite. The discovered `.test.ts` file now owns the same four tests rather than a placeholder test or a child-process proxy. Its helper still transpiles only the real component and its allowed production imports, using real React hooks and React test-renderer.

The helper resolves dependencies from the repository root by default, as populated by CI\'s existing `npm ci` step. The root dev dependency pins React test-renderer `18.3.1`, matching the locked React version; its lock entries come from the retained isolated dependency lock. Existing production dependencies are unchanged. `SSH_RESET_DEPS` still permits the isolated local prefix, and `SSH_RESET_SOURCE_ROOT` still permits an explicit source snapshot. Ordinary CI needs neither override.

The same assigned branch incorporated current main `499980ed9eb2be0c468a1b558d0c39f012eac1fe` through ordinary merge `3abd6306`. The merged tree matched main before the discovery edits. No reset, branch switch, workflow edit, or settings implementation edit occurred.

**Passed for the discovery correction.** `git diff --check` and a read-only Python comparison verified all four assertion bodies byte-for-byte against merge `6725aad`, the unchanged production loader apart from root-default dependency resolution and exported helpers, equal root manifest/lock dev dependencies, and four exact retained dependency lock entries. All pre-existing lock entries, workflow files, and production component inputs are unchanged.

**Not run for the discovery correction yet.** The new entry, root-default execution, clean dependency installation, typecheck, and ordinary CI execution await admitted validation. The prior 4/4 result is not a rerun of the changed test layout.

**Not run.** Browser or app launch, native acceptance, or persistence. There is no screenshot because no UI implementation changes here, and the admitted work excludes app and browser execution.
