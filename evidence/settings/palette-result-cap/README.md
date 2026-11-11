# Settings palette results are not capped

Conductor Rebuild compared fetched main `2b079f13e07b580d26191f7f1f50b4d21e62174e` with retained Conductor 0.87.6 compiled assets.

## Source counterexample

Search for the literal `settings` in the command palette's Settings or All tab. Use a loaded local, non-cloud state with no repository, internal settings, Big terminal, cloud setup or organization pages.

The checked inventory contains at least 62 fixed user rows shared by both apps. `rows.json` records their real labels, ids, registration offsets and hashes. All are literal user-scope members of `fUi`; they pass `xGt`, `mUi`, `pUi` and `Uba` under those gates. The subset excludes repository rows, harness aliases, internal-only rows and panel rows. No dynamic names are needed.

The reference palette maps every admitted row to `value: settings-${item.id}`. For the query `settings`, the scorer's contiguous prefix path yields `0.99`, above `Hba = 0.2`. The complete retained command consumer filters every registered item, sorts it and renders positive scores. The Settings map has no slice.

OpenConductor's `settingItems` ranks the same kind of results, then applies `slice(0, RESULT_CAP)` with a cap of 50. At least 12 of the 62 shared rows cannot all appear. This is a lower bound, not a complete registry count or a claim about the identity of the 51st sorted result.

The intended fix removes only that Settings slice. Workspace and project caps, score ordering, blank-query page visibility and nonmatching-query filtering remain unchanged.

## Provenance

- Retained renderer `renderApp-D_fmY7hW.js`, 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- REA lineage `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367` and `ev_31e784ad5df9eb3adf831a9480513725777adf14dc854992d2aeeeff178d3524`.
- Complete command consumer, UTF-8 `[2903072,2912493)`, 9,421 bytes, SHA-256 `711dd32921893417f1be06a115aa603f33a6869df63c038c11960b5bc835c94f`.
- `qet`, UTF-8 `[10869375,10869489)`, 114 bytes, SHA-256 `7f0393d83150cd96dfbcf75f379600ff74c9014b61b05aa6827ce30018e01882`.
- All eight supplied source-packet file hashes, six exact asset spans and ten scorer/adapter spans were checked against the retained renderer.

In the unchanged row fixture, `registration_utf8_start` marks the `ir(` call. The hashed object starts three bytes later. `registration_utf8_size` and `registration_sha256` cover that object, not the call prefix. The source verifier checks this convention for all 62 rows.

The original REA JavaScript worker exhausted its heap and skipped parsing. The comparison uses inert compiled-byte excerpts and the repository's text metadata reader, not a semantic call graph, original source or execution of reference JavaScript. `source-reachability.json` preserves source pins and the bounded assessment.

## Verification

The reproducible static check is:

```bash
python3 evidence/settings/palette-result-cap/verify-source.py --reference-renderer /path/to/renderApp-D_fmY7hW.js
```

It checks nine baseline source identities, eleven retained reference spans, all 62 row object hashes, the unchanged regression fixture and the sole Settings-cap deletion. It does not execute reference or product JavaScript. [Publication source receipt](publication-source-check.json) records the result.

The intended behavioral check is:

```bash
node --test src/palette/settingsResultCap.test.ts
```

The regression builds the production Settings index using the actual page and agent definitions. Both Settings and All searches must reach every entry, including the 62 shared reference rows. A third case preserves the blank-query page list, nonmatching queries and Actions-tab isolation.

At source preparation, this command has **not run**. Expected before-fix contract: two result-set assertion failures and one passing control. Expected after-fix contract: the same three cases pass with no skips. Only the existing admitted executor may run it after all older queued units; no new runtime or priority change is part of this work.

Native behavior, screenshots, installation, persistence and visual parity are **not verified**. No native or browser execution was admitted for this lane. Frozen RESULT and earlier assistant-filter fixtures are unchanged.
