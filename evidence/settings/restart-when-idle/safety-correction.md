# Fail-closed correction checkpoint

Conductor Rebuild retains PR #1188 and the existing SAME49/49-06App4 continuation `27994a6c-ba09-46a0-8c8c-034cea1760f7`. This is source preparation, not runtime admission or passing behavior evidence.

## Focused candidate

`fail-closed-candidate.patch` changes only `isIdle` in the existing coordinator. It admits the known quiescent session states `idle` and `error` instead of excluding just three busy values. All three `needs_*` statuses, `waiting`, active work and unknown values therefore block each existing checkpoint. Workspace readiness similarly admits only known inactive states. `unknown` readiness and running setup remain blocked. No refresh, install, drain, restart, persistence-owner or UI sequencing changes are proposed.

The patch remains unapplied until the frozen safety regression observes the fault. The production coordinator and all frozen fixtures remain unchanged. A negative result is only behavioral RED when setup succeeds and assertions exercise the production predicate.

## Current source and reference evidence

Read back current main `c603fdb8965daf5dd731bd9458656f99f85df4ac`. The readiness inputs and touched App/store/panel/toast sources are unchanged from the retained `4b6bc34e` reconciliation. Main `src/features/chat/queue.ts` enumerates the three `needs_*` active statuses and its `turnRunning` includes them. Main `crates/openconductor-db/src/workspaces.rs` defines the eight workspace states. The candidate permits its five inactive variants; initializing, setup and archiving remain excluded. Unknown future states are not silently idle.

Retained REA qualification `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2` and the shipped-source `Oaa` idle effect establish the update arm and idle consumer. The extra post-install/post-drain rechecks and unknown-state rejection are OpenConductor safety choices, not newly observed native Conductor behavior. No vendor code was executed.

The small two-expression patch follows the Laziness Protocol. Known-state admission at the external readiness boundary follows Type System Discipline without widening the coordinator or duplicating runtime state.

## Retained execution sequence

The original corrected command pair is unchanged. Both commands remain NOT_RUN and require the existing ACC admission. Do not rerun the passing App4 or coordinator32 checks merely to recreate their historical evidence.

```bash
NODE_OPTIONS=--max-old-space-size=768 nice -n19 timeout --kill-after=5s 120s node --experimental-transform-types --test --test-concurrency=1 --test-reporter=tap e2e-artifacts/settings-restart-idle-source-49-06/runtime-candidate/ownerDrain.test.ts
RESTART_IDLE_SOURCE_ROOT=. NODE_OPTIONS=--max-old-space-size=768 nice -n19 timeout --kill-after=5s 120s node --test --test-concurrency=1 --test-reporter=tap e2e-artifacts/settings-restart-idle-source-49-06/runtime-candidate/safetyIntegration.test.cjs
```

Preserve the original Owner10 strip-only setup failure. Stop and release on an actual prerequisite, timeout or unrelated failure. After observed predicate RED, apply the prepared patch and rerun the identical safety command only within an admission that covers that correction. Do not weaken fixtures, replace the existing entry, start a second executor or infer a new runtime grant from this document.

Safety fixture SHA-256 is `ce8740744706acc9d70e1fb4f1bc6702561cc45f30b8537f611e75f871031bbb`. Owner fixture SHA-256 is `318917582d80b1e3989af0d5b0ab1b57024dae1e3631138e011ec60088e8101e`.

## Verification limits

Only source review, patch applicability, frozen-byte identity and whitespace checks were performed for this checkpoint on Cloud352. No test, typecheck, install, build, browser, native, package or provider work ran. App4 and coordinator32 passing results in README are historical and do not validate this unapplied patch. Corrected Owner10 and safety integration remain NOT_RUN. Native/release acceptance remains NOT_RUN. PR #1188 must not merge with the known defect, even if hosted CI passes.
