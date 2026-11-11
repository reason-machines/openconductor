# Branch editor closes when a rename is submitted

Conductor Rebuild owns HEADER-SUBMIT-CLOSE-271-01. This change is limited to the branch-submit controller, its existing regression file, and this evidence note. It does not alter branch sanitization, workspace identity, the header component, prefix display, menus, the backend, or adjacent WorkspaceView work.

## Source-backed discrepancy

Fresh main `ca6f5fafb6a568678722577afe734d8d04d6ca41` contains the same header controller, component, test, and retained trace as the initial `675b2347537ac8e1ba4aac669207701bc29f0a16` audit.

The [retained shipped trace](reference-static.json) records Conductor 0.87.6 renderer `renderApp-D_fmY7hW.js`, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`, and index `index-BGEQ8YjU.js`, SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`. The trace is 8,311 bytes with SHA-256 `4901177a0829b07b8414a5d4b9c8adf091f9549f8dc9dafac5ebbcb79a01588e`.

`ACi` selects `bro` for an active local workspace. Inside `bro`, `c/u` is the edit-state pair, `k=E`, and the input uses `onBlur:k`. `E` returns for empty text or an existing pending mutation. Otherwise it calls the branch mutation if the sanitized draft differs, then calls `u(!1)` without awaiting completion. The input is rendered only while `c` is true. This establishes submit-close ordering in shipped syntax, not an observed browser paint or native execution.

The complete `bro` excerpt has SHA-256 `ef7bdf8d88ab7587123cab8ccf81848f4bed54685987b2fe2373ff4cbbcd613b`. Independently checked half-open UTF-8 ranges within that excerpt are:

- `[73,114)` defines the draft and edit-state pair.
- `[392,508)` contains the complete `E` submit callback, including `r.mutate(...)` followed by `u(!1)`.
- `[552,562)` binds `k=E`.
- `[925,931)` gates the input on `c`.
- `[1320,1408)` binds the actual input's change, blur, and key handlers.

The `[392,508)` submit span has SHA-256 `8581d7c1c61527f7aaf555da67ba4fb8d790f8cc05e28160a407ac2f16a8066d`. Its retained declared absolute UTF-8 range is `[7206617,7206733)`. Absolute asset offsets were not independently remapped in this pass because the full renderer was not read. The exact within-excerpt ranges and hashes were checked.

OpenConductor's current controller instead sets `pending=true`, awaits the rename, dispatches the result, awaits the user-set marker, and only then clears `editing` in `finally`. The actual component reads `controller.state`, renders its input whenever `editing` is true, and disables that input while `pending`. A changed submission therefore leaves the disabled editor selected by the source until asynchronous work finishes.

The initial source pins are:

- Controller blob `aff20789d567be86f68155c67357b96b7b17cae5`, SHA-256 `38c36f6d8ba4e8fbfa747c75fd8261b0b6b76ad0616d97c4cf22237540b503ab`.
- Component blob `4ab9edb9b95e9d6770ffbec5b0b1f14dc5364027`, SHA-256 `e353815e7242733bfc33c702e214a52f46e546be81d316a44bd438fa946bb18d`.
- Existing test blob `a3f93caaa63e0395fbf32df09e2fd36946db86ca`, SHA-256 `b45d8aa8ce6b0fcad7f7c795261abb471d3bf3a47ed9d22ad871e87970a28e3c`.

## Same-build alias receipt

The already-admitted renderer import packet used for #952 is separate from the held basename archive. Its 13,504 bytes have SHA-256 `711b96377098ad3838934209f1710cb85acfc256abecae07605139daf0670ed5` and declare `from"./index-BGEQ8YjU.js"`.

The exact `h8 as ZTn` import has relative bytes `[4905,4914)`, declared renderer bytes `[57896,57905)`, and SHA-256 `8a22b520caa04c2585a111915246367a5301f1b3ee47ee3dad55d182f194d715`. The adjacent `h7 as yDt` has relative bytes `[4895,4904)`, declared renderer bytes `[57886,57895)`, and SHA-256 `1fd38b0cd4930f16f3a364446e33d6208dc2690f8d76bda8e3d9a46391f3d6b2`.

The retained [REA record](../frontend/rea-analyze-javascript-application.json.gz), evidence ID `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`, contains index export edge `jag_edge_7b8e0177c335c2d22af411952634677d0b330bab24cb2da507a1ed293794b7f0` joining `pOe` to `h8`, and edge `jag_edge_65521baac51d872f3ee4164bf9fdb0f1aacf022fc2a9f0cc42340f1ab51ae38c` joining `aVt` to `h7`. Both are bound to the same index artifact hash. The `h8` export observation is at index line 2034, columns 31400–31409, and identifies `pOe`. Its return-shape record points to callable range `213280:213339`, matching the held sanitizer body. These are static relationships, not runtime calls. The complete original index export bytes were not reread.

The ordering correction does not depend on changing sanitizer semantics. It follows the direct, renderer-local `E/k/c/u/onBlur` chain for an already-open editor.

## Regression contract

The focused additions mount the actual `WorkspaceBranchHeader` with real React hooks and the actual controller. Only native I/O, icons, and the unrelated context-menu components are replaced at the boundary. Deferred rename and preference-write promises keep both asynchronous stages observable without sleeps.

Four cases cover Enter, blur, rename rejection and retry, and empty/unchanged/Escape controls. A changed submission must remove the input before the rename promise resolves. Repeated events must make only one rename call. Dispatch and preference-save must not precede successful rename. Pending re-entry stays blocked, and backend failure retains its error and original branch for a retry. Existing controller, archived, copy, sanitization, and identity assertions are unchanged.

The existing automatic workflow discovers the file with `node --test "src/**/*.test.ts"`. Local Node execution, provisioning, builds, product runtime, workflow dispatch, and workflow reruns are not used. The test-only publication must fail for the intended immediate-close assertion before the controller correction is published.

## Verification state

- Passed: local Python static audit, exact retained trace digest, same-build REA graph membership, six excerpt spans, renderer import hashes, index export edges, three current-source pins, and tracked/staged whitespace checks.
- Not run yet: automatic hosted behavioral RED and GREEN. No test result is claimed by this preparation checkpoint.
- Not run: browser, native app, real Git rename, real persistence, clipboard, caret or focus behavior, and side-by-side visual acceptance. No screenshot is available because product browser/native execution is excluded.

## REA and acceptance limits

No reference JavaScript was executed. No acquisition, new asset reader, binary rehash, install, native action, or provider action was performed. The renderer's historical semantic-analysis heap limit remains a coverage gap. The original complete assets were not reread; the audit verifies admitted trace bytes, their relationship to retained artifact identities, and the named static callback chain only.

Build the Lever shaped the rerunnable local Python receipt. Prove It Works keeps static-source evidence distinct from hosted component behavior and native acceptance. The basename no-use/no-edit hold, image-hover restrictions, #847, and #916 remain unchanged.
