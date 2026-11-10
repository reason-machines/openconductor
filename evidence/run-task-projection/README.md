# Display the busy run task without replacing the selected task

Conductor Rebuild compared fresh upstream main `49fde8bf788f0914dc7e53e58c5b024a9294cc61` through `repos_compare_commits` and a supported-origin fetch on 2026-11-10. The full changed-file lists of all nine then-open PRs contained none of this change's five paths. The ledger confirmed the previous terminal/scripts lease was released and no competing scripts source owner was recorded.

## Retained reference

This investigation reuses the real Conductor 0.87.6 REA extraction, without acquiring, launching or executing the reference again.

- Renderer `renderApp-D_fmY7hW.js`, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- Complete `nro` is [retained as inert text](../terminal/strip-toolbar/reference-nro.txt). Its renderer UTF-8 byte range is `[7170202,7199367)`, length 29,165 bytes, SHA-256 `906c982d3300028803e71158d7f70c6fd3c1cc6f55f1ff6e9c6fd645cac34123`. This investigation rechecked that length and hash.
- Complete `V9i` and `Yio` definitions are retained in Session `552cf5a8-28dd-43bc-9997-fed8ad9316f7`, tool-output source `227e63fa-e4f8-4b59-b911-635dfa9798d6`, revision `23708511`. Transcript `[2300,5300)` includes both full definitions. `Yio` returns the workspace's active run task when it exists, is busy, and the selected task is not busy. Otherwise it returns the selected task.
- `nro` renderer UTF-8 `[7172036,7172821)` derives selected `ve` through `V9i`, reads selected and workspace-active busy flags, then derives displayed `ke` through `Yio`. Displayed process, busy and state hooks all read `ke`. The accepted identity closure for `tX` and `q_` is recorded in [the admission evidence](../run-admission/README.md).
- `We=je` is the displayed busy flag. Toolbar `[7189979,7192943)` uses `We` and displayed `Ne` for Stop and the pending labels. `B1` at `[7183537,7183617)` targets `ke` while busy. The complete retained function also uses displayed `Le` and `Ne` for the body. This is a distinct display projection after task selection, not a command to replace selection history.

These are static reference statements. They do not establish native timing, installed-app acceptance or visual parity.

## Current-source mismatch

`ScriptsPanel` feeds the output, body and header directly from `shownTask`. That helper preserves an explicit pick before considering the active script. Its command toggle instead uses `runButton(config, runs, ...)`, which reads the workspace's busy process.

After an explicitly picked Test finishes, a later quiet Dev admission can therefore leave the panel showing Test and Run Test while the action actually stops Dev. The #904 admission event correctly refreshes status; it cannot fix this separate projection error.

The correction must keep selected-task intent separate from the displayed task. An idle choice yields to the authoritative busy workspace task. Once that task stops or exits, the previous explicit choice and its output return. A busy selected task remains displayed.

The runner allows only one run script per workspace. This change does not alter its workspace-wide stop IPC, SetupFinished ordering, run admission publication, selection history, queue precedence, automatic-run policy or shutdown guards. Spotlight's existing selection helper remains unchanged.

## Regression checkpoint

Two new tests mount the actual `ScriptsPanel` and `RunSplitButton` with the existing real React test renderer fixture. They use the real scripts event adapter and authoritative status reads, with only the IPC boundary simulated. They cover completed picked Test followed by quiet Dev admission, Stop, natural exit, retained Test output and restarting Test without an unintended Stop. All existing component cases and assertions are unchanged.

Hosted regression results are pending. No local Node or Cargo test, build, dependency installation, browser, app, native action, acquisition, workflow dispatch or runtime admission ran. `git diff --check` is the only local validation planned. No screenshot is authorized. #847 and protected data remain untouched.
