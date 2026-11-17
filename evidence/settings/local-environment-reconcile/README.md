# Local environment changes and Claude live-chat reuse

Conductor Rebuild — source-only repair, separate main-based successor to #1420.
Baseline: `c3c9ab420f62edb08159f6bcbbcc921ca57f52f3` (the actual #1420 squash).

## Defect and narrow repair

Settings > Environment and effective repository environment were read only when
ClaudeRunner launched a process. An otherwise unchanged idle chat returned early
from `ensure_live`, retaining its old environment indefinitely after an add,
remove, rename or value change.

Only two production files change:

- `commands.rs` moves the existing effective-local-environment read to the per-turn
  server boundary. Values become the existing redacted `SecretString` type.
- `runner.rs` includes that ordered, serde-skipped snapshot in the existing options
  equality and applies the same captured values to the next launch. A busy changed
  chat still returns the existing wait error without killing; the next idle turn
  restarts with its observed resume identity. Equal maps, including reordered input,
  reuse the existing generator.

The snapshot cannot be supplied through chat IPC. No client API, global host,
settings resolver, environment precedence/filter, provider, DB schema, other agent,
cloud UI or `workspaceSettingsRevision` behavior changes. The last of these belongs
to an inspected cloud-only producer and is explicitly excluded from this local fix.

## Retained original qualification

`reference.json` retains 15 exact source/caller spans with original byte ranges and
SHA-256 values. Complete original assets were read and rehashed on **sven m5 max**;
all builds/tests below ran on **Reason Cloud Linux**. No new REA acquisition,
reference JavaScript evaluation, app launch or real provider action occurred.

- Renderer `5199d392…` / `tda` saves and deletes via the Settings environment API.
- Index `b5b01f33…` / `rGt`, `iGt`, `ng`, `xz`, `XN` binds stored/file-effective
  local settings. `Cd` serializes keys deterministically. `qxt -> Mv/XN` supplies
  per-agent variables, while `q_ -> Ohe/ng/Cd` supplies top-level Claude variables.
- `sendToAgent` builds `q_` on every turn; `executeSession` forwards to local query.
- Bun `f72df80a…` / `gp5 -> ensureWorkspace -> zd5` joins those options to the host
  key. `zd5` includes `claudeEnvVars ?? agentParams.envVars`; `Od5` reuses an equal
  key, defers busy mismatches and recreates an idle host with the same session store.

Full original container/REA-subject binding is inherited from the earlier Auto and
Chrome reference packets, not independently reacquired. Current full-asset digests
and bounded original reads do not establish running/native parity. The original
workspace-wide implementation motivates invalidation here, not a global redesign.

## Frozen before/after proof

Run from the repository root:

```bash
python3 evidence/settings/local-environment-reconcile/run-probe.py --source-ref c3c9ab420f62edb08159f6bcbbcc921ca57f52f3
python3 evidence/settings/local-environment-reconcile/run-probe.py
python3 evidence/settings/local-environment-reconcile/run-adjacent.py
python3 evidence/settings/auto-permission/run-tests.py
python3 evidence/settings/auto-permission/run-tests.py --filter interact_tests::
python3 evidence/settings/auto-permission/run-tests.py --filter agent::claude_stream::tests::
python3 evidence/settings/auto-permission/run-tests.py --filter launch_policy_case::
python3 evidence/settings/local-environment-reconcile/verify.py
```

- **RED reproduced:** baseline compiled, then **6 controls passed / 6 intended
  assertion failures** (exit 101). Four idle mutations, changed-busy/deferred-idle
  handling, and captured-launch consistency exposed the defect.
- **GREEN passed:** unchanged frozen fixture plus inherited Chrome option tests:
  **12/12**; two new permanent IPC/redaction tests give **14/14** total.
- **Adjacent passed:** unchanged linked-directory assertions **14/14**; unchanged
  Chrome successor assertions **13/13**, including the four inline option tests.
  The adapter adds only an empty environment DTO field/initializer and the actual
  `SecretString` type. Original files and every assertion remain byte-identical;
  `run-adjacent.py` asserts their frozen hashes and unchanged test bodies.
- **Adjacent passed:** Auto/Plan **13/13**, interaction **7/7**, stream **6/6**, and
  launch policy **1/1**. No process-based test filters were run.
- **Passed:** reference/source/frozen-identity checks, seven lossless compressed-log
  roundtrips, Python syntax and `git diff --check`.

Frozen fixture SHA-256: `8e663e6df3a40c96f7854fdf6705434f26b593ab941f265e43bb7ce16f4fd0fc`.
Frozen driver SHA-256: `87ce51b757f5c2a43a77525d4e0ced37b114add4d74abd9ec1f2b2fb5e15a79e`.
`checks.json`, baseline/green source manifests and raw lossless `logs/*.log.gz`
separate compiler results, assertion results and source identities. Synthetic values
only: no current process environment or actual secret value is read or logged.

The harness copies actual options, the command snapshot stanza, the old launch
injection when present, and the actual `ensure_live` prefix. It returns immediately
before spawn. Effective settings are thread-local synthetic maps; process kill/wait
are counters; launch/session/mapper are DTOs. The actual `SecretString` definition
is compiled. This is not full Tauri or effective-settings integration.

## Acceptance limits and delivery

Full Tauri compilation/integration, real environment-file/SQLite resolution, actual
provider-process consumption, live restart/resume, package containment, installed
identity and native/visual parity are **NOT_RUN/unverified**. No screenshot: this
lane is restricted to source/pure checks and changes backend reuse, not a UI view.
The existing resolver is preserved by source equality, not exercised by the fake map.

Existing canonical release/native owners retain acceptance. No app install/launch,
provider process, manual CI/package dispatch or new watcher is created. Merge only
after every executed workflow on the exact published head passes; skipped jobs are
not passing executions.
