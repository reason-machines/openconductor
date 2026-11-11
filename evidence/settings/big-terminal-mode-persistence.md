# Big Terminal mode persistence

Conductor Rebuild compares `experimental_big_terminal_mode` with retained Conductor
0.87.6 source. Rechecked on main
`aa9b44f5dcadceb5cef37d405f3ffbd9fd8fad8f`, OpenConductor keeps this boolean in the typed `Experimental` field, but omits it from
`table_prefs::PREFS`. With a database attached, table reads therefore do not update
the typed field, saves leave the value in TOML, and the legacy migration does not
move it to the settings table.

## Retained source

The source was extracted read-only from the real Conductor app by the existing
[Settings evidence reader](https://reasonmachines.com/agents/1a0b236e-24d0-4b7e-9045-81525f0bcd13).
It was not executed. Two original-byte uploads were verified on the recipient
cloud computer:

- `same49-big-terminal-v1-receipt.json`: 24,580 bytes, SHA-256
  `f68b0201adcf9f5acd413312f8e8e6980b079f3228b8ed79c8d271208952e791`.
- `same49-big-terminal-registry-gate-v1.json`: 3,081 bytes, SHA-256
  `63d1cb6d3b62e6dd419033f6c4b96057bb47b5243be3f6543d9f42d86cda6eb5`.

All 32 new text records match their UTF-8 byte lengths, UTF-16 widths, ranges, and
SHA-256 values. The 24 reused records match earlier retained literals or exact
slices of the retained `HN` class. Whole original bundle identity and unsent
container membership remain producer-attributed. No source acquisition or new
reference/native runtime was used for this change.

The following ranges are zero-based, half-open UTF-8 bytes:

- In `index-BGEQ8YjU.js`, `[279918,279957)` declares
  `Te("experimental_big_terminal_mode",!1)`. `Te` at `[283966,284072)` describes a
  boolean with default false.
- Metadata `[288978,289013)` uses `xe()` without `fileKey`. The complete `xe`
  declaration at `[293235,293448)` classifies that form as `non-file-backed`.
  `DE`, `iZ`, and `aZ` join the known key to that classification.
- The full setter `y6t` at `[413812,413904)` calls
  `ee.updateSetting("experimental_big_terminal_mode",t.toString())`, without a
  debounce option. Its export `qm` and render import `I9r` join it to the row.
- Reader export `ln as a9` and import `a9 as us` join the row's
  `us("experimental_big_terminal_mode")` to `ln` at `[385083,385204)`, `iBe` at
  `[386038,386561)`, and the store getter/parser chain. The default is false.
- In `renderApp-D_fmY7hW.js`, `[10697424,10697792)` is the full `ir` registration
  for the Experimental user-scope row titled "Big terminal mode". Its switch
  receives the typed reader value and sends changes to `I9r`.
- `ir`, `Qma`, `Eba`, `_5`, `gSa`, and `mSa` close the static registry-to-panel
  render chain for `tab=experimental, scope=user`. The supplemental `Yma`,
  `Xma`, and `iZ` export/import records close the registry-known-key guard and
  deep-link-owner predicate. This does not prove navigation visibility or native
  switch behavior.
- The existing retained `HN.shouldWriteSettingToFile` and complete `HN` class
  show that this non-file-backed key takes the database branch. The `vz` writer
  uses `INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)` for a
  nonempty nonsecure value. The retained secure-key predicates and prefix gate
  exclude this key. Readback uses the database settings map and published store.
  The common routing chain is also documented in
  [Terminal Appearance persistence](terminal-appearance-persistence.md).

Original bundle identities, attributed to the producer:

- `index-BGEQ8YjU.js`, 3,493,297 bytes, SHA-256
  `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.
- `renderApp-D_fmY7hW.js`, 11,600,457 bytes, SHA-256
  `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.

## Behavioral regression

Ten additive cases in `table_prefs::tests::big_terminal_mode` exercise typed
true/false overlays, encoded changes and equal-row no-ops, file extraction and
stripping, real SettingsService/database round trips, legacy migration,
active-row precedence, and an unrelated save with an unset default. Controls
preserve OpenConductor's existing invalid-row handling and no-database TOML
fallback. Services use unique temporary directories, in-memory SQLite databases,
and `MemorySecretStore`, never real settings or credentials.

The existing
`db_backed_tests::table_prefs_in_an_older_file_move_to_the_table` used Big Terminal
mode as an unrelated file-backed control. Its fixture and matching retained-file
assertion now use `git.archive_on_merge=true`, which is a typed file-backed field
and is not in `PREFS`. All existing moved-key and active-row assertions remain
unchanged. The new cases explicitly cover Big Terminal mode migration in both
directions so the control substitution does not remove its coverage.

Automatic hosted `cd src-tauri && cargo test --locked` established RED on the
tests-only head `b738ebdbce476e77ac0203beda95f05dd06e428b`:

- [macOS job 130256972161](https://github.com/reason-machines/openconductor/actions/runs/42939286060/job/130256972161)
  reported 956 passed, eight failed, and one unrelated existing ignored test.
- [Linux job 130256972498](https://github.com/reason-machines/openconductor/actions/runs/42939286060/job/130256972498)
  reported 956 passed and the same eight failed, with none ignored.
- Failures cover true/false overlays, typed row encoding, file routing,
  service table round trips, migration, active-row precedence, and default-false
  file exclusion. The round-trip test found no row instead of `Some("true")`;
  migration returned no moved key. Both preservation controls passed, as did the
  existing older-file fixture after its unrelated-control substitution.

The correction adds the key to `PREFS`, routes its overlay and encoding through
its existing typed field, and leaves an absent default false row absent during
an unrelated save. The registry now also supplies stripping and migration.
No service or model changes are needed. This follows Fix Root Causes: correct
storage classification rather than adding a UI workaround.

The complete ten-case regression module remains byte-identical to RED, SHA-256
`8671df3f5a7ff6520041218b4a587d3e060667a9d381bdb4f5d5b92242d4d9d1`.
Passing-after hosted results are pending. Local Rust/application execution is
outside this lane's admission; local checks are limited to source, receipt
identity, unchanged-test comparison, and whitespace validation.

## Compatibility and limits

The correction keeps the existing typed field and service API. Table read/write
and file/migration classification agree, while an absent default false does not
acquire a database row on an unrelated save. Legacy TOML migration
and no-database fallback are OpenConductor compatibility policy, not observations
of a Conductor migration.

No model, service, frontend, provider, workflow, or native code is in scope. All
eight Appearance regressions from #964 remain unchanged. No screenshot is
available because this is a storage-only change and native/browser admission is
closed. Hosted synthetic persistence tests do not establish real configuration
paths, process restart, native relaunch, installed-app behavior, or visual parity.
