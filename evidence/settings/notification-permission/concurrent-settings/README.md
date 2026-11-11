# Concurrent settings during notification permission

Conductor Rebuild adds one independent component regression after the notification-permission fix in [#1051](https://github.com/reason-machines/openconductor/pull/1051). It mounts the real GeneralPage and applies a parent settings update while the permission request is pending. Once permission is granted, the notification save must preserve the changed sound, unknown General field, and unknown top-level field.

The original seven-case fixture and harness are unchanged. This follow-up changes no product source, permission boundary, persistence code, dependency, or workflow.

## Qualified historical pair

The existing serialized Reason cloud runner executed exactly two commands against sealed candidate `c3b81f1b56bf548e2816e323c55dde853ad34e9d` and its single-callback stale-snapshot mutant. Both used the unchanged new test, SHA-256 `1eaa36d4a960910a76dcaac91dde73c753cf27bbe3f18c9445d0c5d8795ae251`.

```bash
NOTIFICATION_DEPS=<retained-dependency-root> NOTIFICATION_SOURCE_ROOT=<candidate-root> node --test --test-reporter=tap concurrentSettings.test.cjs
NOTIFICATION_DEPS=<same-retained-root> NOTIFICATION_SOURCE_ROOT=<mutant-root> node --test --test-reporter=tap concurrentSettings.test.cjs
```

The candidate passed one test with exit 0. The mutant failed one test with exit 1 at line 137, with `ERR_ASSERTION` and `deepStrictEqual`. Its only change replaces `latestSettings.current` with captured callback `settings`. All three intervening values were lost. Neither run had setup or import errors, skipped tests, cancellation, or retries.

The runner retained React 18.3.1, react-test-renderer 18.3.1, and TypeScript 5.9.3. It applied a 384 MiB heap limit, niceness 19, a 10-second per-process CPU limit, and a 45-second wall limit. Both process groups were observed empty at release. All 2,313 physical source, dependency, lock, and binary pins were reverified unchanged. Sampled resource observations are not universal hard limits.

`candidate.tap` and `stale-snapshot-mutant.tap` retain the combined stdout and stderr, with trailing horizontal whitespace removed and no lines omitted. `proof.json` records original and committed hashes, the exact packet identities, source pins, result counts, and release. This owner verified the original 155,413-byte result archive and all 27 manifest entries without executing its preparation or runner scripts.

## Current-main CI integration

The publication base is `86fd4ee9d727deface07fec849b6af7702c3d762`. Six of the seven historical source modules still match, including GeneralPage; `src/workspace/naming.ts` has changed. The qualified pair proves the sealed candidate only, not fresh execution of the entire publication source graph.

`src/settings/notificationConcurrentSettings.test.ts` uses the existing CI-discovery pattern to run this independent test against the actual checkout. It clears inherited `NODE_TEST_CONTEXT` and requires one child test, one pass, and zero failures. The existing ordinary frontend command discovers this wrapper without a workflow change.

```bash
NOTIFICATION_DEPS="$PWD" NOTIFICATION_SOURCE_ROOT="$PWD" node --test --test-reporter=tap evidence/settings/notification-permission/replay/concurrentSettings.test.cjs
node --test src/settings/notificationConcurrentSettings.test.ts
```

The publication owner did not run additional local Node commands, dependency installation, native execution, workflow dispatch, or reruns. Fresh-base wrapper execution and full integration results come from normal automatic CI and are reported on the follow-up pull request.

## Limits

Permission and persistence are substituted. Native permission prompts, actual storage, notification delivery, installed-app behavior, and visual parity were not tested. No browser or native app was launched, so there is no screenshot. This is a discrimination check for the existing ref behavior, not a new baseline product defect or additional Conductor parity claim. The earlier REA heap-analysis gap remains recorded in the parent evidence document.
