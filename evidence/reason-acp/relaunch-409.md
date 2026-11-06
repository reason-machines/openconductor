# Reason chat follow-up after a relaunch: 409 client_session_id_conflict

Sven's report: a follow-up in an existing Reason chat ("hammerfest") failed
with `Reason request failed (409 client_session_id_conflict)`.

## Cause (seen on sven m5 max, `reason` 0.2.690)

- A chat stores its Reason Session id. The Session lives in the workspace the
  CLI used when the chat started.
- `reason acp` without `--workspace` uses the workspace selected in the Reason
  desktop app (`reason --help`: "default: desktop selection"). That selection
  changes while OpenConductor is closed.
- The stored chats on the Mac were spread across workspaces: hammerfest's
  Session `e6967c40…` is in Reason Tests, seoul's `4f0e3511…` in Reason
  Experiments; the CLI's default was Reason Engineering. `reason session get`
  answers `404 session_not_found` for both there.
- `reason acp`'s `session/resume` of a Session the workspace cannot see still
  succeeds (it drops the 404). The next `session/prompt` then creates a
  Session under the stored id, which is taken: the turn's reply is
  `Reason request failed (409 client_session_id_conflict)` with `end_turn`.
- A relaunch with the same workspace selected resumes fine (a separate signed-in
  run, same CLI: `follow-up ok`).

## Fix

`src-tauri/src/reason_acp/provider.rs`: one `reason --workspace SLUG acp` per
workspace; a new Session opens in the selected workspace (`reason whoami`) and
its workspace is saved in `reason-session-workspaces.json` in the app data
folder. Before resuming, `reason --workspace SLUG session get ID` finds the
workspace that has the Session (the saved one first, then the selected and
the other saved workspaces), and the chat resumes there. A Session no signed-in
workspace has fails the turn with a message naming the workspaces checked;
nothing is sent.

## Signed-in runs (tools/reason_acp_relaunch.py, sven m5 max, Opus 5.5 high)

Created in `reason-experiments`, relaunched with `reason-engineering` selected.

| Run | Reattach | Follow-up reply | 409 |
| --- | --- | --- | --- |
| before-fix | `session/resume` in reason-engineering | `Reason request failed (409 client_session_id_conflict)` | yes |
| app-rule | `session get`: reason-engineering 404, reason-experiments found; `session/resume` there | `follow-up ok` | no |

```json
{"mode": "before-fix", "cli": "0.2.690", "session": "f046924e-9208-4a96-9d6e-eccfbd18c3b3",
 "resumed_in": "reason-engineering",
 "follow_up": {"stopReason": "end_turn", "text": "Reason request failed (409 client_session_id_conflict)"},
 "pass": false}
{"mode": "app-rule", "cli": "0.2.690", "session": "04e3762b-9a68-4d1a-b426-2c47564e648e",
 "located": [{"workspace": "reason-engineering", "exit": 1,
              "stderr": "Reason: Reason request failed (404 session_not_found)"},
             {"workspace": "reason-experiments", "exit": 0}],
 "resumed_in": "reason-experiments",
 "follow_up": {"stopReason": "end_turn", "text": "follow-up ok"},
 "pass": true}
```

The app-rule run follows the provider's steps with the real CLI; it does not
go through the built OpenConductor window. The built-app check is the
`reason-chat` e2e step 10 in CI, against the fake CLI.
