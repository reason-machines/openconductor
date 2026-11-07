# Reason defaults clear from stale render handlers

Conductor Rebuild reproduced a Settings request-composition defect without a browser, native app, agent execution or new E2E run. This is an OpenConductor behavior finding, not a claim about Conductor.

## Source and original failure

[Initial #748 E2E run](https://github.com/reason-machines/openconductor/actions/runs/42320999768/job/128245257468) ran commit `7cf9cded4cca4d0c94a55d42e5e681312a89255f`. Artifact `13553935520/results.json` records only `agents-reason` failing with `timed out waiting for [reason] cleared`; the other 22 flows passed. The log places that failure at `2026-11-07T01:04:43.6037471Z`. The E2E owner's screenshot observation was a pinned `ws-b` workspace with model and effort cleared. That observation alone does not identify the cause.

The Settings hook, API, Reason tab, Reason model helpers and E2E flow have identical Git blobs on that failing commit, assigned baseline `840f1f9172742724fec6b05f759add07323a9d57`, and integrated main `afc91be9a68d35790c5abfe2d2cfbf929717d4ed`. [Provenance](provenance.json) records every blob. Final #748 head `e295f98f48b1b131c45ee36d5f71e3fd21f9ced9` passed E2E and merged. A later pass does not explain the earlier failure.

## Deterministic reproduction

```bash
node --experimental-strip-types --test src/settings/agents/reasonDefaults.test.ts
```

The test builds the production Reason tab and Settings hook using the existing esbuild dependency. Real React server rendering executes the components. A wrapper around the real JSX runtime retains the select callbacks by their accessible labels. No component or Settings implementation is stubbed. The fixture supplies an invented document and in-memory Tauri IPC, with explicit write-completion gates. Agent/provider commands are rejected. Server rendering does not run effects.

Before the fix, three schedules fail and the separate-render control passes:

- `same-render`: workspace, model and effort callbacks come from one render and run without a render between them.
- `older-reply`: the first IPC reply completes before the remaining original callbacks run.
- `partial-render`: workspace and model use the initial callbacks; effort uses the next optimistic snapshot. Final storage is `ws-b / null / null`, matching the reported screenshot's field values.
- `separate-renders`: each clear uses the latest optimistic props. All defaults clear even before the fix.

Each schedule asserts that only one IPC write is pending, all three defaults finish null, an unknown Reason option survives, and unrelated General settings remain unchanged. The test-only commit is `48d57432`. [Raw failing-before output](before.tap) records 3 failed and 1 passed. The partial-render schedule is synthesized; it does not prove that WebKit used that schedule in the failed E2E run.

## Cause and correction

Each old select handler called `withReason(settings, key, value)` with its render's complete Settings snapshot. `useSettings.save` serialized the writes and prevented old replies from replacing newer UI state, but it could not repair an already stale request payload. Clearing model from the original snapshot restored workspace. Clearing effort from that snapshot restored model too.

The Reason tab now owns one latest-settings reference for these three default controls. Each edit updates that reference before passing the complete next value through the unchanged `save(Settings)` API. This composes distinct edits even when the callers retain old callbacks. New renders refresh the reference from current Settings props. The Settings IPC queue, revision guard, rejection/rollback behavior, and E2E clear assertions are untouched.

A global updater API would change every Settings caller's contract. The correction stays in the Reason tab because the reproduced defect is in how its controls compose requests.

## Validation

- PASS: the same four component schedules after the fix, including delayed IPC and an older reply.
- PASS: the component checks plus existing Reason-mode and model checks, 16/16. [Raw passing-after output](after.tap).
- PASS: all frontend unit tests, `node --experimental-strip-types --test --test-concurrency=2 $(find src -name '*.test.ts' -print)`, 1,310/1,310.
- PASS: `npm run build`, including TypeScript checking; existing large-chunk warning only.
- PASS: `npm run lint:colors`, six checker tests and no forbidden color literals.
- PASS: `git diff --check`; no change to `useSettings.ts` or `tests/e2e/flows.mjs`.

No new browser screenshot was taken: this continuation explicitly excluded previews and native drivers, and the correction changes request composition rather than appearance. The [existing investigation page](https://reasonmachines.com/agents/49e3976d-9553-42d8-8101-2504177fbb97?page=fea1e48c-51c3-4375-a47f-412815546489) keeps the earlier Chromium fixture capture separately labeled.

## Limits and ownership

The conditional stale-handler defect is proven. Attribution of the original #748 timeout remains unverified without its dispatch/payload trace. These tests do not exercise WebKit input dispatch, effect-driven provider transitions, Rust serialization, real filesystem persistence, native rendering, pointer behavior or authentication. They grant no native parity credit. Existing E2E ownership stays with Session `acc3b5c5-8a01-407e-b474-42e914e3cf90`; no dispatch, rerun, watcher or duplicate worker was created.

The earlier preview `14af8e86-bb8b-49be-aa3f-f7e5bfc76993` on port `51749` was stopped through `preview_stop`, its process group ended and the port was released. The previous status check confirmed stopped. No preview was started in this continuation, so that receipt is historical, not a fresh shutdown claim.
