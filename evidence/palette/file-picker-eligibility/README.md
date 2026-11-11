# File picker eligibility for a local workspace

Conductor Rebuild compared retained Conductor 0.87.6 renderer source with OpenConductor main `50b0a4403ee26d315775869b35958bfe28291ae2` on 11 November 2026. This slice changes only the palette's File picker row eligibility. It does not change activation, global keyboard bindings, host routing, cloud modes, or other palette actions.

## Retained source chain

Helper packet `PALETTE-PPT-TR-RETAINED-HELPER-BE7-01`, source message `7c9b5d75-cc61-47c2-93f2-259fc7fd567a`, closes the producer and import identities. Its REA receipt is `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. The shipped decoded assets are recorded in the [frontend manifest](../../frontend/tauri-assets-manifest.json).

- `renderApp-D_fmY7hW.js` has SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- `index-BGEQ8YjU.js` has SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.

All offsets below are zero-based UTF-8 byte ranges with an exclusive end.

1. Renderer `[70101,70359)` is the complete local function `pPt`, 258 bytes, SHA-256 `50c416585de6a2b8cb0255d0536c586f460ec0a279c76cf1fd603c50838c6bfa`. It returns `unstarted` for `workspace.state === "unstarted"`, then `archived` for `workspace.state === "archived"`. Otherwise it returns `transcript-only` when its remote-host and organization predicates match, or `active` when they do not.
2. Renderer import `[53024,53031)` is `i as Su`, SHA-256 `4069fa499d8ccc91d1df337b2eb0c9ffee1c35a4aa7e49cd661fc9812f8e1923`. Its complete import `[52991,66495)` comes from `./index-BGEQ8YjU.js` with SHA-256 `711b96377098ad3838934209f1710cb85acfc256abecae07605139daf0670ed5`.
3. Index export `[3485082,3485089)` is `Ht as i`, SHA-256 `c661618ab08fe2d730a42fd15afd0be2402c47583ab54785552ed0b4e83e1445`. Index `[2519,2581)` is the complete `Ht` host guard, SHA-256 `8312b9967b2a1f8991751195f8a745c82b8cde68274b4a2f870b08af4add2a5c`. It compares `host.hostingServerUrl` with `M.hostingServerUrl`.
4. Index `[2439,2519)` declares `I0e="/"` and `M={hostingServerUrl:I0e,vmId:""}`, SHA-256 `82c297ed6bcaf8d06dec55961a1bbd4e674ac08000ea7da77e5f26d0b4240c5e`. Thus the local host does not enter `pPt`'s transcript-only branch. No host or organization model is added to OpenConductor.
5. Renderer `[10893639,10893753)` is the complete `Tr` initializer, SHA-256 `2efefad2274ae9cba8c324c0c69bb4c8880721259b62cc5cf825afeb1f52159a`. Its literal is `Tr=(Xt?pPt({workspace:Xt,organizationHostingMode:de,legacyCloudWorkspaceWriteAccessEnabled:Li}):void 0)==="active"`. The selected workspace `Xt` is read with `Ms({localWorkspaceId:jn})` in the same `m_a` function.

Neither renderer `pPt` nor `Tr` is imported. Index's separate `pPt` is a slash-command cache prefix and is not this binding.

The already-retained `m_a` slice is 33,696 bytes, SHA-256 `d85c8162df1b78af115c98cfc4df4a0111412b985168742af4667b9cff21f506`, retained source message `67527dab-e807-4b15-b0af-7ca073ee69a2`. In that slice, the File picker row begins `Tr&&p.jsxs($o,{value:"quick-open"` at byte 21006. The dispatcher contains `else if(Gn==="quick-open"){if(!Tr)return;nr.openDialog(bSe)}` at byte 15942. These two consumers use the same local producer. This patch copies the row gate only and does not claim to reproduce or test reference dispatch.

The large-renderer REA analysis skipped semantic parsing after heap exhaustion. Retained static source closes the bounded producer/import/consumer chain, not native execution. No new reference acquisition or analysis process ran for this patch.

## Local state mapping and mismatch

At the checked main commit, `workspaceFromRow` in `src/state/persisted.ts` preserves SQLite `state` as typed `Workspace.state` and maps archived rows to `Workspace.status === "archived"`. `reposFromDb` excludes archived rows from active repository workspaces, but does not exclude unstarted rows. The optional state field also permits older local workspaces without a stored state. The reference's local producer treats every state except `unstarted` and `archived` as active, including setup and failure states. A guessed ready-only requirement would be incorrect.

The store's `openArchivedWorkspace` transition stores the workspace in `state.archivedOpen` and selects its ID without adding it to a repository. `PaletteHost` passes that state to `paletteDataFromState`; archived search results load separately. A selected archived workspace therefore remains a reachable selection before or after those results load.

The adapter previously kept File picker in `data.actions` for every state. `buildResults` checked only whether the selected ID was non-null before including Workspace actions. It consequently offered File picker for an open archived workspace, an unstarted local workspace, and a selected ID with no loaded workspace. The application's separate activation guards do not make this visible row eligible.

The intended correction filters only `quick-open` using the existing selected workspace and local lifecycle fields. It must retain the action for active local states, including an active selection with an unrelated archived view retained in state. Archive workspace filtering from #958, #953 search ordering, Recent entries, Open in, host dispatch, and keyboard handling stay outside the production diff.

## Behavioral regression and verification

The tests assert observable action entries and All and Actions results for empty and `picker` queries. Fixtures use invented values with the application's actual typed state shape.

- An archived selection lives in `archivedOpen`, not in active repository workspaces. File picker must be absent before and after archived results load, while selection identity and Recent entries remain intact.
- An unstarted local workspace must not offer File picker, even when its path is known.
- Local states `active`, `ready`, `initializing`, `setting_up`, `failed`, and an unspecified state retain File picker and its existing shortcut. An unrelated retained archived view must not disable them.
- A missing selected workspace, Home, and root must not offer File picker.

The older #958 archived-selection test compared every action except Archive workspace with an active selection. That incidental comparison pinned File picker to its old behavior. This patch excludes `quick-open` on both sides of that comparison and adds dedicated negative and positive File picker assertions. Every #958 archive-absence, selection-identity, and Recent assertion remains intact.

The tests are published before the production filter so automatically triggered hosted CI can demonstrate behavioral failure. After the correction, the same regression assertions must pass unchanged. Hosted run identities and decisive results belong in the pull request after they are observed.

Local validation is limited to retained-source length and hash checks, TypeScript syntax checks, and whitespace checks. No dependencies, local tests, application builds, browser sessions, native execution, or manual workflow dispatch are admitted for this work. There is no screenshot because native and browser runtime capture is outside this slice's scope. Hosted tests do not establish native File picker activation, dismissal, macOS packaging behavior, or visual parity. Protected #847 and #916 and other owners' focus, override, and key-equivalence work remain untouched.
