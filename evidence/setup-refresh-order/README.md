# Setup refresh ordering

Conductor Rebuild owns `SETUP-REFRESH-ORDER-1F-03`. The ledger cleared exactly the refresh-order hunk in `src/components/ScriptsPanel.tsx`, appended cases in `src/scripts/setupContext.test.ts`, and this note. This is a separate follow-up to merged #950, not a change to Run output, preview, `runCompletion.test.ts`, the scripts API, model, or backend.

## Source comparison

The test-only comparison used main `71c6bead64f4787b825f0951d38b0fe5d7db1e9d`, which contains #950. Before the correction, main was refreshed and merged at `4a4a35899c007be0c7d0597fcf8df13c9b252601`. `ScriptsPanel.tsx` is unchanged between those main commits. Its `refresh` reads Run and Setup status independently through `Promise.all`. Before committing those snapshots, it checks only whether the displayed workspace ID still matches. Two reads of the same workspace can finish in reverse order. The ID check also accepts an old A response after switching from A to B and back to A.

The actual scripts bridge sends `setup_script_status` and `run_script_status` IPC requests. The corresponding Tauri commands read the manager snapshots. An older response delayed at the external IPC boundary can therefore replace a newer completion already displayed by the component. The bounded regression below controls that boundary; it does not execute a terminal process or a native application.

## Retained Conductor evidence

The complete [Setup producer-to-renderer chain](../setup-context/README.md#retained-reference-chain) is reused without another reader or acquisition:

- Retained `index-BGEQ8YjU.js`, SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`: complete `OIt`, UTF-8 bytes `[2876440,2879696)`, SHA-256 `ae0613c36aae5a4f150ae922aa836b6a0c3d33d24019674ed3e01eab1dc1a6cf`, updates workspace-keyed completion state and captured transcript together. Export `fo` binds its store to renderer `oVe`. Export `gj` binds the workspace log selector `X8t` to `Kyr`. Export `gk` binds `PIt` to the `setup:${workspaceId}` session key.
- Retained renderer SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`: the complete [nro consumer](../terminal/strip-toolbar/reference-nro.txt) selects the workspace's current Setup state. Complete `gno`, UTF-8 `[6926664,6929046)`, selects that workspace's log buffer and terminal key. Complete `nZe`, UTF-8 `[6922812,6923921)`, subscribes to the selected session and clears the terminal before restoring persisted output when no live session exists.
- Historical REA lineage is `ev_c1be98e2e349f123aa926e487548cb2edf18b45d05a42e05bc7c215e84f7ebdc`. The previous source receipt is attachment `96fed581-a01c-4e89-a872-b114ee62ad84`, SHA-256 `02e79b86c5f1254f46597fc25d5b674d0ac4022a7de0287530598d5533207451`.

These source receipts support the authoritative workspace snapshot model. They are not native-handler or runtime proof. The reference does not supply an IPC-ordering implementation to copy; the correction must address OpenConductor's own asynchronous consumer.

## Regression checkpoint

The existing fixture loads the real `ScriptsPanel` and scripts bridge. Only external boundaries are replaced. A new fixture operation allows subsequent status reads while an earlier response remains deferred.

Two appended cases keep the same assertions:

1. Start another read of running A. Complete a newer read of completed A. Release the obsolete running response. The state must remain completed, the completed transcript must remain visible, and Rerun setup must remain available.
2. Repeat that ordering after leaving A for B and returning to A before the old response arrives.

The original four #950 test bodies and assertions remain byte-identical. Their contiguous block, from the first test declaration through the fourth test's closing newline, has SHA-256 `6ecc8c17730209a53cd16606fed4b9495e616601dd866f7740763764d2929685`. The original whole file before the fixture addition and appended tests has SHA-256 `283dfb3c11c028f33bd8df4adfda0f067f3628b41c4f928f75bb497c36985e3b`.

The first published checkpoint changes only the regression and this note. Production code remains identical to the compared main commit. Ordinary automatic hosted CI established the two intended failures before the production correction.

## Hosted RED and correction

At published head `1f6a1adc3f79aabeef2be26066392ae10a2bac83`, [frontend unit tests](https://github.com/reason-machines/openconductor/actions/runs/42924568956/job/130207619898) ran `node --test "src/**/*.test.ts"`. They passed 2,062 cases and failed exactly the two new cases. Both reached the assertion `an older response cannot restore the completed setup's running state`, with actual `running` and expected `completed`. The four original Setup cases passed. No fixture or import failure occurred.

The [typecheck and build job](https://github.com/reason-machines/openconductor/actions/runs/42924568956/job/130207619565) passed TypeScript and failed on the same two unit tests. Its build step did not run. The other 23 PR checks passed on that test-only head.

The correction assigns each shared refresh a monotonically increasing sequence before its IPC requests. It rejects a response unless its sequence is still the newest and its workspace is still displayed, before either existing snapshot setter. The sequence survives workspace changes, so an old A response also loses to a newer A response after A → B → A. The workspace guard remains intact. No request, event, action, backend, API, model, Run-output, or preview policy changes.

## Verification and limits

- Passed locally: `git diff --check`, production-source equality against fresh main before the correction, and byte-identical verification of the complete six-case regression file against the published RED checkpoint. Its SHA-256 remains `49f9e52bd5fbcbd3888e26ecbeb259fe1c6d4c5914547648c0b716e650b1a74d`; the original-four-body hash above also remains unchanged.
- Failed as intended before the correction: the two hosted component regressions described above. The four original cases passed.
- Pending: automatic hosted GREEN with all six cases and assertions unchanged. No passing behavioral result is claimed for the correction yet.
- Not run locally: Node tests, dependencies, TypeScript, build, browser, native, or application execution. No screenshot exists because browser and native execution remain outside the permitted scope.
- The existing #950 consuming-main and macOS package follow-up remains separate. This follow-up does not install or run its package.

#847/#916 and protected resource stops remain unchanged. No new REA tool call, extraction, acquisition, device contact, runtime, install, manual dispatch, or duplicate observer was started.
