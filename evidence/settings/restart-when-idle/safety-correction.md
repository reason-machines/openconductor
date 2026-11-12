# Fail-closed correction checkpoint

Conductor Rebuild retains PR #1188 and the existing SAME49/49-06App4 continuation `27994a6c-ba09-46a0-8c8c-034cea1760f7`. This is source preparation, not runtime admission or passing behavior evidence.

## Focused candidate

`fail-closed-candidate.patch` changes only `isIdle` in the existing coordinator. It admits the known quiescent session states `idle` and `error` instead of excluding just three busy values. All three `needs_*` statuses, `waiting`, active work and unknown values therefore block each existing checkpoint. Workspace readiness similarly admits only known inactive states. `unknown` readiness and running setup remain blocked. No refresh, install, drain, restart, persistence-owner or UI sequencing changes are proposed.

The patch remains unapplied until the frozen safety regression observes the fault. The production coordinator and all frozen fixtures remain unchanged. A negative result is only behavioral RED when setup succeeds and assertions exercise the production predicate.

## Current source and reference evidence

Source review on 2026-11-12 checked default-branch commit `2ea1c47f776a5cfa50478992609304a1dbcf8bfe`, published candidate `659e06a809cd6a1b11e47d4302fd4d8852a7872f`, and local checkpoint `adfcbc4f3b5b3a05dccb9b7ee7a42110fca9472f`. Fetching the candidate and comparing its `src` tree with the local checkpoint found no differences. This review did not execute product code or tests.

The active-wait defect is source-confirmed in the PR candidate, not a demonstrated failure of main. Main has no `src/features/updates/restartWhenIdle.ts`. Its existing chat runtime supplies the legitimate inputs that expose the candidate's incomplete predicate.

1. Main `chatRuntime.ts` maps permission, plan, and question prompts to the three `needs_*` statuses at lines 116-132. `permissionEvents.requested` passes open requests through `Q.waitingOn` at lines 532-540. `setQueue` reports the resulting status at lines 551-556. Main `queue.ts` keeps each such status in `turnRunning`. These status transitions are existing production paths, not invented fixture values.
2. Candidate `useIdleReadiness.ts` lines 65-69 forwards `chatStatuses().values()` without translating a wait to `working` or `waiting`. The candidate's chat status changes do not alter the existing prompt classification. A hydrated, connected, ready workspace with no setup script can therefore yield ready input containing a `needs_*` status.
3. Candidate `restartWhenIdle.ts` lines 15-18 excludes only `working`, `cancelling`, and `waiting`. None of the three active-wait statuses matches that exclusion. For ready input with a ready workspace, no running setup, and only an active-wait session, the predicate admits installation. The same predicate guards the post-install and post-drain checks at lines 29-33 and 48-63. If the other checks and acknowledgments succeed, the source path permits restart while a turn still awaits the user's response.

The user impact is conditional restart during a pending permission, plan, or question. No interrupted native session, lost response, or data loss has been observed. Owner10 executed zero cases, and safetyIntegration remains NOT_RUN. The source trace establishes the logical defect without claiming that those fixtures reproduced it.

`{ kind: "unknown" }` readiness already fails closed. Unrecognized lifecycle strings are a separate defensive case, not an observed current-main defect. Main `receivedStatus` rejects unknown session statuses at lines 396-404, and candidate `useIdleReadiness.ts` rejects unknown workspace states before publishing a ready snapshot. The retained unknown-value assertions protect the predicate's contract and future callers; they do not establish that current external inputs bypass those validation paths.

Main `crates/openconductor-db/src/workspaces.rs` defines eight workspace states. The proposed allowlist permits its five inactive variants. Initializing, setup, archiving, and unrecognized states stay blocked. The prepared patch remains unapplied so the existing admitted continuation can first observe the unchanged supplemental regression, as requested by the creating Session. There is no added approval gate, queue row, or executor.

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

Only source review, patch applicability, frozen-byte identity and whitespace checks were performed for this checkpoint on Cloud352. No test, typecheck, install, build, browser, native, package or agent-provider work ran. Repository fetches and PR metadata reads ran to establish the exact source identities. App4 and coordinator32 passing results in README are historical and do not validate this unapplied patch. Corrected Owner10 and safety integration remain NOT_RUN. Native/release acceptance remains NOT_RUN. PR #1188 must not merge with the known defect, even if hosted CI passes.
