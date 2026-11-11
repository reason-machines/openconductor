# Plan approval with a Claude draft

Conductor Rebuild. PLAN-APPROVE-DRAFT-BE7-01.

## Source

Reviewed current main `248b6c359c830c6ac5e050721bae18e44e168068` before the fixture and freshly fetched main `6ea86f222815a43ab12355eee2afbdcd981b2164` before the correction. WorkspaceView, Composer, PermissionRequests and composerSession remain byte-identical between those default-branch heads. Verified the 108,853-byte current-source attachment SHA-256 `7b8af90ac76300a10cd16ca14c0c1777ebcc25f37c8023207aa1c4b0c612e3d6`, both nested manifests and all nine retained original span hashes with Python standard-library checks. Original text was read as untrusted data, never executed. REA acquisition receipt `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2` pins renderer SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. Historical whole-renderer semantic analysis exhausted its heap; this delivery rereads retained shipped spans, not a new REA/native run.

The original BD callback trims the draft. Nonblank Claude input takes Sd and resolves the plan with approved false and feedback. Blank input approves without feedback. Sd checks loading attachments before resolving. Codex instead uses approved true with feedback and feedbackMessageId; it must not inherit the Claude false answer. Original Claude mode transition, queued follow-up and native/backend equivalence are outside this bounded UI-answer change. The existing adapter maps a false plan answer to noninterrupting denial.

## Regression

`src/features/chat/workspacePlanApproval.test.ts` is independent of existing fixtures. It transpiles and mounts the actual WorkspaceView, Composer and PermissionRequests, including the actual private PlanCard. Draft edits enter through the Composer editor boundary. Separate cases invoke the rendered Approve button callback and the actual callback supplied by PlanCard to useKeybindings. The keybinding hook captures registrations; this does not exercise a keyboard event, dispatcher, DOM focus or mouse event. The editor, agent answer boundary, IPC, persistence and unrelated UI are synthetic. No provider process is opened.

Cases cover current trimmed draft, primary and secondary run/request identity, blank/whitespace approval, file/draft loading and retry, handoff-busy guard, composer feedback, stale request, rejected answer, attachment retention, unchanged Reason approval and absence of the Claude PlanCard in Codex. The source-defined Codex approved-with-feedback native path is not implemented or claimed by this regression.

## Hosted verification

Observed baseline RED at published head `38d0047c4398cebfc621428bab370a11a693789f` in ordinary automatic [CI run 43050784920](https://github.com/reason-machines/openconductor/actions/runs/43050784920). The [frontend unit job](https://github.com/reason-machines/openconductor/actions/runs/43050784920/job/130627171374) and [frontend build job](https://github.com/reason-machines/openconductor/actions/runs/43050784920/job/130627171152) each reported 2,822 tests, 2,811 passes and 11 failures. All 11 were new mounted cases. Button and command approval answered true without feedback instead of false with the trimmed draft. Loading feedback answered when it should have waited; a stale callback answered a replacement request; rejected approval escaped as an unhandled rejection. Eight other new cases passed, including blank approval, handoff busy, Reason and Codex boundaries. The build job stopped at its test step, so baseline typecheck/build success is not claimed.

The correction routes only Claude plan approval and composer feedback through a shared host callback. It verifies the pending request on the captured agent/run, trims the current draft, uses the existing ComposerSession readiness check for nonblank feedback, and clears unchanged draft text only after a successful answer. Attachments are neither uploaded nor consumed. Blank approval bypasses readiness as in the bounded original. Composer's immediate clear is disabled only for the Claude answer path; normal sends and other agents retain their prior behavior. PlanCard's existing handoff busy guard is unchanged. The independent regression and all prior fixtures remain byte-for-byte unchanged from the qualified RED head.

Correction GREEN, exact-head typecheck/build/platform results, merge and consuming-main package receipt are pending automatic CI. They are not inferred from source checks.

Only ordinary automatic CI caused by PR publication is permitted. Local Node, installs, servers, browser, app, provider CLI, workflow dispatch/rerun and native execution were not run. No screenshot exists under this scope. Source checks are not behavioral proof. Package linkage will be reported separately after merge.
