# Scripts config failure context

## Scope and reference evidence

Conductor Rebuild compared retained Conductor source with OpenConductor main
`cf7ecaa3d232d9ac37c990b10d45fef96b297757` before reproducing the failure.

The original retained-REA packet has SHA-256
`d0d8e4b9b20c5150f30f5edff149bfc25f3074da5a1a66357b1caaf1ef0033ab`
and is 15,319,040 bytes. Independent verification passed for its 70 regular
archive members, two original asset hashes, 65 exact UTF-8 spans, and 15 static
join assertions. The archive and extracted reference JavaScript are not part
of this change and were not executed.

REA acquisition receipt:
`ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`.
The earlier semantic renderer analysis exhausted its heap. This comparison
uses the retained shipped bytes from that acquisition, not a new acquisition.

The renderer's complete `Vio` is at UTF-8 bytes `[7161996,7164728)` and has
SHA-256 `24c306949854d2df51cfea8f8bb47306b458e8106e28210190cb6bde46b5cf62`.
Its local branch calls `rxr`, imported through `gM` from index `Bqt`.
`Bqt` is a reactive settings-store hook, not a query-key factory.
It selects task data and resolution errors by the current repository ID.
Async repository resolution also stores success and failure under the captured
repository ID. Complete `nro` passes its current workspace and repository to
`Vio`, then passes `z.data` to `oxr` to build the task list.

This establishes the reference's static ownership for different repositories.
It does not establish same-repository settings equivalence, filesystem behavior,
or native execution. The cloud query branch is outside the implementation scope.

## Reproduced failure

The current App, WorkspaceView, and PanelStrip pass changed repository and
workspace props to the same ScriptsPanel without a workspace remount key.
Successful config responses already carry a captured workspace-reference key,
and the displayed config uses the current key or its cache entry.

The config-load rejection callback instead wrote unkeyed `error` and
`configError` state. A pending request from repository A could reject after the
panel switched to distinct repository B. That rejection could replace B's own
error, interrupt B's pending Setup view, or accompany B's successful task list.
An old A request could also publish an error after switching A to B to A.

`src/scripts/configContext.test.ts` mounts the actual ScriptsPanel, API bridge,
and RunSplitButton with React's test renderer. Only external boundaries are
substituted, including deferred `scripts_config` IPC promises. It does not run
reference JavaScript, native commands, a browser, or a provider.

Before the production edit:

```bash
node --test src/scripts/configContext.test.ts
```

Result: **5 intended failures, 3 passing controls, 8 total**. The failures are:

- A's late failure appears in B's pending Run view.
- A's late failure replaces B's own Run failure.
- A's late failure replaces B's pending Setup view with a load-failure view.
- A's late failure appears alongside B's successful task list.
- An old A request publishes an error after returning from B to A.

The controls preserve B's own failed Setup view, successful result keys and
cached task lists, and current-workspace errors with exact IPC identity.

The regression file's SHA-256 was identical before and after the production fix:
`04f6c171d6b49ef746aafd15ac25e6764060eddeae47117170693977fcebf4c5`.

## Fix and checks

The config-loading effect marks its lifetime disposed on cleanup. Only the
rejection callback checks that flag before updating error state. Successful
responses still populate their captured cache entries. Config keys, task data,
generic Run actions, and preview variables are unchanged.

After the production edit:

```bash
node --test --test-concurrency=1 src/scripts/configContext.test.ts src/scripts/spotlightActionContext.test.ts src/scripts/previewEnvContext.test.ts src/scripts/runActionErrorContext.test.ts
npm run typecheck
git diff --check
```

Results: **30 tests passed, 0 failed**. The eight new regression cases passed,
as did all 22 existing controls from #973, #977, and #981. TypeScript and the
whitespace check passed. The three existing fixture files are unchanged.

## Verification limits

Full frontend tests and build, all hosted checks, protected merge, and
consuming-main CI and packaging are separate delivery checks. They are not
established by this focused local run.

No native launch, browser screenshot, E2E observation, real-provider check,
new source acquisition, or feature-level visual acceptance ran. The rendered
Run and Setup states are asserted by React's test renderer, not by a native
or browser screenshot. Generic React and TanStack execution in Conductor,
settings-service initialization, and injected filesystem and network behavior
remain outside the retained-source proof.
