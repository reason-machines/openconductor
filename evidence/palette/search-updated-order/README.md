# All-search workspace update order

Conductor Rebuild compared retained decoded Conductor source with OpenConductor main `385bdea15dc8861f3f3c9c3e42405eb8acfe180b` on 10 November 2026. Ledger lease `SORT-15` covers exactly the palette result model, its AppState adapter, their two test files, and this note. The correction is restricted to nonempty All-tab workspace queries. Recent workspaces retain their stored MRU order. The separate Workspaces-tab model keeps its existing ordering.

## Reference identity and complete ordering chain

The real-app renderer asset is `renderApp-D_fmY7hW.js`, 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. [The frontend manifest](../../frontend/tauri-assets-manifest.json) records its real-app provenance. The retained source message is `67527dab-e807-4b15-b0af-7ca073ee69a2`.

The held slice starts at `function m_a` and ends immediately before `function kUi`. It is 33,696 bytes, SHA-256 `d85c8162df1b78af115c98cfc4df4a0111412b985168742af4667b9cff21f506`. This Session rehashed the unchanged slice before editing. The following spans are zero-based UTF-8 bytes within that slice, end exclusive.

- Active matches use `wd=$u.filter(k_a).filter(Gn).sort(C_a).slice(0,GHe)` at `[11434,11485)`. The result becomes `n0` at 11530. `k_a` excludes archived workspaces.
- Archived matches use `Gn=$u.filter(S_a).filter(cr).sort(w_a).slice(0,GHe)` at `[12006,12057)`. The result becomes `ab` at 12108. `S_a` includes only archived workspaces. An empty query returns no archived matches before that branch.
- `C_a` at `[32324,32393)` and `w_a` at `[32167,32236)` both return `e.workspace.updatedAt-t.workspace.updatedAt`. JavaScript's sort therefore places the higher update timestamp first.
- Both call sites sort before the independent `slice(0,GHe)` cap. The All-query Workspaces group then calls `n0.map` at 30924 followed by `ab.map` at 30990. There is no intervening reversal or combined re-sort. Thus active results stay ahead of archived results, and each bucket admits its own fifty newest-updated matches.
- Empty-query Recent workspaces instead derive `$1` from stored recent IDs through `w.map(Gn).filter(E_a)` and render `$1.map`. They do not use either update comparator.

This closes both comparator definitions, their call sites, the cap direction, and their rendered order from one retained source slice. It is bounded static renderer evidence, not native execution or original source code.

The existing full-frontend REA record `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367` inventories the matching asset but skips this renderer's parse after worker heap exhaustion. The bounded semantic attempt `ev_c7cf2e89ee2d0f3255714fc1200ae72ca84ab7cdde868ecb3ea1c046f6d7915d` timed out without parsing a file. These retained REA gaps are not semantic passes. No new acquisition, analyzer process, reference execution, or runtime capture ran for this correction.

## Current-main mismatch

At the checked main commit, `workspaceResults` sorts every bucket by `lastActiveAt`. The adapter fills that field with a near-maximum rank for recently viewed active workspaces. Archived entries receive creation time minus a fixed offset. Neither value is the workspace's update timestamp.

As a result, an old workspace visited recently can precede a workspace updated more recently. Archived matches follow creation order even when their update order differs. Because each bucket is capped after this incorrect sort, sufficiently large result sets can omit a newer-updated matching workspace entirely.

The correction carries a separate workspace update timestamp from the existing state into the result model and uses it only for All-query sorting. The app's existing state allows `updatedAt` to be absent, so the adapter falls back to `createdAt`, as other app consumers do. Invented model fixtures that lack the new metadata retain their existing ordering-key fallback. No persistence schema changes are needed.

## Locked behavioral assertions

The test-only milestone adds these checks before the production correction:

1. Active and archived All-search matches sort by divergent update timestamps, retain stable equal-timestamp order, and keep active results first. Empty-query Recent order remains unchanged.
2. Sixty matching entries per state disagree between recent-visit and update order. Each cap retains the fifty newest-updated entries rather than the fifty highest MRU or creation ranks.
3. The real AppState adapter feeds divergent active and archived update times into All search. Entries without updates fall back to creation time. The same fixture asserts unchanged Recent MRU order and unchanged default Workspaces-model order before the All-search assertion.
4. The existing archived-entry shape assertion gains the new update timestamp, including its creation-time fallback. Existing assertions are not removed or weakened.

The three regressions delivered in #948 remain textually unchanged. All fixtures are invented in-memory data. No real workspace or database is opened.

## Verification and limits

- This test-only milestone has not yet run hosted CI. Failing-before verification is pending, not inferred from source inspection.
- Local checks are limited to TypeScript syntax and whitespace. Commands and decisive results belong in the pull request after execution.
- Production code remains unchanged until automatic hosted CI demonstrates the intended failures. The correction must preserve every regression assertion from that failing baseline.
- No local test execution, dependency install, application, build, browser, native command, reference acquisition, or manual workflow dispatch ran. No new screenshot is available because runtime capture is outside the admitted scope.
- Hosted source tests can verify result inclusion and order. Packaged macOS activation, native focus or dismissal, and full visual parity remain unverified. The unresolved `JV()` Create-section gate is not part of this change. Protected #847/#916 boundaries remain unchanged.
