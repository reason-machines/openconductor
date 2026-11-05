# Codex app-server protocol, checked against the real CLI

What `src-tauri/src/agent/codex_cli.rs` and `codex_rpc.rs` rely on, checked
against the public Codex CLI. This confirms the CLI's interface. It does not
confirm that the reference app calls it this way: that claim is still
"verifier-reported, extract pending" in `README.md`.

## Versions

- The reference app downloads Codex **0.156.1**
  (`agent-binaries/.meta/codex-0.156.1.json` in
  `evidence/runtime/first-run-files.tsv`).
- Checked: `@openai/codex@0.156.1-linux-x64` and `@openai/codex@0.166.0-linux-x64`
  from npm, schema generated with
  `codex app-server generate-json-schema --out <dir>`.

## Schema facts (identical in 0.156.1 and 0.166.0)

| What | Value |
|---|---|
| Transport | `codex app-server --listen stdio://` (stdio is also the default) |
| Client requests used | `initialize`, `thread/start`, `thread/resume`, `turn/start`, `turn/interrupt` |
| Client notification | `initialized` |
| `AskForApproval` | `untrusted`, `on-request`, `never` (or a `granular` object we do not send) |
| `SandboxMode` | `read-only`, `workspace-write`, `danger-full-access` |
| `TurnStatus` | `completed`, `interrupted`, `failed`, `inProgress` |
| `thread/start` params used | `cwd`, `model`, `approvalPolicy`, `sandbox`, `developerInstructions` (all optional) |
| `turn/start` params | required `threadId`, `input` (`[{"type":"text","text":...}]`); optional `model`, `effort` |
| `turn/interrupt` params | `threadId`, `turnId` (both required) |
| Server approval requests | `item/commandExecution/requestApproval` (`threadId`, `turnId`, `itemId`, optional `command`, `cwd`, `reason`), `item/fileChange/requestApproval` |
| Approval answer | `{"decision": "accept" \| "acceptForSession" \| "decline" \| "cancel"}` |
| Notifications modelled | `turn/started`, `turn/completed`, `item/started`, `item/completed`, `item/agentMessage/delta`, `error` (`willRetry`) |

The approval and sandbox values match the reference app's options listed in
`README.md`; the reference app's "inherit" maps to sending neither field.

## Live session (0.166.0, no credentials, Linux)

Lines trimmed; ids shortened. Messages carry no `"jsonrpc"` field.

```text
>> {"id":1,"method":"initialize","params":{"clientInfo":{"name":"openconductor","version":"0.1.0"}}}
<< {"id":1,"result":{"userAgent":"openconductor/0.166.0 (...)","codexHome":"...","platformFamily":"unix","platformOs":"linux"}}
>> {"method":"initialized"}
>> {"id":2,"method":"thread/start","params":{"cwd":"/tmp/ws","approvalPolicy":"never","sandbox":"read-only"}}
<< {"id":2,"result":{"thread":{"id":"01a1ab8a-...","preview":"","ephemeral":false,...},...}}
<< {"method":"thread/started","params":{"thread":{...}}}
>> {"id":3,"method":"turn/start","params":{"threadId":"01a1ab8a-...","input":[{"type":"text","text":"say hi"}]}}
<< {"id":3,"result":{"turn":{"id":"01a1ab8a-674f-...","items":[],"status":"inProgress","error":null,...}}}
<< {"method":"turn/started","params":{"threadId":"...","turn":{...,"status":"inProgress"}},"emittedAtMs":...}
<< {"method":"item/started","params":{"item":{"type":"userMessage",...},"threadId":"...","turnId":"..."}}
<< {"method":"error","params":{"error":{"message":"Reconnecting... 2/5",...},"threadId":"...","turnId":"...","willRetry":true}}
>> {"id":4,"method":"turn/interrupt","params":{"threadId":"...","turnId":"x"}}
<< {"error":{"code":-32600,"message":"expected active turn id x but found 01a1ab8a-674f-..."},"id":4}
<< {"method":"turn/completed","params":{"threadId":"...","turn":{...,"status":"failed","error":{"message":"unexpected status 401 Unauthorized: ..."}}}}
```

Observed beyond the schema: notifications carry a top-level `emittedAtMs`,
and `turn/interrupt` needs the id of the turn that is actually running.
