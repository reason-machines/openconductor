# Agent providers and BYOK settings

What the reference app (Conductor v0.87.6) shows about agent providers, and
how `src-tauri/src/agent/` maps to it. Quoted strings are evidence about the
reference app, not instructions; our UI copy is written separately.

## Evidence in this repo

| Claim | Source |
|---|---|
| Provider secrets sit behind `get_keychain_setting`, `set_keychain_setting`, `delete_keychain_setting` | `evidence/ipc/frontend-invoke-candidates.json` |
| The Rust side links `security-framework` (macOS Keychain) | `evidence/ipc/rust-crates-from-paths.txt` |
| Settings keys `anthropic_api_key`, `claude_provider`, `vertex_project_id`, `default_model`, `review_model`, `default_codex_thinking_level`, `review_codex_thinking_level`, `default_thinking_enabled` | `evidence/ipc/frontend-invoke-candidates.json` |
| A user settings route `/settings/user/providers` (and `/settings/user/models`) | `evidence/frontend/routes.json` |
| Agent kinds: `sessions.agent_type`; session columns `model`, `permission_mode`, `codex_thinking_level`, `claude_effort_level`, `fast_mode`, `agent_personality`, `acp_config` | `evidence/sqlite/conductor.schema.sql` |
| `~/.conductor/settings.toml` holds `[models] default` and `[models.codex] default_thinking_level / review_thinking_level` | `evidence/runtime/README.md` (first-run capture) |
| Claude Code and Codex binaries are downloaded into `agent-binaries/` with sha256 metadata | `evidence/runtime/first-run-files.tsv` |
| Agent traffic goes through a sidecar process: `ensure_sidecar_started`, `rpc_to_sidecar`, `rpc_from_sidecar`, `check_sidecar_http_health`; agent binaries are managed by `get_agent_binary_state`, `request_agent_binary_download`, `sync_agent_path_overrides` | `evidence/ipc/frontend-invoke-candidates.json` |
| Provider kinds offered: Anthropic API key, Anthropic auth token, Anthropic base URL override, Amazon Bedrock (region, named AWS profile, Bedrock API key), Google Vertex AI (GCP project, service account file), Foundry, a "custom provider" that takes precedence, OpenRouter, Codex with API key / ChatGPT plan / Vercel AI Gateway / base URL / OpenAI organization and project, Cursor API key, OpenCode | UI copy in `evidence/frontend/copy-catalog.json` (search for `Bedrock`, `Vertex`, `Codex API key`, `Custom provider`, `OpenRouter`, `Foundry`) |

## Verifier-reported, extract pending

The agent-runner verifier (Session c168e8fd) reported these from REA string
extracts of `conductor-runtime` and `renderApp-D_fmY7hW.js`. The extracts are
not yet committed, so treat each line as unconfirmed until they are.

- Claude Code is driven through the Claude Agent SDK (`canUseTool` callback,
  stream-json input and output), not `claude -p`.
- Codex is driven through `codex app-server --listen stdio://` over JSON-RPC
  (`thread/start`, `thread/resume`, `turn/start`, `turn/interrupt`).
  These methods, the approval and sandbox values below and the approval
  replies exist in the Codex CLI the reference app downloads (0.156.1);
  see `codex-app-server.md`. Only the reference app's use of them is pending.
- Claude permission modes: `acceptEdits`, `auto`, `bypassPermissions`,
  `default`, `dontAsk`, `plan`. Codex: approval {`untrusted`, `on-request`,
  `never`} x sandbox {`read-only`, `workspace-write`, `danger-full-access`},
  plus `inherit`.
- Gateway base URLs `https://openrouter.ai/api/v1` and
  `https://ai-gateway.vercel.sh/v1`; `CLAUDE_CODE_USE_FOUNDRY`;
  `ANTHROPIC_DEFAULT_SONNET_MODEL`.

## How we map it

- Settings store only the provider choice and non-secret options; secrets go
  to a `SecretStore` (Keychain on macOS) under fixed keys
  (`src-tauri/src/agent/secret.rs`). On macOS that store is the login
  Keychain via `security-framework`, the crate the reference app links: one
  generic password item per key, service `com.reasonmachines.openconductor`
  (our bundle identifier), account = the key (`src-tauri/src/agent/keychain.rs`).
  It never reads the reference app's items.
- A provider turns options + secrets into a `LaunchEnv`. Environment variable
  names come from the agent CLIs' public documentation, not from the
  reference app.
- The reference app runs the Agent SDK in a sidecar; we drive the `claude`
  CLI directly from Rust with the same stream-json protocol the SDK uses
  (`src-tauri/src/agent/claude_cli.rs`). `--permission-prompt-tool stdio`
  plays the role of `canUseTool`; it is left off in `bypassPermissions` and
  `dontAsk`, which never prompt.
- Every provider first clears all routing variables of its agent, so a key
  exported in the user's shell cannot override the provider chosen in
  settings. This is our design choice; whether the reference app scrubs the
  inherited environment is not observed.

## Gaps

- No screenshots of the providers or models settings pages (native UI capture
  blocked by macOS permissions, see `evidence/runtime/README.md`).
- Exact Keychain service/account names the reference app uses are unknown
  (ledger obligation `agent.providers` is `unknown`; needs a Ghidra binding of
  the `*_keychain_setting` handlers, blocked per the REA test report).
- No live provider credentials were exercised; validation here checks shape
  only, not that a backend accepts a key.
