# Archived workspace matches in All-tab search

Conductor Rebuild compared the already-held decoded Conductor renderer with current OpenConductor main `0244d800782a3eaf811aac53fedc8a536218fb2b` on 10 November 2026. Ledger lease `ARCHIVED-SEARCH-15` covers only the All nonempty-query expression and contradictory documentation in `src/palette/search/model.ts`, focused assertions in `src/palette/search.test.ts`, and this note. No palette host, sidebar, native or shared-policy change is included.

## Reference provenance and bounded source closure

The real-app decoded asset is `renderApp-D_fmY7hW.js`, 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. Its identity is recorded in [the frontend manifest](../../frontend/tauri-assets-manifest.json). The retained source message is `67527dab-e807-4b15-b0af-7ca073ee69a2`. The held slice starts at `function m_a` and ends immediately before `function kUi`; it is 33,696 bytes, SHA-256 `d85c8162df1b78af115c98cfc4df4a0111412b985168742af4667b9cff21f506`. The slice was rehashed before this change. All offsets below are zero-based UTF-8 bytes within that slice.

- At 11434, `wd=$u.filter(k_a).filter(Gn).sort(C_a).slice(0,GHe)` constructs active matches. At 11530, `const n0=wd` names that list. `k_a` at 32393 returns `t.workspace.state!=="archived"`.
- The branch at 11765 returns an empty archived list when `!E.trim()`. Otherwise, at 12006, `Gn=$u.filter(S_a).filter(cr).sort(w_a).slice(0,GHe)` constructs archived matches using the same query `E`. At 12108, `const ab=M6` names that list. `S_a` at 32236 returns `t.workspace.state==="archived"`.
- The All-query Workspaces group contains `n0.map` at 30924 followed by `ab.map` at 30990. Both map entries through `aYe` with the same selection handler. This directly supports including archived matches after active matches, not filtering them out or globally mixing the two lists.
- Both lists are capped independently before concatenation. The existing [palette inventory](../../search-palette/README.md) records `GHe` as the 50-result limit. The retained `C_a` and `w_a` compare workspace `updatedAt`; this correction does not change OpenConductor's pre-existing ordering keys or claim full ranking parity.

The full-frontend REA record `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367` inventories the matching asset bytes but marks this renderer's parse as skipped after worker heap exhaustion. The later bounded semantic attempt `ev_c7cf2e89ee2d0f3255714fc1200ae72ca84ab7cdde868ecb3ea1c046f6d7915d` timed out with zero files parsed. These are retained REA gaps, not semantic or runtime passes. The conclusion here is a bounded static reading of already-held real-app renderer text. No new artifact acquisition, analysis process or reference execution ran.

## Current behavior and regression

At the checked main commit, the All-query branch calls `workspaceResults(data, query)` with the default active-only filter. An existing assertion explicitly requires an archived `lima` workspace to be absent. The retained source disproves that assertion. The test-only milestone replaces it with the exact positive result while preserving all Workspaces-tab archive-filter expectations, then adds two cases:

1. Matching active workspaces precede matching archived workspaces even when an archived entry has a newer ordering key. Unmatched archived entries remain excluded. An empty query does not introduce a full workspace list.
2. Sixty active and sixty archived matches produce fifty from each state, active first, rather than one shared fifty-result cap.

The tests use invented in-memory entries and the public result-model function. They do not access a database or real workspaces. `PaletteHost` already handles archived result selection through its existing archived-workspace path; that integration is not modified or newly verified here.

Automatic hosted CI confirmed all three focused failures on test-only head `9915d5b97d25bc1ad3f07a42f882aea11e7b54bd`. The [frontend unit-test job](https://github.com/reason-machines/openconductor/actions/runs/42918197392/job/130185973127) reports `not ok 1426`, `1427` and `1428`: the archived-only match is absent, the mixed results omit both archived matches, and the capped results omit the archived half. The suite reports 2,028 passes and three failures. The separate frontend build job passes typecheck but stops at the same three unit-test failures before building.

Current main was fetched and re-read at `0244d800782a3eaf811aac53fedc8a536218fb2b` before the correction. The minimal fix concatenates the existing active and archived `workspaceResults` calls only in the All nonempty-query branch. Every regression assertion remains unchanged from the failing-before milestone. The test file's Git blob is `754afe2701f0461fada601f43e8a71b002bae8cb` at both milestones.

## Verification and limits

- Local validation is limited to TypeScript syntax checking and `git diff --check`. Actual results are recorded in the pull request after those commands run.
- Hosted failing-before verification passed as a reproduction: the three focused assertions fail for missing archived results. Hosted passing-after verification is pending for the correction. No success is inferred from source inspection or syntax checks.
- Empty-query recents, per-state filtering and caps, Workspaces-tab archive preferences, other tabs, and existing selection handlers are preserved by the bounded scope. The tests specifically exercise result inclusion, grouping, independent caps and the empty-query guard, not native behavior.
- No local unit tests, application, browser, build, package install, native command, manual workflow dispatch or reference capture ran. There is no new screenshot because runtime capture is outside the admitted scope.
- Hosted model tests can establish candidate result behavior only. Actual macOS archived-result activation, packaged execution, native confinement and full visual parity remain unverified.
- The separate Create-section candidate remains unresolved because the held slice calls but does not define `JV()`. No Create-section implementation is part of this change. Protected #847/#916 boundaries remain unchanged.
