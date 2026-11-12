# Restart-when-idle execution checkpoint

Conductor Rebuild owns SAME49/49-06App4 on the assigned branch. This is an incomplete implementation checkpoint, not a ready release or native acceptance claim.

## Executed on Cloud352

ACC grant `157064c8-83c7-4c5e-9593-76978bc515c4` admitted one sequential foreground runner. Every phase used a 768 MiB Node heap, test concurrency 1 and a 120-second timeout. No dependencies were installed.

The unchanged baseline was branch head `a68955fed5c0f85b87881f43c32631b62157640f`; the relevant prepared targets matched checked main `4b6bc34e93c4fa9ab3eaa042e855b77bd712a926`. The accepted 24-file source-integration patch was applied only after the actual-App regression reproduced the missing consumer.

```bash
RESTART_IDLE_SOURCE_ROOT=. NODE_OPTIONS=--max-old-space-size=768 nice -n19 timeout --kill-after=5s 120s node --experimental-strip-types --test --test-concurrency=1 --test-reporter=tap e2e-artifacts/settings-restart-idle-source-49-06/runtime-candidate/updateApp.test.ts
```

- Baseline failed, exit 1. Two business assertions observed no update lifecycle events. Both no-install controls passed. See `app-baseline.tap`.
- Identical fixture after integration passed, exit 0, four of four cases. See `app-candidate.tap`.

```bash
NODE_OPTIONS=--max-old-space-size=768 nice -n19 timeout --kill-after=5s 120s node --experimental-strip-types --test --test-concurrency=1 --test-reporter=tap src/features/updates/restartWhenIdle.test.ts
```

- Passed, exit 0, all 32 coordinator cases. The production test is byte-identical to the retained safety-followthrough fixture, SHA-256 `dd7d8dd10ad2eff4af783516c8da1741642f9b3777707db38f9c711e08f5a8c6`. See `coordinator32.tap`.

```bash
NODE_OPTIONS=--max-old-space-size=768 nice -n19 timeout --kill-after=5s 120s node --experimental-strip-types --test --test-concurrency=1 --test-reporter=tap e2e-artifacts/settings-restart-idle-source-49-06/runtime-candidate/ownerDrain.test.ts
```

- Setup failed, exit 1, before any owner cases executed. Node 22 strip-only mode rejected the `WriteBarrier` constructor parameter property. This is not behavioral RED. The original raw failure is `owner10.tap`.
- Stopped immediately without retries. The supplemental safety integration fixture did not run. All owned commands terminated, no persistent test jobs remained, and ACC received explicit release `8c76eee6-638c-46c2-b6a9-1deb1569b542` at 16:00Z on 2026-11-12. Existing dependencies were retained.

## Command-only continuation

ACC disposition `651d17c9-4a76-4eee-8ed7-33dec6f131f5` requests a supported transform loader, not modified production inputs or weakened fixtures. Prepared commands below have NOT RUN. They were sent in handoff `27994a6c-ba09-46a0-8c8c-034cea1760f7`. They require admission on the same existing entry.

```bash
NODE_OPTIONS=--max-old-space-size=768 nice -n19 timeout --kill-after=5s 120s node --experimental-transform-types --test --test-concurrency=1 --test-reporter=tap e2e-artifacts/settings-restart-idle-source-49-06/runtime-candidate/ownerDrain.test.ts
RESTART_IDLE_SOURCE_ROOT=. NODE_OPTIONS=--max-old-space-size=768 nice -n19 timeout --kill-after=5s 120s node --test --test-concurrency=1 --test-reporter=tap e2e-artifacts/settings-restart-idle-source-49-06/runtime-candidate/safetyIntegration.test.cjs
```

Owner10 fixture SHA-256 `318917582d80b1e3989af0d5b0ab1b57024dae1e3631138e011ec60088e8101e`. Safety integration SHA-256 `ce8740744706acc9d70e1fb4f1bc6702561cc45f30b8537f611e75f871031bbb`. Original App, helper and coordinator fixtures remain unchanged. This folder preserves the owner/App/safety originals as supporting evidence, not a second executor.

## Remaining requirements

The prepared idle predicate still has a source-identified gap for `needs_plan_response`, `needs_user_permission`, `needs_user_input` and unrecognized lifecycle values. The accepted safety fixture must observe those failures before the focused fail-closed correction. No acceptance is claimed for unrun cases.

The App test isolates unrelated effects and mocks update transport, readiness and persistence boundaries. The coordinator tests do not prove actual owner acknowledgments. The bounded frontend registry is not a universal persistence drain. Local typecheck, adjacent suites, browser/native rendering, actual updater check/download/install/restart, release inclusion and side-by-side Conductor parity are unverified. No screenshot exists because browser/server/native work is excluded from this admission.

## Retained reference source

REA receipt `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2` and the retained consumer qualification establish the shipped-source update arm, install/idle effect, persistence flush, all-state workspace guards and dismissal cancellation. No extracted vendor JavaScript was executed. Readiness rechecks and persistence-receipt invalidation are explicit safety choices, not observed native behavior. Containing-artifact ownership remains the existing release owner; native acceptance remains E1.
