# Quiet follow-on run admission reaches the panel

Conductor Rebuild owns this successor to #883. Upstream main was verified as `4988e47daebc6936a868491dce28b5d7672bc381` through `repos_compare_commits` and the supported Git origin on 2026-11-10. All six open pull requests were checked by complete changed-file lists. The ledger confirmed no overlapping owner before edits.

## Source finding

`ScriptService::start_setup` publishes `SetupFinished` before queued-run admission or the separate automatic default-run branch. This ordering stays intact. `RunManager::start` commits `Starting` and then `Running`, but only completion has an event callback. `ScriptsPanel` refreshes on setup and run completion, not run admission. A refresh triggered by early setup completion can read the waiting or idle snapshot. A quiet follow-on task then has no guaranteed event to refresh the mounted toolbar before its eventual completion.

## Retained reference

The accepted source-only REA closure is in the [existing investigation](https://reasonmachines.com/agents/1f14fa82-4ec3-41fc-b085-32ec441b4228), accepted by ledger message `97c822fe-6779-44c5-8a91-2522cb39ab27`. No acquisition or extracted-code execution was repeated.

- Retained renderer `renderApp-D_fmY7hW.js` has SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- Complete `nro` is retained in `evidence/terminal/strip-toolbar/reference-nro.txt`, renderer UTF-8 `[7170202,7199367)`, 29,165 bytes, SHA-256 `906c982d3300028803e71158d7f70c6fd3c1cc6f55f1ff6e9c6fd645cac34123`.
- Accepted import closure: index exports `AI as gT, ARt as gU`; renderer imports `gT as tX, gU as q_`. Complete `V9i` and `Yio` definitions were retained in Session source `227e63fa-e4f8-4b59-b911-635dfa9798d6`, revision `23708511`, transcript `[2850,4450)`.
- `nro` selection and hooks `[7172036,7172821)` resolve task `ke`. State and busy hooks read the same workspace/task key. Toolbar `[7189979,7192943)` consumes it; Stop handler `[7183537,7183617)` targets that same task. Starting is busy and displays `Starting...`; literal Stop is the running presentation.
- Setup transport supplement remains with the existing executor at `.ara-state/setup-handoff-retained-20261110/setup-handoff-source-supplement.json`, SHA-256 `23ed7ac0280391db26a7c9b6442cd372a120fadfccd07aed5d04b7d9476d8ec5`, Session source `6b00a37f-6b24-492e-9dc4-fe6c67966c36`, revision `25845336`. UTF-8 completion `[2936157,2937721)`, `IRt` `[2934884,2936157)`, adapter `[2933486,2934884)`. Queued admission is not an independent successful-Setup-exit gate. The separate no-queue automatic branch checks completed/idle and default-or-first. Those policies are not changed here.

This is static reference proof, not native timing or installed-app acceptance.

## Regression checkpoint

The existing actual-component test fixture now models an early setup-completion refresh followed by a separate quiet task admission. New cases require queued nondefault Test to leave `Setting up...` for Stop without starting Dev, automatic Dev to reach Stop without another start command, and workspace-scoped authoritative refresh rather than trusting a late event payload. The five existing natural-completion cases and their assertions are unchanged.

Two service regressions use real setup and run processes in ordinary hosted CI only. A disposable file releases silent setup after Test is queued, or without any queue for automatic Dev. They require one serialized admission with committed running state, early `SetupFinished` snapshots, unchanged task identity/precedence, and no output or completion needed. Cleanup shuts down the service before checking the admission result, including the expected RED case.

## Hosted failure and correction

The regression-only remote checkpoint `a1bb5e9b578f0b78851a0e8b0fa032a75030f30a` reproduced all five new failures in [automatic CI run 42824698194](https://github.com/reason-machines/openconductor/actions/runs/42824698194). Both Scripts jobs passed 82 existing tests and failed only the queued-Test and automatic-Dev cases with `quiet follow-on must publish committed run admission: Timeout`. The frontend passed 1,718 tests and failed only the three new mounted-panel admission cases. Typecheck passed before its job reached the same failing unit tests.

The shared `RunManager::start` now calls `on_started` after it commits the running process and clears the previous exit, outside its state lock and before completion monitoring starts. The callback stays with queued requests, so manual, queued and automatic starts use the same publication path. The service serializes this as `runStarted`; the typed frontend union accepts it and the mounted panel refreshes authoritative status for its own workspace. An added runner test checks committed-state readability, old-exit clearing and admission-before-completion ordering for an immediate exit. No setup-completion, selection, precedence, automatic-run or shutdown logic changes.

Commands used by automatic CI include `node --test "src/**/*.test.ts"` and the scripts crate's `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings` and `cargo test` with `RUSTFLAGS=-D warnings`. No local Node/Cargo tests, typecheck, builds, dependency installation, browser/app/native execution, workflow dispatch or resource admission is performed. Hosted GREEN results are pending for the correction.

No screenshot is available because local browser/app/native execution is not authorized. Component and process tests do not prove webview delivery, native appearance, installed-package behavior or notarization. #847's stop and protected data remain unchanged.
