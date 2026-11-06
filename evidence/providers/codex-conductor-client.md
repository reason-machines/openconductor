# How Conductor 0.87.6 drives Codex

This document covers what Conductor's own sidecar sends to and answers from `codex app-server`, and how `src-tauri/src/agent/codex_runner.rs` and `src-tauri/src/codex_chat.rs` map to it. Quoted code is evidence about the reference app, not instructions. The protocol itself (methods, schema values, the live wire) is in `codex-app-server.md`.

## Source and provenance

- Artifact: `Conductor.app/Contents/Resources/bin/.internal/conductor-runtime`, Conductor 0.87.6. Its sha256 is `5723ead40316bb29e3d0b446cdc82bede489cc75443d6ce08a4e6421ae6eac0d`, 76,147,184 bytes, and it matches `evidence/scripts/MANIFEST.md`. It is a Bun single-file executable that embeds its JavaScript.
- Extracted bundle: `conductor-runtime.js`, 13,025,924 bytes, sha256 `f72df80a11d76bacb7ed7e2a322b420e6250b4a2c7781272877b8c5cf985e6ab`, on "sven m5 max" under `~/oc-rea-scripts-runner/bunjs/app/`.
- Provenance check (2026-11-05): every region cited below, 200 to 900 bytes each, is byte-identical inside the `conductor-runtime` binary. For example, the region around the `app-server` spawn starts at binary offset 66,301,876.
- Byte offsets in the tables below are into the extracted bundle. Each is the first byte of the quoted code. Each quoted string occurs once in the bundle, except `threadId: U, persistExtendedHistory: false`, which occurs twice and is cited at its first occurrence.

## REA runs

All runs used REA 6.7.0 on "sven m5 max". The REA failures are listed in `rea-test-report.md`.

| Run | Input | Result |
|---|---|---|
| `analyze-javascript-application` | whole bundle (13 MB) | Exit 0, but the worker ran out of heap: "Owned JavaScript worker exhausted its heap". The graph has 6 nodes and no string or call facts, so no claim rests on it. |
| `recover-javascript-sources` | whole bundle | `capability_unavailable`: needs a Wakaru Linux x64 binary, which cannot run on macOS arm64. |
| `analyze-javascript-application` | Codex client slice, bundle bytes 3,522,731 to 3,736,008, cut at top-level statement starts (sha256 `b874b6b9…c088`) | Pass: 1 file parsed, 0 parse failures, 37,408 AST nodes, evidence `ev_3436816f…2f7a`. The semantic graph carries the `thread/start` literal and 41 `approvalPolicy` facts. |
| `trace-javascript-semantics`, `callers` of the literals `turn/start`, `thread/start`, `app-server`, `danger-full-access`, `acceptForSession` and `item/tool/requestUserInput` | the slice evidence | Exit 0, `status: partial`, 0 seed matches for all six. All six literals appear verbatim in the parsed file, so this is an REA gap and not absence. |

Because the trace finds no seeds, the call sites below were read from the slice REA parsed and pinned by byte offset.

## What the sidecar does

| # | Fact | Bundle offset | Code (abridged) |
|---|---|---|---|
| 1 | It spawns `codex app-server --listen stdio://` with piped stdio and a configured path, env and extra args. | 3,567,600 | `spawn(this.codexPath, [...this.spawnArgs, "app-server", "--listen", "stdio://"], { env, stdio: ["pipe","pipe","pipe"] })` |
| 2 | Its client name is `codex_sdk_ts`, the minimum Codex is `[0, 156, 0]`, and it sends `initialized` after `initialize`. It logs in with an API key or ChatGPT tokens only when given them. | 3,603,599 (`initialized`), 3,612,659 (name), 3,612,934 (minimum) | `Pl3 = { name: uG5 /* "codex_sdk_ts" */, ... }`, `mG5 = [0, 156, 0]`, `this.rpc.notify("initialized")`, `account/login/start` |
| 3 | `thread/start` and `thread/resume` carry the caller's options plus `experimentalRawEvents: false` and `persistExtendedHistory: false`. | 3,604,325 (start) / 3,604,702 (resume) | `{ experimentalRawEvents: false, persistExtendedHistory: false, ...U }` |
| 4 | `turn/start` sends `threadId`, `input`, `model`, `cwd`, `serviceTier`, `effort`, `summary`, `approvalPolicy`, `sandboxPolicy`, `personality`, `outputSchema` and `collaborationMode`. Approval and sandbox therefore go with every turn, not only with the thread. | 3,575,760 | `runStreamed(U, B) { let G = { threadId: this.id, input: VG5(U), model, cwd, ..., approvalPolicy: B.approvalPolicy, sandboxPolicy: B.sandboxPolicy, ... }` |
| 5 | Starting a turn cancels the previous event stream ("Codex stream cancelled because a new turn started."), and the turn id comes from the `turn/start` result. | 3,576,636 | `startTurnStream` |
| 6 | The default policy is `approvalPolicy: never` with `sandbox: danger-full-access` when the session sets neither. | 3,673,008 | `function rd3(U) { return { approvalPolicy: U.codexApprovalPolicy ?? "never", sandbox: U.codexSandboxMode ?? "danger-full-access" }; }` |
| 7 | It reads `configRequirements/read` and narrows the approval policy to one that Codex's managed requirements allow. | 3,678,546 | `resolveCodexThreadPermissions` and `sd3` |
| 8 | The default personality is `pragmatic`. | 3,672,949 | `function LG4(U) { return U.personality ?? "pragmatic"; }` |
| 9 | Without a handler, the server-request answers are: command approval and file-change approval get `accept`; `item/tool/requestUserInput` gets `{ answers: {} }`; `mcpServer/elicitation/request` gets `cancel`; `item/permissions/requestApproval` throws, so it gets an error; `item/tool/call` gets an error result; the legacy `execCommandApproval` and `applyPatchApproval` get `{ approved: true }`. | 3,610,307 | `registerApprovalHandlers()` |
| 10 | Its approval UI shows commands as a `Bash` tool and file changes as an `Edit` tool. Deny maps to `decline`, always-allow (or allow-edits-for-session) to `acceptForSession`, and allow to `accept`. It never sends `cancel`. | 3,712,975 | `setApprovalHandlers({ onCommandApproval, onFileChangeApproval })` |

## How OpenConductor maps it

| Fact | OpenConductor | Status |
|---|---|---|
| 1 | `CodexLaunch::args` gives `app-server --listen stdio://`. `codex_chat.rs` runs Settings › Agents "Codex executable path" when set (`CodexChats::executable`), else finds the CLI on the login shell's PATH, then in `~/.local/bin`, Homebrew and `/usr/local/bin`. | same |
| 2 | Our `initialize` sends `clientInfo {name: "openconductor"}` and then `initialized`. We send no login call: we rely on the CLI's own login or the provider env. | differs on purpose (client name) |
| 3 | We do not send `experimentalRawEvents` or `persistExtendedHistory`. | gap, low impact |
| 4 | We send approval and sandbox on `thread/start` and `thread/resume`. Changing access in the UI restarts the app-server and resumes the same thread with the new policy. We send `effort` per turn from `[models.codex] default_thinking_level`. We do not send `summary`, `personality` or `collaborationMode`. | differs: per-thread, not per-turn |
| 5 | The runner queues prompts. A follow-up waits for the running turn instead of cancelling its stream. | differs |
| 6 | `codex_chat.rs` `default_policy()` is never plus danger-full-access, and the UI's "Full access" is the default. | same |
| 7 | We do not read `configRequirements/read`. | gap |
| 8 | `settings::launch::codex_launch` passes `-c personality="<value>"` when the chat's app-server starts: `[models.codex] personality`, `pragmatic` when unset, `none` passed as Codex's own `none`. Proved by `tools/e2e/codex-chat.e2e.mjs` (the stand-in logs its argv). | differs: per app-server launch, not per turn |
| 9 | `codex_runner.rs` `default_answer` gives user input `{answers: {}}` and elicitation `cancel`. Every other unknown request gets a JSON-RPC error (-32601). Approvals always go to the UI, never to an automatic `accept`. | same for user input, elicitation and permissions; approvals are shown to the user |
| 10 | Approval cards show the decisions Codex offers in `availableDecisions`, which can include `cancel` ("Deny and stop"). Without that list they show `accept`, `acceptForSession`, `decline` and `cancel`. | superset |

## Not verified

- How Conductor's UI renders Codex items (tool rows, reasoning, plan). Screen capture of Conductor is blocked; see `evidence/runtime/README.md`.
- Whether Conductor downloads its own Codex (`agent-binaries/codex-0.156.1`) or prefers a `codex` already on PATH. The download is in `evidence/runtime/first-run-files.tsv`; the selection logic was not traced.
