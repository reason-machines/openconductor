# Generated-image fallback disclosure

Conductor Rebuild adds a regression-only checkpoint for text and unsupported-image results. Production is unchanged at this checkpoint. Behavioral RED has not run yet.

## Current source assessment

The publisher's assigned branch is `reason/openconductor-omit-nonco-8e693aec`. Its six saved PRs, #863, #877, #900, #907, #921, and #923, were verified closed and merged before continuing. The index and worktree were clean. An ordinary merge integrated main `382da31580a5698feb223e1a3607fc79119fb77a` at local integration commit `2bed32b3de514ef94463e37048a402f841394ac5`. That commit's complete tree equals main. No historical changes are included in this PR's net diff.

At that main commit, `MoreRows` sends every nonempty ImageGeneration result to `RowShell` as content. `RowShell` uses content presence for both body visibility and disclosure capability. `opensByDefault` initially opens generated-image rows. Source inspection therefore predicts that the two fallback cases invoke the toggle callback and hide their body. This is a prediction, not executed RED.

PR #1109's disclosure baseline isolation is included in main. #1108 was still open at assessment. Its ScheduleWakeup, result timestamp, clock, and import work belongs to its existing owner. Any later production correction must consume its merged changes through normal main integration, not a stacked base or cherry-pick.

## Retained Conductor reference

The source packet was supplied by BE7 with archive SHA-256 `6a067db8dc28e21227f90aac9657c4f32034d608671f4a5edf52961adacac138`. The eight retained excerpts match the hashes in [the original receipt](receipt.json). That receipt's 52-check result is historical source qualification. This publisher verified excerpt hashes but did not rerun its qualification script or acquire the app again.

The reference joins kind lookup through `D1o`/`L1o`/`O1o`, row dispatch `Qpo`/`hIt`, image row `Vpo`, and shared shell `Mu`.

- Renderer asset SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde` contains `Vpo` at bytes `[7868564,7871161)` and `Mu` at `[7795403,7798463)`.
- Index asset SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3` contains `ole` at `[2273193,2273314)` and its image registry at `[2272785,2273193)`.
- `Vpo` passes content visibility independently from `isCollapsible`. It supplies the image predicate as the collapse capability and defaults to expanded. `Mu` respects explicit controlled or persisted closed state.
- `ole` uses `split(".").pop()?.toLowerCase()` and own-map membership. Its exact image keys are png, jpg, jpeg, gif, webp, tif, tiff, avif, and bmp. SVG is not in this registry. The neighboring MIME conversion map is not that predicate.

These are retained REA source observations, not mounted Conductor behavior or current-binary parity. No original code is executed. The historical REA renderer heap skip and manual decoded-byte limitation remain; this work introduces no new REA acquisition or tooling claim.

## Frozen behavioral contract

[The original contract](contract.json) is retained byte-for-byte. Its old execution and ownership statuses describe packet creation, not the subsequently authorized ordinary hosted regression publication. [The freeze record](freeze.json) pins the five inputs, test bytes, current production modules, and retained reference bytes before the first push.

The new test reads these five cases from the contract. It passes each through the actual `reasonChat`/`startTurn`, `applyReasonPayload`, `applyChatEvents`/`emptyTranscript`, and `buildRows`. It asserts the normalized id, tool name, input, status, kind, and result. For pending, JSON null becomes a running tool with no `tool_result` and no result property. It is not rendered as a literal null result.

Each case compiles and mounts the whole current production `ToolRows.tsx`. No AST symbols are extracted. The real tools, icons, thinking helper, React, JSX runtime, `ConductorToolRow`, `MoreRows`, `RowShell`, and `opensByDefault` participate. A React parent starts from the real default-open helper and owns disclosure state. The test invokes only the observed host header's handler and counts its actual callback.

Markdown, link menus, and external openers are excluded boundary leaves that throw if invoked. The Read control uses an identity syntax-highlighting leaf. Unexpected imports fail instead of silently substituting another implementation. Each renderer is unmounted in `finally`.

The required hosted baseline is exactly:

- Plain explanation fails `IMAGE_FALLBACK_TEXT_MUST_NOT_TOGGLE` after the header invokes a callback.
- Unsupported SVG fails `IMAGE_FALLBACK_SVG_MUST_NOT_TOGGLE` for the same observed effect.
- Uppercase PNG passes and keeps its existing collapsible path presentation. No image preview is introduced.
- Pending ImageGeneration passes with the generating label, no content body, and no toggle.
- Ordinary Read passes by opening and closing its exact result through the shared shell.

Both fallback assertions also require the body to remain visible after clicking and no disclosure affordance. The plain case then sets controlled open state to false and requires the body to stay closed without a toggle callback. This rules out forcing a fallback always open.

The Test Behavior, Not Implementation principle shapes this check: source text is not the RED assertion. The callback count and mounted body are the observed behavior. A loader, import, typecheck, or build error does not qualify as product RED.

## Pre-RED typecheck repair

The first published head `b690ca1aa7b6a9d51e708affff23cb9a96861a89` failed [the Keybindings build](https://github.com/reason-machines/openconductor/actions/runs/43137099541/job/130914947665) with TS18046 at the new test's line 95. `assert.equal(typeof production.opensByDefault, "function")` checks the export at runtime but does not narrow its `unknown` type for TypeScript. This checkpoint is not qualified product RED.

A one-line test-only repair uses `assert.ok(typeof production.opensByDefault === "function")`. Its runtime condition is unchanged, and TypeScript can now narrow the export. All five inputs, normalization, module loading, parent state, behavioral assertions, controls, reference bytes, and production bytes remain unchanged. No local typecheck or test is run. [The repair record](typecheck-repair.json) preserves the original test hash and seals the repaired test hash before its automatic push. The original freeze record stays intact as history.

A fresh automatic hosted baseline must demonstrate both exact fallback failures and all three passing controls on the repaired test before any product change. The repaired test bytes then remain unchanged through GREEN. The initial compiler failure must not be counted as behavioral RED.

## Qualified hosted RED and scoped correction

On repaired published head `615d7bf4eccbf343a196cd1b4ad28c15848b0693`, [the automatic unit job](https://github.com/reason-machines/openconductor/actions/runs/43137755510/job/130917075379) observed exactly the two required failures. Each fallback header invoked one toggle callback instead of zero. PNG, absent pending result, and ordinary Read passed. The full suite reported 3,237 tests, 3,235 passed and two failed, with no skips or cancellations. [The receipt](hosted-red.json) and [five-case log excerpt](hosted-red.log), with trailing whitespace removed, retain the result. Frontend typecheck passed in job `130917075580`; its later build step was skipped after the same unit failures, not passed.

The assigned branch then integrated actual main `f55d0330ff32e790c08a26d2e7aa83dbf2b8ea32` through an ordinary merge. This includes #1109. The image-row module and normalization/reducer/view dependencies still match their original assessment bytes. Other owners' changes are included only through that main integration.

The correction adds optional `isCollapsible`, defaulting to true, to `RowShell`. Header click capability and disclosure affordances require both content and that capability. Body rendering still requires content and the controlled open state, independently of capability. An explicit false state therefore remains closed, and every other row keeps its existing default.

Only the image-generation call supplies the capability. Its private extension map retains the exact `ole` keys and `split(".").pop()?.toLowerCase()` plus own-membership semantics. SVG, ICO and HEIC are not added. The predicate changes only disclosure; existing result text and path presentation are untouched. ScheduleWakeup, timestamps, clock, imports, Transcript, normalization and the disclosure store are unchanged.

The repaired test remains Git blob `4e76ae2a0c18815fc05bc84d9c25360a517d42d1`, SHA-256 `5e4784b0a627a43010eb3200022f19e6eec257f0d43995e20fdd99a0e127cdbd`. All five inputs and retained reference files remain frozen. `python3 evidence/chat/image-generation-fallback/verify_candidate.py` checks those bytes, the exact shell/image-only source transformation, unchanged excluded production, and the RED receipt. This source-only check does not execute the product. Same-input hosted GREEN, all exact-head workflows, merge and consuming-main/package proof remain pending.

## Consuming merged ScheduleWakeup source

After the first candidate publication at `fab7907ad7b39303a9d8524cca3adf179bc9d0ac`, #1108 merged as actual main `649f47b9d80eb1d7510c2b405b25e026ffddf78b`. An ordinary merge consumed that main without conflicts. The image test and all five input bytes remain unchanged. ScheduleWakeup, its imported helper, result timestamps, clock plumbing and Transcript changes are preserved exactly as merged. The only product delta from that main remains the released optional shell capability and image-row membership check.

[The integration receipt](consumed-main-1108.json) records this source-only transition. The verifier now compares excluded production against that actual merged main, while separately validating the original historical pins. No historical pin, test helper, assertion or freeze record was rewritten. Automatic same-input GREEN on the integrated candidate remains pending. #1108 consuming-main/package observation stays with its existing owner.

## Execution and delivery limits

No local Node, npm, React, typecheck, build, dependency installation, provider, native, or app runtime is admitted. Preparation uses only source reads, Python byte checks, and Git. Existing automatic hosted CI runs the test through `node --test "src/**/*.test.ts"`. No workflow is edited, manually dispatched, or rerun.

Before any product correction, the first ordinary push must produce both named failures and pass all three controls. The input contract and test bytes then remain frozen through GREEN. Only after that RED may the released optional RowShell capability and image-row call be corrected. Content presence must stay independent of collapse capability. Other rows retain the shared-shell default.

Global file formats, detectors, fetching, previews, path/open/copy behavior, CSS, backend behavior, ScheduleWakeup, result timestamps, clock imports, Transcript, the disclosure store, and every other owner's frozen fixtures are excluded. PR #847 remains untouched. No new worker or duplicate observer is started.

All exact-head checks must pass before a merge request. Consuming-main checks and macOS packaging are separate later proof. Native and visual acceptance are not run; no screenshot is available under the runtime exclusion.
