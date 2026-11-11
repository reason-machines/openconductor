# Idle-safe local Claude Plan mode

Conductor Rebuild owns this increment. It connects the selected chat's persisted mode to the Composer and the local Claude runner. It does not claim native parity.

## Reference and current source

`source.json` pins current-main blobs, the complete retained Conductor 0.87.6 renderer identity, and four byte-ranged reference excerpts. The excerpts are from the retained REA-extracted renderer, not a fresh acquisition of the installed app. They show selected-session `permissionMode`, Plan mode and Exit plan mode menu labels, one toggle callback, and persistence by session ID. Existing low-level Claude protocol code supplies Plan launch arguments and the stdio approval channel.

Historical REA limits remain in `evidence/chat/rea-gaps.md`. No new REA invocation failed during this increment.

## State and dispatch

The existing SQLite `sessions.permission_mode` is authoritative. There is no new database migration or localStorage preference. New rows use the configured default once; later default-setting changes do not overwrite a saved choice.

The Add menu, `/plan`, and `chat.togglePlanMode` use the same selected-chat control. Delayed reads, writes, events, and stale callbacks cannot replace another selected chat's state. The UI uses the logical chat ID rather than Claude's `:claude` transcript alias. A failed save retains the last confirmed state.

Local commands serialize mode changes against dispatch. The backend rejects a toggle when the chat has an announced or running prompt. On its next prompt, an idle Claude chat restarts only if its effective launch options changed and resumes the same Claude session ID. Plan launches include `--permission-mode plan` and `--permission-prompt-tool stdio`. Leaving Plan restores the existing tool-approval setting, either Default or BypassPermissions. This restoration policy is an OpenConductor design choice, not a claim about unobserved Conductor behavior.

Approving a pending ExitPlanMode request writes logical Default before sending the answer, under the same per-chat operation lock. A failed answer restores the previous mode. Other answers do not change mode. A committed event updates the visible control.

Provider switching is unavailable while Claude's mode is unresolved, active, or saving. Codex has no Plan control in this increment. No Codex wire request, cloud execution path, cloud UI, or credential hand-off is added.

## Regression proof

The first PR checkpoint changed tests and evidence only. Hosted head `678c434666f04bfd43c035f0b1a07f17da086542` produced the six intended failures in `workspacePlanMode.test.ts`; both unsupported-provider negative controls passed. See `hosted-red.json`. The candidate preserves that fixture's exact SHA-256 and all existing assertions.

Additional regressions cover delayed reads and saves, stale callbacks, committed-exit events, SQLite mode isolation, boundary validation, dispatch serialization, normal approval restoration, and stand-in Claude launch/resume arguments.

Hosted commands exercise the candidate through the repository's existing workflows:

```bash
node --test "src/**/*.test.ts"
cargo test --locked
cargo clippy --all-targets -- -D warnings
```

Hosted candidate `9672b819cf06c56b604fd564186ab2bc88b8f51a` passed frontend unit tests and typecheck/build in [CI run 43092612674](https://github.com/reason-machines/openconductor/actions/runs/43092612674). The macOS and Linux Tauri app checks failed with `E0432` and `E0433`: the new persistence module uses `sqlx`, but the app declared it only under dev-dependencies. The macOS package and built-app jobs reproduced the same compile failure before app execution.

The correction moves the existing `sqlx` declaration to app dependencies without changing its version, features, or lockfile. Python TOML checks confirmed the declaration is identical, and the frozen regression fixture remains byte-identical to the RED checkpoint. Corrected-head hosted checks are pending. Static registration and consumer checks, frozen-fixture identity, and `git diff --check` passed. No local Node, Rust, browser, native, or provider execution was run because this lane has no local runtime admission.

## Remaining gaps

- Live switching during a turn is intentionally blocked. No optimistic stdin write or unacknowledged mode-control message is presented as success.
- Codex's retained receipt names `collaborationMode` but does not show its complete nested serialization or model requirements. Codex Plan remains unsupported. Pre-existing saved Codex mode is not interpreted by this Claude-only increment.
- No real CLI acceptance, native geometry, visual comparison, restart persistence through the built app, or signed-in provider behavior has been observed. There is no screenshot because native and browser execution are not admitted to this lane.
- Exact-head hosted checks and consuming-main package proof remain separate requirements. A package's inclusion of this code will not establish native or provider parity.
