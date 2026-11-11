# Terminal Appearance preferences in the settings table

Conductor Rebuild corrects storage routing for `terminal_font_family`,
`terminal_font_size`, and `color_vision`. Main
`50b0a4403ee26d315775869b35958bfe28291ae2` still omits them from
`settings/db_backed.rs`. The service and model match the earlier comparison at
`4e0e9929de24b3a088f4851c05231fdcf0e882bf` byte for byte.

## Retained-source evidence and limits

Existing reader [1a0b236e](https://reasonmachines.com/agents/1a0b236e-24d0-4b7e-9045-81525f0bcd13)
supplied literal spans from the retained REA-decoded Conductor 0.87.6 assets,
`index-BGEQ8YjU.js` and `renderApp-D_fmY7hW.js`. This Session verified the
relayed text against its supplied SHA-256, byte length, UTF-8 ranges and UTF-16
ranges. It did not reacquire or execute the reference app.

Two complete relayed receipts also passed exact-byte verification:

- `same49-final-receipt.json`, 3,529 bytes, SHA-256
  `95594cb9bf57bbaad107694b9857fd71d67ed857725e7912ea47ea20077e64c3`.
- `exp_joins.json`, 644 bytes, SHA-256
  `40c0afe33130e01a12dec43eb141541249477e6153735cf315964bb2c7d158f4`.

The original whole bundles and unsent parent containers remain
producer-attributed. Relayed span integrity does not establish those whole-file
identities. The separate earlier e1 receipt/action-cache identity gap is
unchanged. No physical persistence, runtime invocation, or native parity is
claimed here.

### Reachable rows and encoding

The user-scoped `appearance-panel` registration at renderApp UTF-8
`[10860811,10861001)` renders `vla`, which contains `rla` and `gla`.

- `rla`, `[10212553,10213582)`, reads `color_vision` through `us` and offers
  `default`, `protanopia-deuteranopia`, and `tritanopia`. Its callback `sla`
  calls the validated setter through `gEr`. The import/export joins bind this
  to `P6t`, which calls `ee.updateSetting("color_vision", t)` immediately.
- `gla`, `[10219311,10221635)`, binds the font input to `_la` and the 10–20
  size slider to `bla`. Their joined setters are `Qzt` and `Zzt`.
  `Qzt` writes the font string or an empty string. `Zzt` writes
  `t.toString()`. Both request debounced persistence.
- Joined readers `f5t` and `g5t` read the font or null and parse the size with
  default 12. The complete aliases and containing import/export bounds were
  supplied with the literal spans, not inferred from matching symbol names.

### Storage selection

The retained index spans establish the ordinary write route:

1. `Me()` classifies both terminal keys as non-file-backed strings.
   Their metadata entries are `[291868,291893)` and `[291894,291917)`.
2. `color_vision:_l(fN)`, `[288242,288261)`, has no `fileKey`.
   `_l`, `[292865,293091)`, returns non-file-backed metadata.
   `DLe`, `[284523,284673)`, validates exact membership in `fN`.
3. `DE` and `aZ`, `[292096,292225)`, join the registry to the file-route
   predicate. None of these keys selects the file writer.
4. The complete `KZ` allowlist and `tg` predicate, `[331326,331681)`, exclude
   all three keys from secure storage. Merely seeing a DB branch was not
   sufficient until this predicate was checked.
5. `HN.updateSetting`, `[363131,364790)`, belongs to the supplied complete
   `HN` class `[345556,373940)`. For ordinary writes not blocked by managed
   settings or feature flags, it reaches `vz` directly or through the debouncer.
   `vz`, `[331977,332484)`, deletes an empty value or requests
   `INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`.

These are static routing and encoding facts. DB adapter execution, DB location,
actual stored rows, startup inputs, migration state, and debounce timing remain
unobserved. Existing REA cross-chunk alias-resolution limits required literal
source joins. This increment ran no new REA command and found no new REA bug.

## OpenConductor change

The existing `db_backed` helper now includes all three keys in its overlay,
string-row encoder, file-key list, and stripping path. The existing service
therefore reads active table rows, writes changed rows, and removes those keys
from TOML. Resetting the optional font deletes its row. Font size keeps the
existing typed 10–20 validation range, and color vision uses its existing enum.
This does not claim that malformed external numeric strings decode exactly like
JavaScript `parseInt`.

The existing legacy migration copies only explicit file keys with no active DB
row, preserves active rows, strips migrated keys after successful writes, and
is idempotent. This is OpenConductor compatibility policy, not an observed
Conductor migration. The no-DB fallback still uses TOML.

Production service, model, frontend, and Big Terminal routing are unchanged.
Two older Appearance fixtures now assert the corrected table destination.
One Big Terminal migration fixture uses `git.archive_on_merge` as its unrelated
file-backed control instead of the newly table-backed terminal font size.
Its Big Terminal assertions remain intact.

## Regression proof

[PR #964](https://github.com/reason-machines/openconductor/pull/964) first
published only eight new regression fixtures at
`4f643da605da6227465e08406ed2718292b584f4`.

**Confirmed failing before the fix:** both automatic app jobs passed their
preceding cargo check and then failed exactly seven new routing regressions.
The no-DB fallback case passed. Ubuntu reported 947 passed and 7 failed.
macOS reported 947 passed, 7 failed, and 1 ignored.

- [Ubuntu failure log](https://github.com/reason-machines/openconductor/actions/runs/42931131809/job/130229858722)
- [macOS failure log](https://github.com/reason-machines/openconductor/actions/runs/42931131809/job/130229858474)

Examples include active `Menlo` rows losing to legacy `Legacy`, absent encoded
font rows, and an empty migration result instead of the explicit terminal keys.
The fixtures cover overlay, encoding, save/restore, active-row precedence,
explicit migration, absent-default preservation, reset, and the no-DB fallback.
All eight new test bodies are byte-identical after the fix. Their combined
SHA-256, starting at the first `#[test]`, is
`c75e768393efc6b262ce10449fc637c5c2ed1729bc8c6a7c32f91b296281dba4`.

**Passed locally on Cloud 298:** fresh-main source comparison, unchanged new
fixtures, relayed-source integrity validation, and `git diff --check`.
**Pending:** automatic exact-head app tests and full CI after this product fix.
**Not run locally:** Rust tests, formatter, app build, installs, or native/UI
execution. The existing shared computer is busy, so hosted CI supplies the
execution proof. No screenshot is supplied for this source-only storage change.
Native acceptance remains unverified.
