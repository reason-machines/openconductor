# Per-chat local Fast carrier

Conductor Rebuild owns `composer-local-fast-per-chat-adapter-omission`. This increment starts with a frozen adapter regression against checked main `621ed16e9a24615a6bbecaf976be9589b70c0e5d`. The regression-only baseline was published before the production correction.

## Original contract

[The source record](source.json) binds fresh Conductor 0.87.6 runtime bytes, five complete source declarations, REA evidence, and the retained source packet. Both macOS ARM64 helper pins in OpenConductor match the exact installed original helper hashes: Claude 2.1.284 and Codex 0.156.1. That establishes the built-in source composition, not an installed OpenConductor process identity or a custom executable's capability.

Claude's `qB5` produces `settings.fastMode: true` only when enabled. `Ln4` classifies Fast changes as recreation. `CB5` defers those changes when recreation is disallowed. An idle ordinary turn recreates the generator with `resumeForRestart`, which can return no identity when neither token nor resumable transcript exists. Initial and ordinary resumed launches use the same settings constructor. This is source intent, not observed continuity.

Codex's ordinary `createSession` sends `serviceTier: "fast"` or explicit null to `thread/start` and `thread/resume`. `runTurn` sends the same value from the current configuration through `ks.runStreamed` to `turn/start`. The separate rollback resume path uses undefined when off and is outside this fix. A global `service_tier` override is not the per-chat contract.

A saved Claude off selection can use the pinned helper's supported `settings.fastMode: false` value. The helper schema explicitly describes false as off, and the CLI supports inline JSON settings. This is an explicit override design choice, not a claim that the original false-omission wire bytes are identical. Unset selections must preserve existing defaults. The patch must not mutate global settings or overwrite unrelated launch settings.

## Frozen adapter regression

`src/features/chat/localFastWire.test.ts` has nine cases. Four require recognized local Claude and Codex selections to forward saved on and off together with their exact model and effort. Five controls preserve other-agent isolation, Reason isolation, untouched-chat behavior and unsupported-Claude behavior.

The fixture's SHA-256 is recorded in [fixture.sha256](fixture.sha256). Existing 22 Fast control cases remain unchanged. Automatic hosted run [43157189376](https://github.com/reason-machines/openconductor/actions/runs/43157189376) on exact baseline `2f47f5301cca61cd6a4cd0a3cb6d02d50a35835f` produced the four intended missing-carrier assertion failures and five passing controls in both frontend jobs. Model, effort and saved on/off assertions passed before each complete-options comparison exposed the missing `fastMode` key. [The original unit-job excerpt](hosted-red.json) retains the actual failure details. Typecheck passed; build was skipped after the test failure.

```bash
node --test src/features/chat/localFastWire.test.ts
```

## Correction

The matching local adapter now forwards an explicit Fast boolean only for supported models. Reason, other-agent and unsupported-model choices retain their existing boundaries. Claude's nested options use a field-level `fastMode` serde rename. Its runner merges the selected boolean into owned launch settings, preserving unrelated keys and inherited settings when the option is unset. Existing option equality drives idle restart and resume intent. Busy changes still reject without a new user write; original in-flight deferral is not implemented or claimed.

Codex owns model, effort and Fast together in each queued `TurnOptions` snapshot. The command resolves an unset choice from the app default when it accepts the prompt. Chat launches no longer carry the process-wide `service_tier` override; that default is carried as a request option instead, so explicit off is not masked by the launch. The current prompt's choice reaches initial open, resume, failed-resume fallback, reopened processes and ordinary live turns. Fast changes do not restart a live Codex process. Other settings and review launches are unchanged.

Foundational Thinking selected the owned per-prompt snapshot instead of a shared mutable Fast flag. Type System Discipline kept absent, true and false distinct through the request serializer and limited camelCase decoding to the new Claude field.

## Correction checks

- Passed `npm run typecheck`, `git diff --check`, and the unchanged nine-case fixture hash check.
- Passed formatter checks and isolated agent compilation plus Clippy with warnings denied. `bash tools/agent/run-rust-tests.sh --no-run` compiled test binaries without running them. A session-local tool cache supplied formatter and lint components because the shared tool installation is read-only.
- Full local `cargo check --manifest-path src-tauri/Cargo.toml --lib --tests` failed in the native dependency build because GLib development metadata is missing. It did not reach application code. Ordinary hosted Tauri compilation and tests remain required.
- Nine added backend tests cover serde shape, owned Claude settings merge, initial/resumed launch, unchanged reuse, idle on-to-off restart, busy rejection, explicit-null serialization, queued Codex choices and exit/reopen behavior. These behavioral tests have not been run locally and await hosted execution.
- Before the correction, both helper-pin hash comparisons and 27 offline source/hash assertions passed. Those source checks are not application acceptance.

No local behavioral test, manual dispatch, rerun, provider process or native UI execution was used.

## Limits

REA parsed five source slices with zero skips or parse failures. The selected graph remains partial with 4,894 semantic unknowns. Source and schema facts do not establish provider eligibility, runtime policy precedence, actual selected custom helpers, a consumed application build, first-turn or resumed execution, visual parity or native acceptance. Six acceptance rows remain UNLINKED and NOT_RUN with E1. The canonical static-contract section is revision 79 of [the existing acceptance map](https://reasonmachines.com/agents/acc3b5c5-8a01-407e-b474-42e914e3cf90?page=5f784799-da5e-4501-b0ee-41e83a635167).

No screenshot exists because this carrier baseline changes tests and source evidence only. No deployment is claimed. PR #1126's consuming-main verification remains with its existing bounded event watch.
