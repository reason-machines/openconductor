# App preference write order

Conductor Rebuild reproduced a stale-snapshot publication defect on main
`7af2b95aa74dff985fb6b745f7cc080287d35ea6`. The existing Experimental switches
use the shared `appPrefs` store. Every successful native read, write or Open in
update returned a whole `AppPrefs` snapshot and replaced that store. An older
reply could therefore revert a newer switch and its consumer value even when
the newer database write had already completed.

Tab Freak Mode already has a typed field, false default, boolean update encoder
and database-backed command in `app_prefs`. Its row and terminal consumers are
reachable in current source. Omitting it from `table_prefs::PREFS` is not a bug.
This change adds no storage registry entry, Rust model, preference or UI row.

## Retained reference

The existing Settings reader supplied original-byte attachments from the
previously retained REA extraction of Conductor 0.87.6, without executing it:

- `same49-tab-freak-mode-v1-receipt.json`, 116,981 bytes, SHA-256
  `d84a54fe223f79a0aecadbccdc43f5e110017d474f7d67c9efb16ffe7550b854`.
- `same49-tab-freak-mode-v1.sources.txt`, 73,687 bytes, SHA-256
  `474ce658a951d1d12da12f972d107a6c9a04f63696d97cae230f12dd3267568a`.

Recipient verification passed for both attachment digests and all 96 records.
Each record's text, byte length, UTF-8 and UTF-16 range widths, digest and exact
payload slice matched. Whole-original app identity remains producer-attributed.
The reference bundle digests match the earlier retained Settings provenance in
[Big Terminal mode persistence](big-terminal-mode-persistence.md).

The following zero-based, half-open UTF-8 ranges are static source evidence:

- `renderApp-D_fmY7hW.js` `[10698240,10698596)`, record `tab-freak-043`, registers
  the user Experimental row. It reads `us("experimental_tab_freak_mode")` and
  writes through `R9r`.
- `index-BGEQ8YjU.js` `[413904,413993)`, record `tab-freak-020`, is the complete
  `_6t` writer. It calls `ee.updateSetting` with the key and boolean text, with
  no debounce option.
- `[363131,364790)`, record `tab-freak-050`, is `HN.updateSetting`. After its
  guards, the ordinary non-debounced database route awaits `vz(this,key,value)`
  and calls `setStoreValue(key,value)`.
- `[366432,366659)`, record `tab-freak-051`, is `HN.setStoreValue`. Its nonempty
  write spreads the current `dbSettingsByKey` and changes only the supplied key.
  Unrelated keys are not replaced by an older request snapshot.
- `[368055,368345)` and `[368516,368732)`, records `tab-freak-056` and
  `tab-freak-058`, publish the merged current map to the shared store.

These records support preserving unrelated choices on publication. They do not
establish Conductor's runtime scheduling, transport reply ordering or a native
race. The queue below is OpenConductor's implementation policy, not a claim
that Conductor uses the same queue. No new REA invocation or gap occurred in
this retained-source-only pass. Existing extraction and tracing limitations
remain in [Settings notes](NOTES.md).

## Behavioral RED and unchanged GREEN

The test mounts the production `TabFreakModeRow` and `NewWorkspacePageRow` with
React 18.3.1 and `react-test-renderer`, and loads the complete production
`appPrefs.ts` module. IPC is a controlled fixture that captures the whole reply
when a synthetic write completes, then lets the test deliver replies later.
Unrelated layout and imports are substituted. It does not call real IPC or a
database, start an agent, read credentials, or modify user settings.

The original scratch reproduction toggled New workspace page and Tab Freak Mode
on, then delivered the newer reply before the older one. Its decisive result was:

```json
{"latestSwitch":false,"featureConsumer":false,"persisted":true}
```

The ten-case checked-in regression runs with the repository's existing dev
packages. This pass used only nine small packages in an isolated dependency
folder and ran on Reason Cloud:

```bash
APP_PREF_WRITES_DEPS="$PWD/.oc-tmp/app-pref-writes-deps" \
  node --test src/settings/appPrefWrites.test.ts
```

Before the production correction, against unchanged fresh-main source:

```text
# tests 10
# pass 4
# fail 6
# skipped 0
```

The six failures cover both available-reply orders, repeated same-key toggles,
startup reads, explicit refreshes and Open in MRU replies. Controls cover a
rejected older write, failed recovery reads, whole-pixel width normalization and
the immediate non-native fallback.

After the correction, the same command and test file passed:

```text
# tests 10
# pass 10
# fail 0
# skipped 0
```

The regression file is byte-identical between RED and GREEN, SHA-256
`4f28912ad06b15822ca041a4e7b81af9bf38c9c107e7d336215af71250665057`.
The tests choose among available external replies, not private queue internals.
They assert mounted switch state, shared store reads and isolated persisted
fixture values. Tests remain unchanged and no gate was disabled.

Eight existing preference and terminal-policy neighbor cases also passed:

```bash
node --loader ./.oc-tmp/app-pref-neighbor-loader.mjs --test \
  src/settings/appPrefs.test.ts src/settings/prefs.test.ts \
  src/features/terminal/tabs.test.ts
```

That local loader provides React from the small dependency folder and sets
`isTauri()` false. It rejects any native invocation. This is unit-test coverage,
not native persistence proof. Full repository typecheck, build and hosted
workflow outcomes are recorded on the pull request when available.

## Correction and limits

Fix Root Causes places the correction in the shared store, not individual
switches. Model the Domain separates a confirmed `AppPrefs` snapshot from an
ordered set of pending typed updates. A private native operation queue orders
reads, preference writes and MRU mutations. Each response publishes its confirmed
snapshot with still-pending updates applied. A rejected write removes only its
own optimistic update. Recovery reads use the same queue and cannot erase newer
pending choices. Failed recovery falls back to the last confirmed snapshot and
later operations still run. The browser fallback and public APIs are unchanged.

Only `appPrefs.ts`, the new mounted test and this evidence note change. No
screenshot or recording is available because browser and native admission are
closed. Mounted React tests do not prove real database ordering, cross-window
synchronization, actual configuration paths, process restart, installed-app
behavior, native relaunch or visual parity. Those behaviors remain unverified.
