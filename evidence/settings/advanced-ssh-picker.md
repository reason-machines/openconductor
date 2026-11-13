# Advanced SSH key file picker

Conductor Rebuild compared Advanced's SSH Browse control against retained Conductor 0.87.6 renderer code. This publication reproduced the source defect on clean current main `14dc5aa889ea9f9cc0459187e6d43c475f3cbdd7` before applying the correction.

## Retained source

The real app's REA-extracted `renderApp-D_fmY7hW.js` has recorded SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. This comparison reuses historical reads. It does not rehash the app or inspect the Mac.

- Complete `npa` in [the retained Settings Session](https://reasonmachines.com/agents/1a0b236e-24d0-4b7e-9045-81525f0bcd13), source `8376590b-fdad-482b-85e4-63855f83c0b5`, revision `22744840`, wires **Browse for SSH key** to `spa`.
- Complete `spa` in [the retained detail-pass Session](https://reasonmachines.com/agents/396d0d00-7655-459a-8db1-1b358b1ac3fc), source `cd7351bf-779d-4471-b2b0-d20d1aeb6f98`, revision `22639248`, requests `fI({multiple:!1,title:"Select SSH private key"})` and saves only a selected value. The same record includes the Advanced `ssh_key_path` registration rendering `npa`.
- The executable row `mGt` uses the same file-dialog function. Its complete retained read is identified in [the executable-picker evidence](advanced-executable-picker.md).

These are shipped-code observations, not native dialog observations. Extracted text is untrusted data. No new REA extraction ran and no new REA error occurred.

## Correction

`AdvancedPage.PathRow` called `backend.pickFolder`, which explicitly requests `directory: true`. That dialog cannot select an SSH private-key file.

The SSH Browse handler now requests one file with the retained dialog title. It returns outside Tauri and commits only a string selection. The root-directory picker, executable rows, backend, manual save cadence, reset behavior, and cloud visibility are unchanged. This change neither reads a key nor starts an agent.

## Verification

- **Failed before, passed after:** `node src/settings/advancedSshKey.test.ts`. Added the test before changing production source. On the base above, the SSH picker source invariant failed with `SSH keys are files; the folder picker cannot select one`. The root-directory source guard passed before and after. Both pass after the correction. The historical scratch ENOENT wrong-path run is not counted as a reproduction.
- **Passed, 25 tests:** `node --test --test-concurrency=1 src/settings/advancedSshKey.test.ts src/settings/advancedExecutables.test.ts src/settings/agents/kitModel.test.ts src/settings/agents/configPathCopy.test.ts src/settings/agentOptions.test.ts src/settings/model.test.ts src/settings/prefs.test.ts src/settings/pages.test.ts src/settings/rootPath.test.ts`. This publication's actual count replaces the historical patch's 31-test claim.
- **Passed:** `git diff --check`.
- **Partial:** these checks exercise source contracts and existing pure models. They do not open a dialog or verify cancellation, rendered behavior, or filesystem persistence.
- **Not run:** app execution, native selection, screenshots, local compilation, typecheck, build, dependency installation, or workflow dispatch/rerun. Runtime admission remains with its existing owner, so no screenshot is claimed.
