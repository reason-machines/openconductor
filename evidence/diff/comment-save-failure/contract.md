# EDIT-SAVE-FAILURE-FEEDBACK-DE6-01

Conductor Rebuild source-only handoff. This is one counterexample from the ledger-cleared comment-editor dismiss/commit leaf census, not a product patch or a behavioral result.

## Source finding

Checked latest default main: `e89bede5597767d131b1c4c9199fb38403d31209`. The affected ReviewComments, store/API and three historical fixture bytes are unchanged from the earlier `5d182b1e374d1b8b2676b17da59c45b6e74834f8` source read. WorkspaceView was refreshed and its actual notify/annotation/actions joins were re-read.

For an existing user-local comment, Conductor's complete retained `kVo`/`TVo` Edit callbacks call `ble.startEdit`; `Pae` retains that draft, `wet` dispatches it to `SVo`, and the existing-comment Save branch awaits `ySr`. The renderer import and index export map `ySr` to `K7t`, which returns `zn.updateCommentText`. That method awaits the database update and refreshes, without swallowing rejection. `SVo` catches the rejection and calls `dv("Failed to save comment", {description: rc(error)})`. `dv` calls `kt.error`; `rc` maps through index export `ek` to `We`, which formats Error.message or String(error). The title and error description are separate in the original source. Draft cleanup and dismissal follow the awaited successful operation, so they do not run after a rejected save.

At checked main, `CommentItem` mounts the existing inline Composer for a retained edit. Save calls `ops.edit`; `ops.edit` calls `run(store.edit(...))`. The Tauri store returns the rejected invocation unchanged. `run` catches that rejection, sets a generic toolbar error and returns false. The draft remains intact, but no operation-specific error notification is emitted. `actions()` renders only `Comment failed`, with the error in a tooltip. `WorkspaceView` already passes its `notify` callback to the hook at line 1175; it renders annotations at line 1501 and actions at line 1536. This is a missing operation-specific failure-feedback leaf, not a missing notification transport or draft-retention problem.

## Narrow proposed scope

Existing-comment Save failure only, inside `ReviewComments.tsx`, plus a NEW fake-store mounted regression and evidence. Reuse the existing Notify transport; keep all old fixtures, baseline pins and assertions intact. Preserve success, dirty cancellation, blank-submit guards, retained edit identity, and the existing generic toolbar error. Do not change replies, new-comment creation, chat attachment semantics, delete, resolve, IME, Settings, media, conflict, headers, backend schema or native behavior in this unit.

Original title plus description do not fit the current two-argument `Notify(kind, message)` shape directly. Recommended minimal adapter: emit one error message `Failed to save comment: <formatted reason>`, following the existing remote-resolve error style. That flattening is an OpenConductor design choice, not an original UI string or observed visual match. Do not widen the global notification API merely for this leaf without fresh design justification.

## Minimal new regression contract (NOT IMPLEMENTED / NOT RUN)

Mount actual `useReviewComments`, actual CommentItem/Composer and real React; use the real local comment store for saved bodies, wrapping only its edit operation with a controllable rejected/pending Promise. Supply the actual Notify callback as a recorder. Stub only unused external boundaries and DialogFrame/markdown as the existing fixtures do; inject the same Error constructor into the VM so cross-realm errors do not fake a formatting defect.

1. Reject Save with Error("disk full"): exactly one operation-specific error notification, original saved body unchanged, edited draft still open and unchanged; generic failure indicator remains.
2. Reject Save with a string reason: exactly one notification with the string reason, same retention guarantees.
3. Pending Save: no error notification and no dismissal before settlement; then rejection gives one notification and retains the draft.
4. Successful Save: saved body updates, only that draft closes, and no failure notification.
5. Retry after rejection: one notification for the failed attempt; successful retry updates the body and closes the draft without another notification.
6. Dirty Cancel then Keep editing, explicit Discard, and blank submission controls: no save or save-failure notification. Keep their existing confirmation/retention behavior.
7. Two comments: failed save of one does not clear or persist the other's draft.

Freeze the new fixture before touching product code. The same bytes must produce the intended failure-feedback RED against untouched fresh main, with non-error controls passing, and GREEN after the minimal correction. Preserve the existing six-case retention, sixteen-case IME and other historical regression fixtures byte-for-byte. No assertion by source-text matching qualifies as behavioral proof.

## Provenance and limits

Original Conductor 0.87.6 retained REA-extracted renderer: `renderApp-D_fmY7hW.js`, 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.

Original index: `index-BGEQ8YjU.js`, 3,493,297 bytes, SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.

Exact whole assets, original retained spans, new helper/mutation spans, alias joins and current-main copied source hashes are checked by `verify_source.py`. Full original assets are intentionally not repeated in the packet; use the retained source loan. The historical REA semantic-analysis heap/result-budget limitation remains; no new REA gap or fresh Mac observation occurred. Original JavaScript was never evaluated.

Passed here: source identity/span/alias/current-main joins and tracked-diff check. NOT RUN: new regression, Node, dependency install, typecheck/build, browser, Tauri/SQLite, package, native, provider and visual verification. Source matching does not prove a rendered toast or actual error occurrence.

## Ownership and routing

Ledger owner ddfc6518 reserved SAMEde6 SOURCE-only EDIT-SAVE-FAILURE-FEEDBACK-DE6-01 catch/notify leaf pending this sealed qualification. Root authorized continuation to supported fresh-main delivery once unowned/qualified, with ordinary runtime coordinated through ACC. de6 has not edited any tracked product/test file, started runtime, or published a new PR. The existing de6 branch already delivered merged #1151 and must not be reused, stacked or silently rebound. A sole isolated fresh-main child publisher is the supported delivery route; no second writer has been started at packet seal. No source-only permission implies runtime admission.

Notification denial remains solely with c18e1b05. SAME49's frozen39c remains untouched. This future comment unit is outside the existing bounded992 package cut; do not add it as a gate or start duplicate package/native work.
