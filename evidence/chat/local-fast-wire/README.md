# Per-chat local Fast carrier

Conductor Rebuild owns `composer-local-fast-per-chat-adapter-omission`. This increment starts with a frozen adapter regression against checked main `621ed16e9a24615a6bbecaf976be9589b70c0e5d`. Production carrier changes are not in the regression-only baseline.

## Original contract

[The source record](source.json) binds fresh Conductor 0.87.6 runtime bytes, five complete source declarations, REA evidence, and the retained source packet. Both macOS ARM64 helper pins in OpenConductor match the exact installed original helper hashes: Claude 2.1.284 and Codex 0.156.1. That establishes the built-in source composition, not an installed OpenConductor process identity or a custom executable's capability.

Claude's `qB5` produces `settings.fastMode: true` only when enabled. `Ln4` classifies Fast changes as recreation. `CB5` defers those changes when recreation is disallowed. An idle ordinary turn recreates the generator with `resumeForRestart`, which can return no identity when neither token nor resumable transcript exists. Initial and ordinary resumed launches use the same settings constructor. This is source intent, not observed continuity.

Codex's ordinary `createSession` sends `serviceTier: "fast"` or explicit null to `thread/start` and `thread/resume`. `runTurn` sends the same value from the current configuration through `ks.runStreamed` to `turn/start`. The separate rollback resume path uses undefined when off and is outside this fix. A global `service_tier` override is not the per-chat contract.

A saved Claude off selection can use the pinned helper's supported `settings.fastMode: false` value. The helper schema explicitly describes false as off, and the CLI supports inline JSON settings. This is an explicit override design choice, not a claim that the original false-omission wire bytes are identical. Unset selections must preserve existing defaults. The patch must not mutate global settings or overwrite unrelated launch settings.

## Frozen adapter regression

`src/features/chat/localFastWire.test.ts` has nine cases. Four require recognized local Claude and Codex selections to forward saved on and off together with their exact model and effort. Five controls preserve other-agent isolation, Reason isolation, untouched-chat behavior and unsupported-Claude behavior.

The fixture's SHA-256 is recorded in [fixture.sha256](fixture.sha256). Existing 22 Fast control cases remain unchanged. The expected baseline result is four missing-carrier failures and five passing controls; no actual execution result is claimed until ordinary hosted CI reports it.

```bash
node --test src/features/chat/localFastWire.test.ts
```

Before publication, `npm run typecheck`, the two helper-pin hash comparisons, the 27-check offline source verifier, and `git diff --check` passed. No local behavioral test, manual dispatch, rerun, provider process or native UI execution was used.

## Limits

REA parsed five source slices with zero skips or parse failures. The selected graph remains partial with 4,894 semantic unknowns. Source and schema facts do not establish provider eligibility, runtime policy precedence, actual selected custom helpers, a consumed application build, first-turn or resumed execution, visual parity or native acceptance. Six acceptance rows remain UNLINKED and NOT_RUN with E1. The canonical static-contract section is revision 79 of [the existing acceptance map](https://reasonmachines.com/agents/acc3b5c5-8a01-407e-b474-42e914e3cf90?page=5f784799-da5e-4501-b0ee-41e83a635167).

No screenshot exists because this carrier baseline changes tests and source evidence only. No deployment is claimed. PR #1126's consuming-main verification remains with its existing bounded event watch.
