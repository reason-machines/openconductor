# Advanced SSH override reset

Conductor Rebuild adds the missing SSH reset control in Advanced settings. This change is limited to the SSH row, its focused component test, and this evidence record.

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

The committed `src/settings/advancedSshReset.test.cjs` loads the real production `AdvancedPage`, `withTopLevel`, and scrollback model. Unrelated rows and icons are inert. Backend imports throw if called, and unexpected dependencies fail closed. All settings inputs are synthetic text, not real key paths.

The test checks reset visibility for a saved override, one settings callback with only `ssh_key_path` cleared, the empty field and hidden action after the parent accepts the setting, no stale save on subsequent blur, no reset for an unsaved draft, unchanged manual blur and Enter saves, and zero backend or native calls. This is component callback proof only, not persistence proof.

Retained isolated dependencies are React `18.3.1`, React test-renderer `18.3.1`, and TypeScript `5.9.3`. The repository dependency manifests and lockfile are unchanged. To use the retained dependency prefix against the current production source, the prepared GREEN command is:

```bash
SSH_RESET_DEPS="$PWD/.oc-tmp/ssh-reset/deps" \
  node --test --test-concurrency=1 src/settings/advancedSshReset.test.cjs
```

**Passed.** `git diff --check`. The prior SSH picker test and evidence still match incorporated main, and the pending source change is limited to the three leased files.

**Not run after implementation.** The shared-computer resource gate deferred this execution. No GREEN result is claimed. The optional `SSH_RESET_SOURCE_ROOT` points the same test at a retained exact-main source snapshot for a baseline run.

**Not run.** Full unit suites, typecheck, build, browser or app launch, native acceptance, persistence, or automatic package validation for this reset change. There is no screenshot because this task's source-only admission excludes app and browser execution. PR #853's earlier containing-package success does not verify this follow-on change.
