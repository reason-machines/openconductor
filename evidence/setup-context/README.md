# Setup workspace context

Conductor Rebuild owns `SETUP-CONTEXT-1F-02`. The ledger cleared exactly `src/components/ScriptsPanel.tsx`, `src/scripts/setupContext.test.ts`, and this note. The initial comparison used main `0244d800782a3eaf811aac53fedc8a536218fb2b`. Before the correction, current main `203ba7e184ae4ad06cdddea2d579faadfe715846` was fetched, compared, and merged into the working branch. The component, scripts API, model, backend Setup status lookup, and #945 regression remain unchanged between those two main commits.

## Retained reference chain

This change uses already-retained inert JavaScript from Conductor 0.87.6. No extraction, target execution, device contact, installation, or new native analysis was performed.

The renderer `renderApp-D_fmY7hW.js` has SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. Its historical REA lineage is recorded in [the strip toolbar receipt](../terminal/strip-toolbar/README.md) and [script output findings](../terminal/output/NOTES.md). The complete retained [nro function](../terminal/strip-toolbar/reference-nro.txt) selects Setup state through `oVe`, using `states.get(r.localId)` with an idle fallback. It passes that same workspace ID to `gno`.

The existing [renderer owner](https://reasonmachines.com/agents/de6c02f4-4880-4a0d-bf8f-9e3954522753) supplied the following bounded source receipts without another acquisition:

- Complete `gno`: UTF-8 bytes `[6926664,6929046)`, SHA-256 `647b58ff6d4712742e8946fdf3d8ef2bb31e578b3047a7d0f0a9384395ea7db3`. It derives the setup terminal key with `Yyr(localWorkspaceId)`, selects `Kyr.useLogBuffer(localWorkspaceId)`, and passes both to `nZe`.
- Complete `nZe`: UTF-8 bytes `[6922812,6923921)`, SHA-256 `2a41065f57534a755e056ee604d13e86310605c60594b143ad8aca1cb8a9aab5`. It reads and subscribes to the selected session ID, disposes the old subscription, and clears the terminal before writing persisted output when there is no live session.
- Complete renderer import declaration: UTF-8 bytes `[52991,66495)`, SHA-256 `711b96377098ad3838934209f1710cb85acfc256abecae07605139daf0670ed5`. The index exports `fo`, `gj`, and `gk` become renderer aliases `oVe`, `Kyr`, and `Yyr`.

The existing [index owner](https://reasonmachines.com/agents/e1e2b6b9-97cc-4ddc-ba9e-533d89eeeb46) closed those aliases against retained `index-BGEQ8YjU.js`, 3,493,297 bytes, SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`. Its 11 literal range checks and export membership checks passed. The receipt is attachment `96fed581-a01c-4e89-a872-b114ee62ad84`, SHA-256 `02e79b86c5f1254f46597fc25d5b674d0ac4022a7de0287530598d5533207451`.

- `fo` exports `Jd`, initialized by complete `OIt`. `OIt` occupies UTF-8 bytes `[2876440,2879696)`, SHA-256 `ae0613c36aae5a4f150ae922aa836b6a0c3d33d24019674ed3e01eab1dc1a6cf`. Setup start, completion, cancellation, and interruption update maps keyed by local workspace ID. Completion captures the matching terminal transcript into that workspace's log buffer.
- `gj` exports `X8t`. Its complete selector, UTF-8 bytes `[2879843,2879908)`, subscribes to `Jd` and selects `logBuffers.get(workspaceId)`.
- `gk` exports complete `PIt`, UTF-8 bytes `[2876231,2876266)`, SHA-256 `7c0493bd661a6972f9e7195c81c3908b1b25140f12cb6ac76b22bcc42cf7ee38`. It constructs the session key `setup:${workspaceId}`.
- The complete store subscription adapter uses React `useSyncExternalStore` with the store's subscription and selected snapshot. The initializer binds `Jd` to `OIt` and `PIt`.

The index's historical REA `inspect_artifact` evidence is `ev_c1be98e2e349f123aa926e487548cb2edf18b45d05a42e05bc7c215e84f7ebdc`. It identified the original Mach-O but did not enumerate child assets or run `open_binary`. These literal source receipts close the producer, workspace-keyed state, selector, and renderer chain. They do not prove native terminal behavior, filesystem writes, or a runtime parity result. The `ts`, `Ua`, `M`, and `Y` implementations remain outside this bounded proof.

## Current source mismatch

At inspected main `203ba7e1`, the backend already looks up Setup state, log, and outcome by workspace ID in `SetupManager`; the scripts bridge sends that ID to `setup_script_status`. The main version of `ScriptsPanel` loses that identity by keeping one unkeyed `SetupStatus` and one unkeyed pending action. Switching workspaces can therefore display the old transcript and status before the new read completes. The first new-workspace output event can append to the old log. A deferred shared refresh can also replace the newly displayed workspace's Setup and Run status after the switch.

The correction keeps the workspace ID beside the Setup snapshot and pending action. The view reads only its matching snapshot, with an idle fallback until its status arrives. Streamed output starts from that workspace's snapshot, not the previously displayed log. A shared refresh rejects another workspace's result before its existing `setRuns` and Setup update. Each Setup request clears only itself when it completes, and a late Setup error is displayed only in its originating workspace. The existing Run output and preview isolation from #945, `runCompletion.test.ts`, the scripts backend, and the shared model remain unchanged.

Model the Domain keeps workspace identity beside the snapshot it identifies. Fix Root Causes rejects the stale asynchronous producer instead of only hiding its resulting text.

## Regression checkpoint

The new `setupContext.test.ts` follows the existing `runCompletion.test.ts` component-test pattern. It loads the real `ScriptsPanel`, real scripts API bridge, and real model modules with React's test renderer. Only external IPC, settings, keybindings, and terminal display boundaries are replaced. Deferred IPC promises make the races deterministic without a process, browser, or provider.

The four cases assert that:

1. A workspace switch immediately hides the old Setup transcript and reports the new workspace's idle state while its snapshot is pending.
2. New-workspace setup output does not append the previous workspace's transcript.
3. A late old-workspace shared refresh cannot replace the new Setup transcript or Run status.
4. A pending start belongs to its workspace and request. Completing an old request cannot clear the new workspace's pending action.

The first published checkpoint contained only the regression and this note, with production code unchanged. Ordinary automatic hosted CI ran `node --test "src/**/*.test.ts"`. The four intended failures below were observed before the production correction was applied. The regression assertions remain unchanged afterward.

- **Intended RED confirmed at published head `67deab09f90f3607ab3cf4558d797e3fc4769740`:** ordinary automatic hosted [frontend unit tests](https://github.com/reason-machines/openconductor/actions/runs/42919479574/job/130190409766) ran `node --test "src/**/*.test.ts"`: 2,033 tests, 2,029 passed, exactly four failed. All failures are the new Setup behavioral assertions: the new workspace displayed `A transcript`; its first output became `A transcript\nB streamed output`; an obsolete read replaced `B complete` with `obsolete A response`; and A's deferred start disabled B's Run setup button. There was no fixture or import failure.
- The [typecheck + build job](https://github.com/reason-machines/openconductor/actions/runs/42919479574/job/130190409824) passed `npm run typecheck` and failed on the same four unit tests. Its build step did not run.
- Passed locally: `git diff --check` and byte-identical regression-file verification against the test-only checkpoint. SHA-256 of the unchanged `setupContext.test.ts`: `283dfb3c11c028f33bd8df4adfda0f067f3628b41c4f928f75bb497c36985e3b`.
- Not run locally: Node tests, dependency installs, TypeScript, build, browser, native, or app runtime checks. These remain prohibited by the program's current resource and native-runtime stops.
- Pending: ordinary automatic hosted GREEN on the production correction, with all four regression assertions unchanged. No manual dispatch or duplicate observer.
- No screenshot was captured. This change has no new styling, and browser or native execution is not admitted. Component output and callback assertions are not a screenshot or native acceptance.

The #847 and #916 stops remain in force. No protected data, agent credentials, provider configuration, installed application, or acquisition destination is touched.
