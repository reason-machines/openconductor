# Managed settings JSON fallback

Conductor Rebuild fixes managed-file selection at the terminal settings-map
boundary. `load_effective_layers` now reads `settings.managed.toml` when
present and otherwise reads `settings.managed.json`. It selects one managed
file; it does not merge JSON-only keys into TOML. Repository JSON/TOML
layering, user settings, environment precedence, and stored-value handling
are unchanged.

## Source identities and consumer alignment

Reconciled default main `b34ba2de9ad45365715d21a0bfe24d9c36b335fb` on
11 November 2026 before publication. All 11 effective-loader, existing test,
manifest, lockfile, and terminal-consumer hashes match the frozen source
packet pinned to `abd5b8df5fe2fb5ffff4dd4cbd210973cdb84a5c`. Merging current
main changed neither the candidate loader nor the frozen fixture.

Retained real Conductor assets:
- Renderer `renderApp-D_fmY7hW.js`: SHA-256
  `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- Index `index-BGEQ8YjU.js`: SHA-256
  `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.
- REA provenance:
  `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`.

The index's `h$e` declaration occupies zero-based half-open UTF-8 bytes
`[329315,329973)`, SHA-256
`44bda0ae9a1f5a06f3ea7a8511ee4603e771b23af3f0cb93c57805f85642f866`.
It chooses existing managed TOML before JSON, parses the selected file,
and returns normalized settings and per-context environment maps. The closed
producer chain populates `HN.managedEnvVarsByContext.local`.

The retained terminal chain is `qwa(cwd, host, localWorkspaceId)` →
`Qwa(workspaceId,cwd)` → local `ng` → environment overlay → `Xwa` →
`MAt.resolveLaunch` → `pty_spawn.options.env`. The rebuild's
`settings::effective::local_env` → terminal spawn consumes the same local
settings map via `load_effective` and `vars_with_stored(Local, stored)`.
This is static caller/context/map alignment, not reference execution.

Original evidence packets remain attached to the owning Session:
- Managed producer: `c6293ac8-f839-47c0-90b1-e398fae3361c`, SHA-256
  `5b5ef372146c85eb71737909028bd01d7cba5fb79a691ad8807a198f6d3e472f`.
- Terminal alignment: `99f9320f-6fa0-4691-9383-adf6e5c9236e`, SHA-256
  `b549286882c8f4b12ddb2c89a8bad48709c601f0d77acfa87c6d70cc9bddb3a4`.
- [Source packet and execution owner](https://reasonmachines.com/agents/64baa6b6-4caf-47f1-aa8d-e14a966cc243).

## Frozen regression and observed baseline

The permanent integration test is the exact 2,613-byte frozen fixture,
SHA-256 `e100ef85c31560b49166f8f58344534ec5ea833c94a5800a57649b80f36887f2`.
Existing `effective_tests.rs` is unchanged. All fixture paths are disposable;
no real HOME, environment, credentials, provider, native app, or reference
JavaScript is read or executed.

```bash
CARGO_BUILD_JOBS=1 CARGO_TARGET_DIR=<private-target> \
  cargo test --locked --offline --manifest-path crates/scripts/Cargo.toml \
  --test managed_terminal_json -- --test-threads=1 --nocapture
```

The sole serialized executor ran the frozen baseline on Reason Cloud:
- Dependency setup and locked offline metadata **passed**. The isolated cache
  added 66,214,660 bytes; no manifest, lockfile, or toolchain changed.
- Baseline **failed as intended**: JSON-only local value was `None`, expected
  `Some("json-local")`. TOML-priority/no-JSON-leakage and no-file controls
  **passed**: one failure, two passes, no setup or compilation error.
- Baseline finished at `2026-11-11T07:42:10.612477Z`, target growth
  296,200,604 bytes, with no remaining owned jobs.
- Receipt archive: `28293567-f109-407a-bf7d-ed0ea7684914`, SHA-256
  `571a7dc6d7cebef996cd4f7cab7066b2feab6301687242da68aba049ab10daa9`.

## Matched candidate results

The same serialized executor tested candidate `5d591f648b18298a1a141a1be3d4e73a147f0624`
on Reason Cloud with locked/offline dependencies and one Cargo job. The loader
SHA-256 is `d3fd96d92d66d9ab92923aee2496042af93229776e249c4b2c9ba7c3f82ae33c`.
The fixture remains byte-identical to the failing baseline.

- **Passed:** the exact integration-test command above, three tests and no
  failures or ignored cases. JSON-only loading, TOML priority without JSON
  leakage, and the no-file control all passed.
- **Passed:** existing configuration regressions, 18 tests and no failures or
  ignored cases. The other 70 library cases were filtered out.

```bash
CARGO_BUILD_JOBS=1 CARGO_TARGET_DIR=<private-target> \
  cargo test --locked --offline --manifest-path crates/scripts/Cargo.toml \
  config::effective_tests --lib -- --test-threads=1
```

Both commands finished between `2026-11-11T07:55:24.941749Z` and
`2026-11-11T07:55:34.244616Z`. Aggregate target growth was 133,503,010 bytes,
below the 1 GiB limit. No owned Rust processes remained. Source, fixture,
existing test, manifest, and lockfile hashes were reverified afterward.

The exact execution receipt is attachment `35ba2728-a673-4708-ae36-c9c4c2fe9e63`,
SHA-256 `814e3ffb99125b6d771dcfc943ec84b64fef4b0c727dd53a020fc7cdea96300d`.

**Passed:** fixture equality, unchanged existing tests and dependencies, and
`git diff --check`. **Not run:** local formatting validation. The installed
stable toolchain lacks the rustfmt component; its check exited before any
formatting comparison. No formatter or toolchain was installed. Hosted CI
results are reported on the pull request.

## Limits

The regression exercises the public effective loader and local settings-map
boundary, not PTY spawn, shell evaluation, real providers, reference runtime,
or visible macOS acceptance. No screenshot is supplied because this change
has no UI and native/visual execution is outside this lane. The original REA
semantic renderer analysis exhausted heap; retained shipped literals provide
the reference source evidence. That limitation does not establish native parity.
