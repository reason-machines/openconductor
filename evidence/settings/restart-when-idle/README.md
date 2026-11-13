# Restart-when-idle execution checkpoint

Conductor Rebuild owns SAME49/49-06App4 on the assigned branch. The active-wait predicate correction passed the admitted safety suite. This is not a release or native acceptance claim.

## Latest safety continuation passed on Cloud352

ACC grant `37fa2b01-86ed-4425-992e-911f77edd298` admitted the existing `27994a6c` continuation. At local head `7838d77520468cabac3ded127e62e34ed797f966`, the selector-qualified baseline ran once, followed by only the sealed two-expression predicate correction and the identical candidate command once. Execution ran from 16:50:48Z to 16:51:24Z on 2026-11-12.

```bash
RESTART_IDLE_SOURCE_ROOT=. NODE_OPTIONS=--max-old-space-size=768 nice -n19 timeout --kill-after=5s 120s node --test --test-concurrency=1 --test-reporter=tap evidence/settings/restart-when-idle/safetyIntegration.selector-loader.test.cjs
```

- **Baseline failed as intended**, exit 1. All 27 cases executed, with 13 predicate assertion failures and 14 passing controls. There were no unrelated errors. [Raw baseline TAP](safety-qualified/baseline.tap).
- **Identical candidate passed**, exit 0. All 27 cases passed, including active permission, plan, and question waits at each checkpoint, unknown-value controls, real persistence owners, and selector-backed store dispatch. [Raw candidate TAP](safety-qualified/candidate.tap).
- **Frozen inputs preserved.** The derivative SHA-256 remains `b81486849e6da03bfd7cf4441d1f3177ca5fa49ea581cd9763fce0e9048f961d`; the original remains `ce8740744706acc9d70e1fb4f1bc6702561cc45f30b8537f611e75f871031bbb`. The applied patch matches retained `09b3e7cbf0f711ba09982e92f30df37bc13a3929d7b3345a1a1661b232aaa632`. [Before](safety-qualified/source-before.txt) and [after](safety-qualified/source-after.txt) snapshots retain the source and lock hashes.
- **Stopped and released.** All own jobs are terminal and the runtime slot was explicitly released. [Release receipt](safety-qualified/release.json). No App4, coordinator32, or Owner10 replay, installation, typecheck, build, browser, native, provider, or package work ran.

The correction now admits only known quiescent session and workspace states. It fixes the reproduced pending-response restart defect. Exact-head hosted CI must pass before merge. Native updater behavior and package inclusion remain unverified with their existing owners.

## Initial execution on Cloud352

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

ACC disposition `651d17c9-4a76-4eee-8ed7-33dec6f131f5` requests a supported transform loader, not modified production inputs or weakened fixtures. The following commands were subsequently run once in the bounded continuation described below. They were originally sent in handoff `27994a6c-ba09-46a0-8c8c-034cea1760f7`. They require admission on the same existing entry.

```bash
NODE_OPTIONS=--max-old-space-size=768 nice -n19 timeout --kill-after=5s 120s node --experimental-transform-types --test --test-concurrency=1 --test-reporter=tap e2e-artifacts/settings-restart-idle-source-49-06/runtime-candidate/ownerDrain.test.ts
RESTART_IDLE_SOURCE_ROOT=. NODE_OPTIONS=--max-old-space-size=768 nice -n19 timeout --kill-after=5s 120s node --test --test-concurrency=1 --test-reporter=tap e2e-artifacts/settings-restart-idle-source-49-06/runtime-candidate/safetyIntegration.test.cjs
```

Owner10 fixture SHA-256 `318917582d80b1e3989af0d5b0ab1b57024dae1e3631138e011ec60088e8101e`. Safety integration SHA-256 `ce8740744706acc9d70e1fb4f1bc6702561cc45f30b8537f611e75f871031bbb`. Original App, helper and coordinator fixtures remain unchanged. This folder preserves the owner/App/safety originals as supporting evidence, not a second executor.

## Remaining requirements

The active `needs_plan_response`, `needs_user_permission`, and `needs_user_input` predicate defect is corrected and passed the latest admitted 27-case suite above. The [source correction record](safety-correction.md) preserves the original reachable control path and historical mixed baseline. Unknown lifecycle strings are defensive contract controls, not an observed external-input bypass. Merge still requires every enabled exact-head workflow to pass.

The App test isolates unrelated effects and mocks update transport, readiness and persistence boundaries. The coordinator tests do not prove actual owner acknowledgments. The bounded frontend registry is not a universal persistence drain. Local typecheck, adjacent suites, browser/native rendering, actual updater check/download/install/restart, release inclusion and side-by-side Conductor parity are unverified. No screenshot exists because browser/server/native work is excluded from this admission.

## Bounded continuation: Owner10 passed, safety baseline mixed

ACC grant `d000bf0a-4d22-4327-8801-0d8607cfb40b` admitted the existing `27994a6c` entry. Execution began at 16:38:52Z on 2026-11-12, at local commit `0467c69c6c17e343beb9cc2842760dbcb7a266ee` / published head `d1e6606b3d0876c4ec5e2b668fdd6187ee46ac35`. [Before](continuation-source-before.txt) and [after](continuation-source-after.txt) snapshots record source/lock hashes and all five frozen identities. The ordinary-field changes to `owner.ts` and `producer.ts` are an explicit product-source compatibility delta from the earlier App4/32 checkpoint; these executions are not represented as byte-identical to that earlier product source.

- **Owner10 passed:** the exact transform-types command above exited 0, 10/10 cases. [Raw TAP](owner10-transform.tap). The original strip-only setup failure remains unchanged in `owner10.tap`.
- **Safety baseline failed, mixed:** the exact frozen command above exited 1, 27 cases: 13 passed, 13 intended idle-predicate assertions failed, and case 23 independently failed with `(0 , selectors_1.isSidebarVisible) is not a function`. [Raw TAP](safety-baseline-mixed.tap). Nine intended failures cover the three active `needs_*` statuses at pre-install, post-install, and post-drain; four cover defensive unknown status/state contracts. This now reproduces the predicate defect, but it is not a clean full-suite behavioral RED.
- **Stopped/released:** no safety patch or candidate run followed the unrelated fixture error; no automatic retry, App4/32 replay, install, typecheck, build, browser or native work ran. [Release receipt](continuation-release.json) confirms all own jobs terminal and the runtime slot released.

The [selector-loader derivative](safetyIntegration.selector-loader.test.cjs) removes only the incomplete `state/selectors.ts` mock so the existing recursive loader evaluates that real pure production module. Every input and assertion is preserved, and frozen original `safetyIntegration.test.cjs` remains byte-identical. Derivative SHA-256: `b81486849e6da03bfd7cf4441d1f3177ca5fa49ea581cd9763fce0e9048f961d`. It subsequently ran in the admitted baseline and candidate phases recorded above, using this identical command:

```bash
RESTART_IDLE_SOURCE_ROOT=. NODE_OPTIONS=--max-old-space-size=768 nice -n19 timeout --kill-after=5s 120s node --test --test-concurrency=1 --test-reporter=tap evidence/settings/restart-when-idle/safetyIntegration.selector-loader.test.cjs
```

At this historical mixed baseline, the fail-closed patch remained unapplied. The later admitted continuation above applied it and passed the complete qualified safety suite. Owner10 success alone does not establish native or package acceptance.

## Hosted CI compatibility repair

The [frontend job at head `204c9a3c`](https://github.com/reason-machines/openconductor/actions/runs/43257494478/job/131319575943) passed `npm run typecheck`, then failed `node --test "src/**/*.test.ts"`: 3,640 passed and 93 failed, exit 1. Build and subsequent steps were skipped. [Extracted diagnostics](ci-204c9a3-diagnostics.json) retain the observed loader errors. This is actual hosted failure evidence, separate from the earlier bounded App4/32 passes and Owner10 setup failure.

The compatibility correction replaces constructor parameter properties in the new persistence modules with ordinary typed fields and assignments, preserving behavior while supporting the existing Node strip-only runner. Strict VM fixtures now admit the real persistence modules instead of failing on their new imports. Home/section fixtures continue to isolate the unrelated update effect; the frozen update-App fixture is unchanged. The sign-in continuation receipt extends its execution graph to the real registry/barrier, preserving the frozen fixture and historical source pins. No assertion was removed or weakened, and no workflow trigger, test command, timeout or gate changed.

Static `git diff --check` and all five `frozen.sha256` identities passed on Cloud352. The frozen sign-in continuation remains SHA-256 `9b3d03de095956357d3e81e0290e2f4b214b849b5620dedc60f42d3bf245efcc`. No local tests, typecheck, install or build ran for this repair; exact-head hosted CI must verify it. The later ACC `27994a6c` continuation results above supersede the pending Owner10 and safety statuses. This compatibility change alone did not correct the active-wait defect; the later two-expression correction did. Native/package/release acceptance is still NOT_RUN.

## Retained reference source

REA receipt `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2` and the retained consumer qualification establish the shipped-source update arm, install/idle effect, persistence flush, all-state workspace guards and dismissal cancellation. No extracted vendor JavaScript was executed. Readiness rechecks and persistence-receipt invalidation are explicit safety choices, not observed native behavior. Containing-artifact ownership remains the existing release owner; native acceptance remains E1.
