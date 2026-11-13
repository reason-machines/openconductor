# View archived workspaces requires a resolved workspace

Conductor Rebuild compared retained Conductor 0.87.6 source with main `166139398538f0e58eabd3870facbb1702ea665b` on 11 November 2026. This correction is limited to the palette's **View archived workspaces** row eligibility. It does not change selection, archived-result loading, activation, other actions, or keyboard handling.

## Retained reference evidence

The decoded `renderApp-D_fmY7hW.js` asset has SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`, recorded in the [frontend manifest](../../frontend/tauri-assets-manifest.json). Retained source message `67527dab-e807-4b15-b0af-7ca073ee69a2` supplies a renderer slice beginning at `m_a`, renderer byte 10,889,115. Its 33,696 bytes have SHA-256 `d85c8162df1b78af115c98cfc4df4a0111412b985168742af4667b9cff21f506`.

The following spans were read again from that retained slice. Ranges are zero-based UTF-8 bytes with an exclusive end, relative to the slice.

- `[4286,4310)` is `Dt={localWorkspaceId:jn}`, SHA-256 `e978eefeb2bbd2dda92b000303f73c0aeb3aa8d3f217d6da8a273ec39c3bfed4`.
- `[4339,4360)` is the local query result declarator `const{data:Xt}=Ms(Dt)`, SHA-256 `c6d1effd55fcd8d6a72d7e2b63a04b84bd5c325624b05a12a50d7eedaa98d256`.
- `[28581,28800)` is the complete row expression beginning `Xt&&p.jsxs($o,{value:"view-archived-workspaces",onSelect:_a` and ending after its **View archived workspaces** label. Its 219 bytes have SHA-256 `5571e9498b369416ba11818f087d4cb4dc4e4ef53bb6b02647255c2e85f0ff0b`. The predicate is the resolved query value `Xt`, not the route ID `jn`, a ready-state check, or the separate File picker `Tr` predicate.
- `[18757,18768)` is `const _a=OS`, SHA-256 `9cb605ff15645383ec9e473253edfee69f591ef074f16b3fb39331d25e3e5117`.
- `[13845,13931)` is the complete dispatcher branch `if(Gn==="view-archived-workspaces"){g("workspaces"),v({showArchived:!0}),u("");return}`, SHA-256 `8d70cecdf686be1e63159aa8ee57e7d8074695805a1d3bdb4142968f13529ca0`. This confirms the row's local consumer identity. Its side effects are not changed or executed here.

The earlier bounded REA attempt returned partial receipt `ev_c7cf2e89ee2d0f3255714fc1200ae72ca84ab7cdde868ecb3ea1c046f6d7915d`: loose-file input was unsupported, and the directory attempt timed out after 90 seconds with zero AST nodes visited. The larger renderer analysis also exhausted its heap. These are evidence gaps, not successful semantic or runtime verification. The [File picker evidence](../file-picker-eligibility/README.md) records the retained renderer identity and separate `pPt`/`Tr` chain. This comparison reuses already-held source only, without a new reader, acquisition, REA process, or native session.

## Reachable local mismatch

At the checked main commit, `src/state/store.ts` restores saved selection in `load()` before repository workspaces arrive. Its initial repository placeholders have empty workspace arrays. The later `hydrate` transition validates the selected row. `PaletteHost` still receives this initial state and opens the palette independently of row hydration.

`src/App.tsx` resolves an open workspace by finding the selected repository and then its selected workspace. If that lookup fails, it uses the actual `state.archivedOpen.workspace` only when that workspace's ID matches the selection. `AppState.archivedOpen` stores a complete typed workspace object, not an independent ID. The `openArchivedWorkspace` transition selects that object without inserting it into active repository workspaces.

The palette adapter instead includes **View archived workspaces** whenever `activeWorkspaceId` is non-null. A restored route or stale selection therefore exposes the row even when no matching workspace is resolved. Finding the same ID in another repository is not sufficient either. Separately loaded archived search results are list entries, not the selected archived view.

The correction must use the same repository-row or matching archived-view resolution as App for this one action. A resolved unstarted or failed workspace remains eligible because the reference gate checks presence, not readiness. The existing File picker, Archive workspace, Recent ordering, Open in, host, and keyboard predicates remain unchanged.

## Regression contract

Only additive tests are appended to `src/palette/fromAppState.test.ts`. All 18,022 pre-existing bytes remain identical to main, SHA-256 `d1f9b5b4959e9ea747f22010d5a89c3928c87c2c94ce6aabfaab2ce870cf4a29`. No #953, #958, or #966 assertion or equality projection changes.

The new assertions check the adapter's action entries and the All tab's actual Navigation results, with empty and `archive` queries.

- Startup placeholders, a missing selected workspace, a workspace present only in another repository, and a missing repository must omit the row.
- An unrelated retained archived view must not resolve the selected workspace, before or after archived search results arrive.
- The complete matching archived view must retain the row before and after archived search results arrive. Its selection and Recent entries remain intact, while Archive workspace and File picker remain absent.
- Resolved local states `active`, `ready`, `initializing`, `setting_up`, `unstarted`, `failed`, and an unspecified state retain the row, even with an unrelated archived view retained.
- Home and root omit the row despite a retained archived view.

## Verification state

The tests-first head `f24bfca380fe6f5cc23163f20f513e7adb28c747` reproduced exactly six intended failures in automatic [CI run 42938464157, frontend unit job 130254250740](https://github.com/reason-machines/openconductor/actions/runs/42938464157/job/130254250740). Cases 1538–1542 and 1544 failed because the action was present when the expected value was false. The suite reported 2,180 passed, six failed, and zero cancelled or skipped tests out of 2,186. The four new positive/no-selection control cases 1543 and 1545–1547 passed, as did every pre-existing test.

After confirming that RED result, the production change replaces only `VIEW_ARCHIVED_ACTION`\'s raw ID check with App-equivalent resolution of the selected repository row or complete matching archived workspace object. Fresh main remained `166139398538f0e58eabd3870facbb1702ea665b` before this edit. The test snapshot remains SHA-256 `7bab44562d29bc043ed56983caf137c5c2d4496d24e466dbe65e0bfbe2bfc22b`, byte-identical to RED. Hosted passing-after verification is pending.

Passed on Reason Cloud: all five retained span length and hash checks, retained slice hash and JavaScript syntax, the pre-existing test-prefix comparison, `node --experimental-strip-types --check src/palette/fromAppState.test.ts`, and `git diff --check`.

Dependency installation, local behavioral tests, local builds, browser execution, and native execution were not run under the existing runtime limits. Automatic hosted CI will run `node --test "src/**/*.test.ts"` and the repository's existing typecheck and build checks. No workflow dispatch or rerun is needed. No screenshot is supplied because browser and native capture are outside this source-only slice. Static row declarations and adapter tests do not establish installed-app behavior, activation, asynchronous native timing, or visual parity.
