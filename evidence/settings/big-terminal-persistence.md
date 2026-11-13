# Big Terminal preferences in the settings table

Conductor Rebuild found a bounded storage-routing mismatch on main
`dbdcb4fa7ed0f361bc32abcd428898571d6d0362`. The earlier comparison used
`bd2d42c2a75bc2013cd447e78f07db01e25782dc`; the relevant Settings code is
unchanged between these commits.

## Source identity and limits

The existing source owner supplied literal decoded-source spans from Conductor
0.87.6, bundle `com.conductor.app`:

- Executable SHA-256: `0ba55751aea5ecf592d2c78379760af641fb912a34b2c3573d41df031ffb831d`.
- `index-BGEQ8YjU.js`, 3,493,297 bytes, SHA-256:
  `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.
- Routing/read receipt SHA-256:
  `7ba79c12356fdae72fd3d56b74fe3d33f983c27a3d20de755b95ba62c35aefee`.
- Source message: `75c92452-29eb-42bb-8c32-5dd175d4746b` from existing
  acquisition owner `e1e2b6b9-97cc-4ddc-ba9e-533d89eeeb46`.
- REA executable evidence:
  `ev_c1be98e2e349f123aa926e487548cb2edf18b45d05a42e05bc7c215e84f7ebdc`.
  REA authenticated the executable digest but did not enumerate embedded Tauri
  assets. The spans establish decoded-source facts, not REA runtime observations.

This consumer independently verified all 20 newly supplied spans against their
SHA-256 values, byte lengths, and UTF-8 and UTF-16 range widths. It did not rehash
the original asset or independently confirm absolute offsets in that asset.
The origin reports original-asset validation and 18 syntax-only parses passing.
Two long declarations in earlier retained messages were masked, leaving their
historical consumer verification at 15 of 17 versus the origin's 17 of 17.
The newly supplied small schema and classification spans pass independently.
No extracted target code was evaluated and no new acquisition ran.

## Literal routing and conditional read chain

All ranges below are zero-based, half-open UTF-8 byte ranges in that exact asset.

1. The two `Pe` registry items, `[278814,278848)` and `[278849,278874)`,
   register strings without defaults. `Pe`, `[283862,283966)`, returns string
   metadata. The schema entries `[287938,287997)` are both `Me()` without
   `fileKey`, SHA-256
   `d2df78b91b2e7b6fba884b883fc01da9e356a6de99a0b17788b5b31cc716f4cc`.
2. `DE`/`Xf` ingestion `[292096,292171)` and complete classification helpers
   `[292171,292865)` establish `Me()` as non-file-backed. `aZ` tests that
   metadata and `LLe` includes only file-backed keys.
3. The complete `KZ` allowlist `[331240,331563)` contains neither key.
   `VZ`, `[331563,331640)`, tests the platform variant. `tg`,
   `[331640,331681)`, requires both `VZ` and membership in `KZ`. Thus neither
   Big Terminal key takes the secret route, regardless of `VZ`'s result.
4. `HN.shouldWriteSettingToFile`, `[372360,372652)`, returns false for a
   non-file-backed key. `HN.updateSetting`, `[363131,364790)`, then calls
   `vz` immediately or through `getPersistDebouncer`, `[373565,373871)`.
   `vz`, `[331977,332484)`, deletes blank values and otherwise executes
   `INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`.
   Its SHA-256 is
   `a73dcd8551660520d3aedde4ea0aceaf0367affae3cb8b95b6fada2d694b86d3`.
5. `KN`, `[400565,400652)`, writes `JSON.stringify` of the custom-command
   array, including a nonblank `[]` for an empty list. `IBe`/`pee`,
   `[399569,399889)`, retain array entries with string `id` and `command`
   fields, ignoring other entries. Invalid JSON and non-arrays yield an empty
   list. `zBe`, `[414090,414160)`, writes the preset as a raw string.
6. `S$e`, `[332536,333407)`, reads nondeprecated settings rows. The
   `file_backed_settings_migration_complete` marker filters only `LLe` keys.
   Big Terminal's non-file-backed keys therefore remain eligible. Secret
   migration iterates only `KZ`, so neither is diverted. `S$e` SHA-256 is
   `2944c12b412a65b10ad8f4378a918ac5728de7f69dd9a3f3f6e06b9c5730ae9b`.
   Its export is `S$e as ur`, `[3493019,3493028)`. The unrelated export
   `wQt as tg` is not the lexical routing predicate.
7. `HN.start`, within `[347008,349644)`, uses supplied preloaded settings
   in one branch and otherwise calls `S$e`. It merges the resulting values
   into `dbSettingsByKey` and publishes. Earlier source closure binds the
   service factory to active `ee`; renderer startup and live invocation were
   not observed.

This closes static routing and conditional read semantics. It does not prove
the physical DB adapter, DB location, actual rows, migration state, preloaded
inputs, startup, or a live restore.

## Correction and compatibility policy

`Settings.terminal` already owns typed preset and custom-command values.
A dedicated `big_terminal_prefs` module translates those values to string rows,
overlays active DB rows, and identifies and strips only the two legacy file
keys. The service uses it alongside the existing appearance and table groups.
The model, frontend, `table_prefs`, and `db_backed` remain unchanged.

Preset writes keep nonblank strings unchanged. Missing or JavaScript-blank
values delete the row. Custom commands use JSON arrays and a per-entry decoder
matching `IBe`/`pee`. Clearing an existing list writes `[]`; unrelated saves do
not invent an unset command row.

Existing active DB rows override conflicting legacy TOML values. The existing
startup migration copies only explicitly present legacy keys when no active row
exists, then strips the migrated keys after successful writes. Repeating the
migration is a no-op. Unrelated TOML values and the no-DB file fallback remain.
This TOML upgrade is OpenConductor compatibility design, not a claimed
Conductor migration. No physical DB restore observation is required to justify
the narrower route correction.

The alternative was extending the generic table-preference registry. That
registry handles boolean and enum values in extra maps, while these fields are
typed strings and lists. A separate helper keeps their JSON encoding and
legacy-file handling together without changing unrelated preference rules.

## Regression coverage and delivery state

The first ready/main revision of [PR #942](https://github.com/reason-machines/openconductor/pull/942)
published the seven original fixture regressions with the service unchanged.
Its hosted head was `92a3d63985b9c06ab2cc097b487386de821b661e`.

**RED confirmed on macOS and Ubuntu.** Six routing and migration regressions
failed for the intended omissions. The no-DB fallback case passed. The complete
Rust test results were 938 passed, 6 failed, and 1 ignored on macOS, and
938 passed, 6 failed, and 0 ignored on Ubuntu. The only failures were the six
new routing regressions. Example assertions found no preset DB row after save,
kept the legacy preset instead of the active DB value, and returned no migrated
keys. Both jobs passed their preceding cargo check.

- [macOS baseline job and failure log](https://github.com/reason-machines/openconductor/actions/runs/42912000463/job/130164757281)
- [Ubuntu baseline job and failure log](https://github.com/reason-machines/openconductor/actions/runs/42912000463/job/130164757462)

The bounded correction follows this verified RED revision. Passing-after checks
are pending; no GREEN result, merge, package consumption, or live restore is
claimed at this increment.

The suite uses temporary settings files, an in-memory SQLite pool, and
`MemorySecretStore`. It covers DB writes and fresh-service reads, mixed and
malformed JSON, row precedence, blank preset deletion and empty-list writes,
explicit-key migration, DB-row precedence, idempotence, unrelated values,
deprecated rows, and the no-DB fallback. The correction adds cases for unset
rows and an unavailable synthetic DB, plus JavaScript whitespace boundaries.
A recreated service against the same in-memory pool is not process restart or
physical database restore proof.

The existing automatic app check runs `cargo check --locked --all-targets`,
`cargo test --locked`, and `cargo clippy --locked --all-targets -- -D warnings`.
A focused equivalent for an authorized environment is:

```bash
cargo test --locked --manifest-path src-tauri/Cargo.toml \
  settings::big_terminal_prefs::tests -- --test-threads=1
```

Local source-only checks passed: 20/20 literal spans, seven exact-main snapshot
files, parsing the initial test-only Rust source, and `git diff --check`.
The parsing check does not typecheck or execute the test module. Product tests,
the full app build, native or browser execution, and real DB or Keychain I/O
were not run locally. Rustfmt is not installed; no tool or dependency was
installed. No manual hosted workflow dispatch or retry ran.

There is no screenshot because this admitted repair is source and synthetic
fixtures only. #847 FULL STOP, native admission NONE, #916/#927 ownership, and
all protected-resource holds remain unchanged. The PR subscription owns hosted
RED-to-GREEN and merge follow-through; there is no new polling watcher.
