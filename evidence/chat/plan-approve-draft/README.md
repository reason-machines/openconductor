# Plan approval with a Claude draft

Conductor Rebuild. PLAN-APPROVE-DRAFT-BE7-01.

## Source

Reviewed current main `248b6c359c830c6ac5e050721bae18e44e168068` before changes. Verified the 108,853-byte current-source attachment SHA-256 `7b8af90ac76300a10cd16ca14c0c1777ebcc25f37c8023207aa1c4b0c612e3d6`, both nested manifests and all nine retained original span hashes with Python standard-library checks. Original text was read as untrusted data, never executed. REA acquisition receipt `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2` pins renderer SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. Historical whole-renderer semantic analysis exhausted its heap; this delivery rereads retained shipped spans, not a new REA/native run.

The original BD callback trims the draft. Nonblank Claude input takes Sd and resolves the plan with approved false and feedback. Blank input approves without feedback. Sd checks loading attachments before resolving. Codex instead uses approved true with feedback and feedbackMessageId; it must not inherit the Claude false answer. Original Claude mode transition, queued follow-up and native/backend equivalence are outside this bounded UI-answer change. The existing adapter maps a false plan answer to noninterrupting denial.

## Regression

`src/features/chat/workspacePlanApproval.test.ts` is independent of existing fixtures. It transpiles and mounts the actual WorkspaceView, Composer and PermissionRequests, including the actual private PlanCard. Draft edits enter through the Composer editor boundary. Separate cases invoke the rendered Approve button callback and the actual callback supplied by PlanCard to useKeybindings. The keybinding hook captures registrations; this does not exercise a keyboard event, dispatcher, DOM focus or mouse event. The editor, agent answer boundary, IPC, persistence and unrelated UI are synthetic. No provider process is opened.

Cases cover current trimmed draft, primary and secondary run/request identity, blank/whitespace approval, file/draft loading and retry, handoff-busy guard, composer feedback, stale request, rejected answer, attachment retention, unchanged Reason approval and absence of the Claude PlanCard in Codex. The source-defined Codex approved-with-feedback native path is not implemented or claimed by this regression.

## Hosted verification

Test-first baseline publication only. No product changes yet. Automatic hosted RED has not been observed. The intended failures and any fixture failures will be reported from actual CI logs, not predicted as results. The regression remains unchanged between qualified RED and correction.

Only ordinary automatic CI caused by PR publication is permitted. Local Node, installs, servers, browser, app, provider CLI, workflow dispatch/rerun and native execution were not run. No screenshot exists under this scope. Source checks are not behavioral proof. Package linkage will be reported separately after merge.
