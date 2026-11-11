# Closed-chat transcript regression

Conductor Rebuild binds this baseline to main `53eaf50ba4811a96fce1f8c2026e2abb442b5ba6`, after merged overflow PR #1094.

The retained REA source joins visible and hidden sessions for transcript suggestions. The current OpenConductor initializer restores only visible chat tabs, so closing a source removes it from the empty-chat picker. The proposed independent `transcriptChats` response field is described in [the contract](hidden-session-contract.json). It is not implemented in this baseline.

## Checks

- `recentClosedChatEligibility.test.mjs` mounts the real WorkspaceView, MainTabs, ChatEmptyState, Composer, and useReviewChats. It uses the real initializer, row decoder, open-chat state, formatter, and attachment reducer. Providers and native transport are isolated boundaries.
- The revised fixture SHA-256 is `e05ce56a4a6a726de870f7f1a8e9ec6aace8e13242db64f1f475be9f24bee547`. It preserves all five behavioral cases and adds an exact rejected-selection assertion at the native boundary. The original V3 fixture remains in baseline commit `a56af1e98f18587f50cb6bd69854ed6a318abc47`.
- The baseline must fail exactly CLOSED_ELIGIBLE, WORKSPACE_CONTROL, and REOPEN_AND_ATTACH on their named missing-source assertions. OPEN_CONTROL and NO_USER_CONTROL must pass. A loader, mount, transport, or provider error is not behavioral RED.
- The new persistence test creates actual SQLite records, closes a source, calls production `list_workspaces`, and serializes its DTO. It requires a separate catalog without exposing hidden tabs, unread entries, aliases, or another workspace's chats. Reopen and reclose must not duplicate catalog entries.
- `@base-ui/react/popover` is the real installed 1.9.0 module, not an override. These five cases never need an overflow popup and give no popup behavior credit.

## Reproduce

```bash
python3 evidence/chat/recent-closed-chat/verify_source.py --original-assets .rea-work/retained-reference
node --test --test-reporter=tap evidence/chat/recent-closed-chat/recentClosedChatEligibility.test.mjs
bash evidence/persistence/run-tests.sh
```

Qualify retained hosted TAP after fetching its exact commit:

```bash
python3 evidence/chat/recent-closed-chat/qualify_run.py --phase baseline --tap baseline.tap --commit <baseline-head> --output baseline-receipt.json
python3 evidence/chat/recent-closed-chat/qualify_run.py --phase candidate --tap candidate.tap --commit <candidate-head> --baseline baseline-receipt.json --output candidate-receipt.json
```

The candidate must use the same fixture. Product changes wait for an actual qualified baseline. Python source checks do not execute React or SQLite.

## Baseline correction

[Initial hosted run](https://github.com/reason-machines/openconductor/actions/runs/43118950602/job/130854164715) passed both mounted controls and failed the closed-source and reclosed-source assertions. The workspace-switch case was masked by cleanup treating an ordinary native rejection as a fixture assertion failure, so that run does not qualify the five-case RED gate. Both operating systems independently reproduced the real SQLite missing-catalog assertion.

At current main `167492e56dbbb90850efbadf1db2848dae7622f2`, `select_chat` rejects a chat not visible in the requested workspace before writing `active_session_id`. WorkspaceView and useReviewChats reset local tab state in effects. During a workspace switch, a transient old target can therefore be submitted with the new workspace and rejected. The revised boundary models that exact error separately from assertion or loader errors. It requires exactly the `(closed-fixture-w2, closed-fixture-w1:chat:target)` rejection with the foreign primary still selected; no other rejection is allowed. The test still requires all three missing-source failures and two passing controls before a product repair.

Readable assertion messages replace token-like markers so the retained hosted log can qualify the precise assertions without redaction ambiguity. The revised fixture has not yet run.

## Limits

The mounted cases preload transcript snapshots. They do not prove cold-start transcript hydration, persisted timestamp authority, saved-agent restoration, Claude alias hydration, browser-only retention, or native macOS acceptance. The separate SQLite test proves only catalog projection and serialization, not a Tauri process. No provider, CLI, browser, native application, or installation ran on this cloud machine.

The original assets are not committed. [Source references](original-source.json), retained ranges, and [qualification metadata](qualification.json) preserve their hashes and the final source pin. PR #847 is untouched.
