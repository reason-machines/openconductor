# Reconcile changed Claude executable paths for idle chats

Conductor Rebuild — separate main-based Settings successor to #1426.
Baseline: `93b9d53ce02970967a831b0ac93ecdbf17bdea31` (actual #1426 squash).

## Defect and smallest repair

Changing, adding or clearing the Claude Code executable override in Settings did
not change an existing chat's reuse key. An idle chat therefore kept its old
executable until something else forced a restart. The executable resolver only
ran inside the new-process launcher.

Two production files change:

- `commands.rs` resolves the executable once per turn inside the existing blocking
  closure, using the existing resolver unchanged. Resolution failure abandons the
  announced prompt before returning the error, without a checkpoint or handoff.
- `runner.rs` includes the server-owned, serde-skipped resolved `PathBuf` in the
  existing options equality and uses that same snapshot for the prepared launch.
  A changed busy chat still returns the wait error without killing. After it is
  idle, the replacement retains the observed resume identity. Equal resolved
  paths, including whitespace-normalized overrides or a custom path equal to the
  bundled path, reuse the current generator.

The Launcher signature, global resolver, provider/authentication, settings schema,
frontend/IPC API, database, process-test file, other agents and cloud UI are
unchanged. This does not implement the reference's workspace-wide host manager.
The earlier cloud-only `workspaceSettingsRevision` producer and hypothetical MCP
reuse lead are excluded.

## Real-Conductor retained-source qualification

[reference.json](reference.json) binds 23 exact spans to three complete retained
Conductor 0.87.6 REA-extracted assets. Full asset hashes and bounded original reads
were checked on **sven m5 max**; all checks below ran on **Reason Cloud Linux**.
These are inert shipped-source reads, not a fresh native observation or evaluation
of reference JavaScript. Original-container/REA-subject binding is inherited from
the earlier Auto/Chrome packets and not independently reacquired here.

- Renderer `5199d392…`: `Czi -> gGt -> mGt` binds the executable setting to input,
  file selection, reset and the `o9r` save import. The index export binds that alias
  to `n6t -> VN`, which updates or deletes `claude_executable_path`.
- Index `b5b01f33…`: per-turn `sendToAgent -> q_ -> Ohe` reads the local executable
  setting and forwards it through `executeSession` to the local query.
- Bun `f72df80a…`: `gp5 -> ensureWorkspace -> zd5` uses `Bh7`'s resolved executable
  in the host configuration key. `Od5` reuses equal keys, defers busy mismatches
  and recreates an idle host while retaining its session store.
- The same captured agent configuration reaches `rU6 -> gQ4 -> En4`;
  `getClaudeLaunchOptions -> rc3` feeds `startGenerator`'s actual `queryFn` options.
  The launch span is explicitly an exact method prefix through that call, not a
  claim to retain the entire long result-consumption method. Runtime executable
  proxies and brokered authentication visible in these spans are not rebuilt by
  this change.

No new REA analysis ran and no new REA-specific gap was encountered. Previously
recorded semantic-index/heap limits remain unchanged.

## Reproducible checks

Run from the repository root:

```bash
python3 evidence/settings/executable-reconcile/run-probe.py --source-ref 93b9d53ce02970967a831b0ac93ecdbf17bdea31
python3 evidence/settings/executable-reconcile/run-probe.py
python3 evidence/settings/executable-reconcile/run-command.py
python3 evidence/settings/executable-reconcile/run-adjacent.py
python3 evidence/settings/auto-permission/run-tests.py
python3 evidence/settings/auto-permission/run-tests.py --filter interact_tests::
python3 evidence/settings/auto-permission/run-tests.py --filter agent::claude_stream::tests::
python3 evidence/settings/auto-permission/run-tests.py --filter launch_policy_case::
npm run typecheck
npm run build
python3 evidence/settings/executable-reconcile/verify.py
```

- **RED reproduced:** actual baseline options, command stanzas, resolver and
  pre-spawn runner prefix compiled; **9 controls passed / 5 intended assertions
  failed**, exit 101. Idle add/change/reset, busy mismatch and captured-vs-later
  resolution expose the defect, rather than a missing DTO or compile failure.
- **GREEN passed:** identical frozen template and driver, **14 original cases
  passed**, plus the permanent IPC guard in actual runner options: **15/15**.
- **Command envelope passed:** **2/2**. The exact changed blocking closure compiles
  with ready-only async and counter shims. Success forwards the captured path once
  and preserves checkpoint/handoff; synthetic resolution failure abandons the
  expected prompt without dispatch, checkpoint or handoff.
- **Adjacent passed:** unchanged local-environment assertions **15/15**, linked
  directories **15/15**, Chrome **14/14** (including current inline option tests).
  The adapter adds only an empty executable DTO field/initializer, plus existing
  empty-env support for older fixtures. Original assertions and files are checked
  byte-for-byte and are not edited.
- **Adjacent passed:** Auto/Plan **13/13**, interaction **7/7**, stream **6/6**, launch
  policy **1/1**. No process-based runner filter ran.
- **Passed:** frontend typecheck, production build, 23 reference-span contracts,
  frozen identities, unchanged resolver/process-test files, Python syntax,
  `git diff --check`, and fourteen lossless compressed-log roundtrips. The frontend build
  emitted existing-style chunk-size warnings; these are not Rust integration.

Frozen template SHA-256:
`90a3328dec58d2e9933f6f64aaebc47906a7b314310261cd5245339a2a4bce8f`.
Frozen driver SHA-256:
`66bb754a69f2fcaa070e7719c2b077511295f231658b48b0ebc963a9421ac048`.
[checks.json](checks.json), source manifests and [raw logs](logs/) keep commands,
exit codes, source hashes and results distinct. After integration onto the assigned
branch with main `810a79d40a7205a52e730ae5cc6da2f84401c063`, the 15-case probe,
2-case command envelope, three adjacent suites and production build passed again;
the integrated build includes full frontend TypeScript checking.

The harness runs the actual pure `agent_launch::resolve` with fake paths and
inert custom/bundled/system closures, copies actual options/command assignments
and the real `ensure_live` prefix, then returns immediately before spawn. Session
kill/wait are counters. Synthetic values only; no real process environment,
credential or executable is inspected or invoked by these checks.

## Acceptance limits

Full Tauri compilation/integration, actual settings persistence/SQLite, real
bundled/system discovery or downloads, live CLI/provider restart/resume, package
containment and runtime embedding, installed identity and native/visual parity are
**NOT_RUN/unverified**. Frontend typecheck/build and pure Rust tests do not close
those gaps. No screenshot exists because this lane changes a backend boundary
under source/pure-only admission, without launching the app.

Existing canonical release and native owners retain acceptance. No provider/app
execution, native acquisition, runtime/manual CI/package dispatch or duplicate
watcher was created. Merge only after all executed exact-head workflows pass;
skipped jobs are not passing executions.
