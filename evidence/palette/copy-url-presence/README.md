# Copy URL requires a resolved workspace

Conductor Rebuild compared retained Conductor 0.87.6 renderer source with OpenConductor main `7af2b95aa74dff985fb6b745f7cc080287d35ea6` on 11 November 2026. The affected adapter and callback chain were rechecked unchanged against fresh main `1b75772349ee3e97b4f4ac9dec594d67b3048e15` before the fix. The scope is only the palette's Copy URL row eligibility. Clipboard contents, link protocols, host dispatch, shortcuts, and other action predicates are unchanged.

## Retained reference chain

The real-app decoded asset is `renderApp-D_fmY7hW.js`, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`, recorded in the [frontend manifest](../../frontend/tauri-assets-manifest.json). Retained message `67527dab-e807-4b15-b0af-7ca073ee69a2` contains the complete slice from `function m_a` to immediately before `function kUi`. Its 33,696 bytes were rehashed unchanged as `d85c8162df1b78af115c98cfc4df4a0111412b985168742af4667b9cff21f506`.

The following offsets are zero-based UTF-8 byte ranges within that retained slice, with an exclusive end.

- `[4286,4310)` is `Dt={localWorkspaceId:jn}`, SHA-256 `e978eefeb2bbd2dda92b000303f73c0aeb3aa8d3f217d6da8a273ec39c3bfed4`.
- `[4339,4360)` is `const{data:Xt}=Ms(Dt)`, SHA-256 `c6d1effd55fcd8d6a72d7e2b63a04b84bd5c325624b05a12a50d7eedaa98d256`.
- `[20922,21010)` begins `case"workspace-actions":return Xt&&p.jsxs(ff,{heading:"Workspace actions",children:[Tr&&`, SHA-256 `9ed6556a87e6f2606091306a89384510cf58c58426b4702541e50eda0506876b`. The resolved query value `Xt` gates the entire group. The separate `Tr` predicate gates the File picker rows, not Copy URL.
- `[22651,22869)` is the complete Copy URL row, beginning `p.jsxs($o,{value:"copy-url",onSelect:_a` and ending after its `workspace.copyLink` hint. Its 218 bytes have SHA-256 `bc26f2c0c03abb580916fbc2a750760d65680fff38f7880a1443e20e80acee2b`. It has no additional lifecycle or path predicate inside the group.
- `[18757,18768)` is `const _a=OS`, SHA-256 `9cb605ff15645383ec9e473253edfee69f591ef074f16b3fb39331d25e3e5117`.
- `[16786,16874)` is the complete dispatcher branch `else if(Gn==="copy-url")jn&&XV({localWorkspaceId:jn,sessionId:Yr==="session"?Oi:void 0})`, SHA-256 `4d880d799f80e1beba3eeb1fa2c8b4dc66c15617d3eb18d7219dfba96fdadec3`. This establishes the row's consumer identity, not the implementation of `XV` or its clipboard effects.

The retained REA directory attempt `ev_c7cf2e89ee2d0f3255714fc1200ae72ca84ab7cdde868ecb3ea1c046f6d7915d` timed out after 90 seconds with zero AST nodes visited. Loose-file input was unsupported, and the larger renderer analysis exhausted its heap. Those attempts remain incomplete semantic evidence. The finding uses bounded static reading of already-held real-app source, not new acquisition, native execution, or a successful semantic-analysis claim.

## Reachable mismatch on checked main

`src/state/store.ts` restores saved selection while the initial repository placeholders still have empty workspace arrays. Later hydration validates the selection. The palette can open before that hydration completes.

`src/App.tsx` resolves a selected workspace from the selected repository's rows, or from the complete matching `state.archivedOpen.workspace`. Its `paletteCommands.copyUrl` already does nothing when this resolution fails. `PaletteHost` forwards the Copy URL row to that existing callback. `CommandPalette.choose` then closes the palette.

The palette adapter still includes Copy URL unconditionally in its action entries. The result model only checks the non-null selected ID before displaying the Workspace actions group. A restored but unresolved selection therefore offers a Copy URL row that closes the palette without copying anything. A same-ID row in another repository or an unrelated archived view does not resolve App's selected workspace. Loading archived search results is not the same as opening an archived workspace.

The intended correction gives Copy URL the same App-equivalent presence resolution already used by View archived workspaces. A complete matching archived view remains eligible before and after search results load. Pathless, unstarted, setup, and failed local rows remain eligible because the reference gate checks presence, not File picker readiness. No new clipboard or host behavior is needed.

## Regression contract

Only additive tests are appended to `src/palette/fromAppState.test.ts`. All 22,282 pre-existing bytes remain identical to checked main, SHA-256 `7bab44562d29bc043ed56983caf137c5c2d4496d24e466dbe65e0bfbe2bfc22b`. No assertion from #953, #958, #966, or #975 is rewritten.

The new cases check both action entries and actual All and Actions results for empty, `copy`, and `url` queries.

- Startup placeholders, missing workspace, wrong repository, and missing repository must omit Copy URL.
- An unrelated retained archived view must not resolve the selection before or after archived search results load.
- A complete matching archived view must retain Copy URL and its shortcut before and after search results load. Archive workspace and File picker stay absent.
- Resolved local states `active`, `ready`, `initializing`, `setting_up`, `unstarted`, `failed`, and an unspecified state retain Copy URL without requiring a path.
- Home and root omit Copy URL despite a retained archived view. Selection identity and Recent entries remain intact.

## Verification state

The tests-first published head `f83f98ac21e6b0d272d21f94cc0c1d1df269d8b5` established behavioral RED in automatic [CI run 42944920609](https://github.com/reason-machines/openconductor/actions/runs/42944920609). Both frontend jobs reported 2,279 tests, 2,272 passing and seven failing. All seven failures are the new Copy URL absence cases: startup placeholders, missing workspace, wrong repository, missing repository, unrelated archived view before and after results load, and no workspace selection. Each failure reports `actual: true`, `expected: false` from `assertCopyUrlEligibility`. The matching archived-view and lifecycle-positive controls passed.

The fix adds only Copy URL to the existing View archived workspaces resolved-presence predicate. All prior action predicates, clipboard callbacks and payloads stay unchanged. The complete 26,600-byte failing-before test file remains byte-identical, SHA-256 `973e502c550e2e91209560957ed29a34a385da00711d882a75cf8b668bfc3739`. The 22,282-byte pre-existing prefix also remains unchanged.

Passing-after behavioral verification is pending automatic hosted CI on the fix. Local validation is limited to retained-source length and hash checks, the pre-existing test-prefix and complete published test-file comparisons, `node --experimental-strip-types --check src/palette/fromAppState.ts`, `node --experimental-strip-types --check src/palette/fromAppState.test.ts`, and `git diff --check`. Syntax and whitespace checks do not count as behavioral GREEN.

Dependency installation, local behavioral tests, builds, browser execution, native execution, reference acquisition, and manual workflow dispatch were not run. Automatic hosted workflows provide the behavioral checks. No screenshot is available because this slice does not admit browser or native capture. Installed-app activation, real clipboard effects, and visual parity remain unverified. #975's cancelled exact-head E2E remains an uncredited gap, with no replacement watcher.
