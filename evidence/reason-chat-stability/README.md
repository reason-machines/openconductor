# Reason chat stability

Owner: Conductor Rebuild, Session `acc3b5c5-8a01-407e-b474-42e914e3cf90`.

## Acceptance

Five consecutive executions of `tools/e2e/reason-chat.e2e.mjs` against one freshly built desktop app, followed by ten distinct full green E2E workflow runs on `main`. Every non-green completed main run resets the streak. A passing individual step or a selectively rerun job does not count as a full run. Record run IDs and exact SHAs.

## Baseline observed on 2026-11-06

The initial full-main streak is **0/10**.

- [42281484159](https://github.com/reason-machines/openconductor/actions/runs/42281484159), `8e847380955088974ea268690a94581c45791264`, failed. Its Reason chat suite passed. The Reason job failed later in App flows with `FAIL agents-reason: timed out waiting for [reason] cleared`.
- [42279710484](https://github.com/reason-machines/openconductor/actions/runs/42279710484), `f24d03e021829c2e66c4a4c9e09400e179880c2b`, passed before that failure.
- [42277817924](https://github.com/reason-machines/openconductor/actions/runs/42277817924), `716bee929f4d4bdd06a63341c4008f881ea6c797`, failed while waiting for the Reset chat dialog's changed-file count. That run followed the AlertDialog markup change and preceded #712's selector correction.

## Failure ownership

- **Reset dialog: test selector.** The app uses an `alertdialog` labelled by the Reset chat heading. The test must select that accessible title rather than a former layout class. Count loading is asynchronous. Wait for a numeric count, then retain the exact `2 changed` assertion and file-restoration checks. No count failure is tolerated.
- **Relaunch transcript: test navigation.** The fork is the last workspace open before quitting. Selecting the original chat by writing preferences while React also writes those preferences races hydration. Navigate through the original workspace's sidebar button and wait for `aria-current="page"`. Keep the original transcript, Session identity, workspace identity, no-new-Session and no-409 assertions.
- **Needs permission: test navigation.** The workspace's sidebar group folds on the Home route. Open the Home list option with the Needs permission accessible status. Preserve the permission card, database status, sidebar and Home status, answer and clearing assertions.
- **Reason defaults clearing: app investigation.** The settings owner is fixing concurrent full-snapshot saves in `useSettings`. The existing App flows clear loop remains unchanged so it continues to exercise the race.

## Execution route

This Session's Linux cloud computer has no WebKitGTK development/runtime package, WebKitWebDriver or tauri-driver, and no root or sudo installation route. macOS WKWebView has no WebDriver route for this suite. Five local built-app passes are **not run** here.

The existing Ubuntu 22.04 E2E workflow supplies the supported WebKit dependencies and builds the real Tauri app. Its bounded dispatch input `reason_chat_runs` accepts only `1` or `5`; push, PR and default dispatch still run once. A five-pass dispatch records each complete pass in the step summary and stores screenshots in separate `pass-N` folders. Any failing pass fails the step immediately. These are **CI preflight passes, not local passes**.

Fixtures use fresh temporary HOME and OPENCONDUCTOR_HOME. They do not touch the real openconductor-playground or bergen workspaces. ACP is a deterministic local fake with no provider inference or credential hand-off. Signed-in Mac-to-Reason-cloud verification belongs to the runtime owner, not this fake-ACP proof.

## Reference evidence and gaps

No product behavior or visual design is changed by the harness patch. Existing Conductor evidence is reused from [chat status REA notes](../chat-status/README.md) and [chat tab/reset side-by-side](../../parity/side-by-side/chat-tabs-dialog-reset-chat.png). The REA limitations remain recorded in those notes and [UI map gaps 60–61](../../parity/ui-map.md). No new REA invocation was needed for this harness-only change.

## Branch validation failures

- [42298610520](https://github.com/reason-machines/openconductor/actions/runs/42298610520), `2510ee55cec15b365df7a6e304a62f9f823e915c`, failed in the Reason chat step before any chat assertions. The log says `timed out waiting for the undefined row in the sidebar`. `create_workspace` returns `WorkspaceDto.branchName`, not the frontend domain model's `branch`. Both navigation calls now use the IPC field, and seeding asserts the requested branch. All other E2E steps, including App flows, passed in this run.
- [42298639850](https://github.com/reason-machines/openconductor/actions/runs/42298639850), the same SHA, also failed its first preflight pass. No five-pass proof is claimed. The failure screenshot request waited for WebKit's next paint for five minutes and produced no artifact. The harness now uses the existing `WebDriver.screenshot()` helper, which triggers an invisible repaint and bounds capture at 20 seconds.

Built-app verification of these corrections, the five-pass outcome and the ten-run ledger remain pending. Old screenshots are reference evidence, not proof of this branch. The full-main streak remains **0/10**.
