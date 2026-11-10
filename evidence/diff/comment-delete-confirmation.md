# Local review-comment delete confirmation

Conductor Rebuild compared retained Conductor 0.87.6 with OpenConductor main
`d7d316031d97acaff81ebd08ad0884a70c4e57e0` on 2026-11-10. This is a bounded
shipped-source comparison, not native behavior or database parity proof.

## Retained reference and closed JavaScript chain

The retained REA application evidence is
`ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`.
Its large-renderer semantic coverage is incomplete. Hash-checked literal reads
supplement it without executing target code or claiming original source.

The retained renderer has 11,600,457 bytes, SHA-256
`5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`, matching
[the extraction manifest](historical-chip/extraction.json). This lane rehashed
that complete retained asset. Complete card definitions use UTF-8, zero-based,
half-open ranges:

- Detail card `kVo`, `[9416841,9419019)`, SHA-256
  `751ec5564b7060c6ad6edadaf7cf4929b6386ed56337ceb6398614fb4db80221`.
- Compact card `TVo`, `[9419019,9420917)`, SHA-256
  `fe3c7ce2238d53ec182230040217aeaaa578f7433ed013460060856522f1eb7d`.

Both deletion callbacks directly invoke `WDt(workspaceId, commentId)` and
fire-and-forget its promise. The renderer imports `mY as WDt` at byte 61565
from `./index-BGEQ8YjU.js`.

The existing retained-index source owner verified that producer asset against
[the frontend manifest](../frontend/tauri-assets-manifest.json): 3,493,297 bytes,
SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.
Its complete literal receipt is Reason source
`a8dd9ee7-3d81-4a34-ae4a-76a9a1a1c767`, revision `26015212`, marker
`DELETE_CHAIN_RETAINED_SOURCE_RECEIPT_V1`, in
[the existing source-owner Session](https://reasonmachines.com/agents/e1e2b6b9-97cc-4ddc-ba9e-533d89eeeb46).
This lane read that complete receipt and recomputed literal byte lengths and
hashes. It did not reacquire or independently rehash the complete producer asset.

The recovered chain is:

1. Export `X7t as mY`, `[3487944,3487953)`, resolves the renderer import.
2. Complete `X7t`, `[3060988,3061064)`, directly calls `zn.deleteComment`.
3. `zn` binds `Evt(dpe)`. The receipt closes `Evt`, dependency registration,
   the `Svt` constructor, and its in-memory store primitives.
4. Complete `Svt.deleteComment`, `[2295764,2295957)`, awaits a single-row SQL
   delete, then awaits workspace-comment refresh. Its literal SHA-256 is
   `bf1743861dfd3e2f0ece102c581a9703584ce5871c2109ea5067b028b08848b4`.
5. Refresh `[2297814,2297921)` calls complete workspace reload
   `[2288425,2288676)`. That query maps the returned rows and calls complete
   store replacement `[2298344,2298616)`.
6. The complete desktop SQL adapter `[816678,817967)` issues separate
   `plugin:sql|execute` and `plugin:sql|select` invocations through the complete
   `it` bridge `[22349,22425)`.

There is no confirmation UI on that recovered JavaScript delete path. It calls
no attachment helper or explicit transaction. Native SQL implementation and
applicable schema/triggers remain unresolved. These literals do not establish
native atomicity, reply cascades, or attachment cleanup. No new REA tool failure,
analysis, target acquisition, device access, or app execution occurred.

## Distinct OpenConductor mismatch

At the comparison pin, `ReviewComments.tsx` is Git blob
`6a08a3df8e51bc1e7ba1e6782aaa76025148dbb4`. Its local root/reply Delete branch
calls `window.confirm` before forwarding the selected comment to `ops.remove`.
The nonlocal branch already forwards directly. This adds a confirmation gate
absent from the closed reference JavaScript callback chain.

Only that user-local click gate, the focused regression, and this receipt are
leased. Deletion eligibility, the nonlocal button, composer draft dismissal,
store operations, SQL, root/reply cascades, attachments, and GitHub operations
remain unchanged. The incomplete native transaction evidence does not justify
changing any of them.

## Regression checkpoint

The first checkpoint adds `commentDelete.test.ts` without production changes.
It transpiles the actual `ReviewComments.tsx` module and exposes its private
`CommentItem` only inside the test VM. It mounts that actual component with
React test renderer and uses the real comment model, source classification,
and deletion-eligibility functions. The only rendered-content replacement is
markdown. Unused IPC, keybinding, navigation-reveal, and store boundaries throw
if unexpectedly called. No app, IPC, timer, or server starts.

Two cases click the local root/reply Delete buttons with a rejecting
confirmation boundary and require no confirmation plus one unchanged comment
at the existing removal boundary. Four controls preserve pending/sent remote
and agent-local deletion eligibility and direct dispatch. The test neither
simulates the click predicate nor replaces it with a source-string assertion.

Ordinary automatic hosted workflow command:

```bash
node --experimental-strip-types --test src/features/diff/*.test.ts
```

Hosted RED has not yet been observed. The production correction and unchanged
assertion GREEN checkpoint follow only after that result. Local
`git diff --check` is the only validation run in this checkpoint. Local tests,
dependency installation, typecheck, build, app/browser/native execution, and
screenshots are not admitted and were not run. There is no workflow rerun,
manual dispatch, or extra observer. #847 FULL STOP remains intact.
