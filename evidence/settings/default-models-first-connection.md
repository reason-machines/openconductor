# Default models and first connected runtime

Scope: Sven's item 5, 2026-11-08. Owner: Conductor Rebuild.

## Reference and deliberate adaptation

The retained REA extraction of the real `/Applications/Conductor.app` establishes the five-slot loadout, default first slot, per-agent palette and favorite-model persistence. See [agents reference](agents-screens/README.md), lines 52–61 (`$3a`, `M3a`), and [settings notes](NOTES.md), lines 127–151. The reference screenshots are `local-pages/ref-models.png` and `../screens/settings--default-models--dark.png`.

The Reason Machines column, curated ordering and first-successful-runtime default are Sven's explicit adaptations, not claims that Conductor has those features. Reason's live `models_list` returned all nine exact IDs on 2026-11-08. Only model IDs and public labels were retained, never model-source accounts or credentials:

- `byok:anthropic:claude-opus-5-5`
- `byok:anthropic:claude-fable-5-1`
- `byok:anthropic:claude-sonnet-5-5`
- `byok:anthropic:claude-haiku-5-5`
- `byok:anthropic:claude-opus-4-8`
- `byok:openai:gpt-6.1-sol`
- `byok:openai:gpt-6.1-terra`
- `byok:openai:gpt-6-astra`
- `byok:openai:gpt-6-luna`

## Behavior

- Columns are Reason Machines, Claude Code, Codex. The nine curated Reason models are always visible. Only a successful Reason account/API status enables the live remaining-model search below them.
- Fresh native settings have `models.default_initialized = false`; slot 1 is empty until a connection or explicit choice. Authentication observers call the settings service only after reporting success, never when merely switching authentication cards.
- The settings service's write lock latches the first successful runtime once. Reason uses its configured model or the known gateway model `openai/gpt-6.1-sol`; Claude Code and Codex use their existing runtime defaults. Repeated/later connections and restart do not replace it.
- Legacy files with an explicit `[models] default` and no latch retain that model, including `opus`. An unrelated save of fresh settings does not count as a connection. A stale pre-connection save cannot undo the winner.
- New workspace chats and new blank chat tabs pin the chosen runtime before opening. Existing chats and explicit per-chat picks do not change.
- Selecting a Reason model stores its full Reason ID and runtime in favorites and settings, rather than treating the ID as a Claude model.

## Verification and gaps

- Before fix: the four new loadout regressions against the original `loadout.ts` produced 3 failures, 1 pass. Failures were the fresh empty slot, Reason runtime/ID persistence, and explicit local runtime persistence.
- After fix: focused loadout/catalog/new-chat tests pass. Full frontend suite passes (1,477 tests), TypeScript check passes, production frontend build passes, color lint passes.
- Rust service regressions cover all six connection permutations, disk reload/restart, a stale pre-connection save, legacy explicit settings, a configured Reason model, and an explicit later model selection. Local Rust tests were not run because this Linux computer lacks GTK/WebKit development libraries; the PR's macOS Rust test job is the authoritative run.
- Native main-build connected and disconnected screenshots are NOT RUN. Sole native executor `e1e2b6b9-97cc-4ddc-ba9e-533d89eeeb46` reports the real Conductor exact-window REA capture was denied Screen Recording. The responsible host was not established. Existing access handoff and isolated destination are centrally owned and unresolved; no duplicate capture or permission workaround was attempted.
- A successful macOS package build is not evidence that either native connection state was visibly verified or that a release was installed.
