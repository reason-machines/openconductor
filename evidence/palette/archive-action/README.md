# Archive action for an open archived workspace

Conductor Rebuild compared retained real-app renderer text with OpenConductor main `4a4a35899c007be0c7d0597fcf8df13c9b252601` on 10 November 2026. Ledger lease `ARCHIVE-ACTION-15` covers only the archive-action filter in `src/palette/fromAppState.ts`, additive behavioral regressions in its test file, and this note. The predecessor #953 is merged, not a stacked base.

## Retained reference chain

The decoded real-app asset is `renderApp-D_fmY7hW.js`, 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. [The frontend manifest](../../frontend/tauri-assets-manifest.json) records its provenance from Conductor.app. Retained source message `67527dab-e807-4b15-b0af-7ca073ee69a2` contains the held slice from `function m_a` to immediately before `function kUi`. The slice is 33,696 bytes, SHA-256 `d85c8162df1b78af115c98cfc4df4a0111412b985168742af4667b9cff21f506`, rehashed unchanged before this edit.

These are zero-based UTF-8 byte offsets within that slice, end exclusive where a range is given.

- The route-derived selected ID becomes `const jn=on` at 4241. The query input is `Dt={localWorkspaceId:jn}` at 4286, and `const{data:Xt}=Ms(Dt)` at `[4339,4360)` reads that workspace.
- `mr=Xt?.state==="archived"` at `[4498,4523)` identifies the archived state. `dr=en!=="read"` derives write access. The archive predicate is exactly `Or=dr&&!mr` at `[4639,4649)`.
- The Workspace actions group begins `case"workspace-actions":return Xt&&p.jsxs` at 20922. The archive row begins `Or&&p.jsxs($o,{value:"archive-workspace"` at `[24551,24591)`. Thus even a selected workspace with write access does not get that row when archived.
- The matching dispatcher begins `else if(Gn==="archive-workspace")` at `[15557,15590)`, followed by `jn&&Or?Jo({localWorkspaceId:jn}):jn&&er.warning("Missing write access to archive workspace")`. The same predicate gates both rendering and dispatch in the reference.

This closes the archived-state-to-row-and-dispatch chain. It does not close the unrelated `pPt`, `JV`, focus or keyboard-override producers, and none is implemented here. The change copies only the proven archived exclusion into the existing local adapter, not a new permission model.

The retained full-frontend REA record `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367` inventories the matching asset but skips renderer parsing after worker heap exhaustion. Bounded semantic record `ev_c7cf2e89ee2d0f3255714fc1200ae72ca84ab7cdde868ecb3ea1c046f6d7915d` times out with zero files parsed. These remain REA gaps, not successful semantic or runtime verification. This finding is a bounded static reading of already-held real-app source. No new acquisition or analysis process ran.

## Reachable OpenConductor mismatch

At the checked main commit, the store's `openArchivedWorkspace` transition puts the archived workspace in `state.archivedOpen` and selects its ID. It does not add that workspace to `repo.workspaces`. `PaletteHost` passes the same state to `paletteDataFromState`; the archived-result list loads separately when the palette opens.

The adapter retains the non-null selected ID, but its `selectedWorkspace` lookup searches only repository workspaces. Its action filter handles next-unread and View archived workspaces, not Archive workspace. The result model consequently offers Archive workspace in both All and Actions for the open archived selection, including before the separate archived list finishes loading. The host's existing archive handler dispatches that selected ID. The fix is restricted to removing the inapplicable palette action; it does not change that handler or assert that repeated archiving mutates stored data.

The proposed minimal correction excludes Archive workspace when the selected repository workspace is archived or when `state.archivedOpen` identifies the current selection. A retained archived view for a different, active selection must not hide its archive action. Other commands, selection identity, Recent ordering, #953 update ordering, host behavior and keyboard handling stay unchanged.

## Regression and verification

The additive tests use invented in-memory AppState values shaped like the real `openArchivedWorkspace` result, not an archived workspace inserted into an active repository list.

1. Open archived selection before the separate archived results load. Archive workspace must be absent from empty and archive queries in All and Actions.
2. The same selected archived workspace after archived results load. The action stays absent. The selected ID, Recent entries and unrelated action IDs retain their existing behavior.
3. An active selection and Home/root selections with an unrelated retained archived view. The active workspace keeps Archive workspace; no-selection result groups do not offer it.

The test-only milestone leaves production code unchanged. Automatic hosted failing-before verification is pending. The exact regression assertions must remain unchanged through the production correction.

Local validation is limited to syntax and whitespace checks, with actual results recorded in the pull request. No local test execution, dependency install, application, build, browser, native command, reference acquisition or manual workflow dispatch runs. No screenshot is available because runtime capture is outside the admitted scope. Hosted model tests do not establish packaged macOS activation, native dismissal or full visual parity. Protected #847/#916 and other owners' key-equivalence, override and focus investigations remain untouched.
