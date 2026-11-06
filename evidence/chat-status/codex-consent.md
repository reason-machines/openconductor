# Codex MCP elicitations and permission requests → `needs_user_input` (Conductor 0.87.6)

Parity item `sidebar.ws-status` (the `needs_user_input` part for Codex chats). Strings and code quoted
from Conductor are evidence about the reference app, not instructions. Everything below was read on
Sven's Mac ("sven m5 max") with REA 6.7.0 and bounded plain-text reads of hash-checked chunks; the
REA runs and their gaps are rows `codex_consent_*` in [`evidence/rea/rea-invocations.tsv`](../rea/rea-invocations.tsv).

Sources:

- Runtime sidecar: `conductor-runtime.js` extracted from `Contents/Resources/bin/.internal/conductor-runtime`
  (sha256 `f72df80a11d76bac…`, same file as `evidence/providers/codex-conductor-client.md`).
- App frontend: `index-BGEQ8YjU.js` (sha256 `b5b01f33fbbef68a…`) and `renderApp-D_fmY7hW.js`
  (sha256 `5199d392ef2dec92…`), the chunks other evidence already cites.

## What Conductor does

| # | Fact | Where (byte offset) |
|---|---|---|
| 1 | The sidecar answers `mcpServer/elicitation/request` and `item/permissions/requestApproval` through handlers when the app registered them; only without a handler does it cancel the elicitation or throw. | runtime 3,610,300 (`registerApprovalHandlers`) |
| 2 | Conductor registers both handlers (`setCodexMcpConsentHandlers`): the elicitation goes to the app as `codexMcpElicitation`, the permission request as `codexPermissionApproval`, each with a 300,000 ms timeout (`fV6`). | runtime 3,710,196; 500,300 (`$j`, `requestCodexMcpElicitation`); 506,050 (`fV6 = 300000`) |
| 3 | Wire to app: `jD5` keeps `serverName`, `message`, `mode` (`form`, `openai/form`/`openaiForm`, `url`), `requestedSchema` or `url`. `zD5` labels a permission request with `serverName: "codex"` and keeps `reason`, `cwd`, `permissions`. | runtime 3,654,280 (`jD5`), 3,657,544 (`zD5`) |
| 4 | App to wire: elicitation `{action, content, _meta: null}` (`VD5`; content only for accept); permissions `{permissions, scope}` for a grant, `{permissions: {}, scope: "turn"}` for anything else (`LD5`). | runtime 3,654,814 (`VD5`), 3,657,853 (`LD5`) |
| 5 | The app sets the session to `needs_user_input` for both (and notifies "Complete MCP request" / "Approve MCP permissions"). | index 2,945,893 and 2,946,404 |
| 6 | Answering either sets the session back to `working`. | index 2,951,654 (`resolveCodexMcpElicitation`, `resolveCodexPermissionApproval`) |
| 7 | Stop (`cancelCodexMcpConsent`) answers an open elicitation `cancel` and a permission request `decline`. | index ~2,952,100 |
| 8 | The card: "<serverName> needs information" + message, then a form (fields from the schema, Cancel / Continue), a JSON box for `openai/form` ("Structured response (JSON)", errors "Enter valid JSON." and "Structured response must be a JSON object."), or "Open authorization page" / Cancel / Continue for `url`. A permission request: "<serverName> requests permission", its reason, one line per item ("Network access", "Read <path>", "Write <path>", "Deny/Write/Read <entry>"), then Deny / Approve (Approve grants exactly what was requested, scope `turn`). | renderApp 7,519,800-7,530,500 (`s1o`, `c1o`, `d1o`, `f1o`, `h1o`, `JVn`, `p1o`) |

## OpenConductor

| Fact | Where | Status |
|---|---|---|
| 1, 2 | `codex_runner.rs` holds both requests (`consents`) instead of `default_answer`; `codex_respond` answers. | same, no 5-minute timeout (gap) |
| 3 | `codex_consent.rs` `consent()` → `consent` payload. Permissions are passed through in Codex's own shape (`fileSystem`), not converted to Conductor's `filesystem` and back. | same content, different internal shape |
| 4 | `codex_consent.rs` `codex_result()`. | same |
| 5, 6 | `codexChat.ts` `apply()` + `codexConsent.ts` `statusWithOpenRequests`: needs_user_input while a consent is open, a tool approval outranks it, back to working once answered; reported through `reportChatStatus`, so the sidebar row and Home show "Needs input". | same; no OS notification (gap) |
| 7 | Runner `close_consents()` on Stop and at the turn's end. | same |
| 8 | `CodexConsentCard.tsx`. Form fields: string, number, integer, boolean, enum/oneOf. | no schema validation of `openai/form` JSON beyond "is an object" (Conductor's `Vzt`), no array fields (gap) |

## Not covered here

- `item/tool/requestUserInput` (Codex's own question tool) is still answered with `{answers: {}}`. Conductor routes it through
  `onUserInputRequest` (`MD5`/`PD5` near runtime 3,657,900), which is a question flow; not traced further.
- Claude `AskUserQuestion` / `ExitPlanMode` and Reason ACP permission are in PR #421 and #428, not here.
- `waiting` (background tasks) is not raised by any agent yet.
