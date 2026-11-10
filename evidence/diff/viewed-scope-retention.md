# Viewed marks survive a narrower Changes scope

Conductor Rebuild compared retained Conductor 0.87.6 with OpenConductor main
`145a9ffc32fee99b739673f4d9e818531c8c7427` on 2026-11-10. This is a bounded
shipped-source comparison, not browser or native parity proof.

## Retained reference

The retained renderer `renderApp-D_fmY7hW.js` is 11,600,457 bytes, SHA-256
`5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`, matching
[the extraction manifest](historical-chip/extraction.json). This lane rehashed
the retained file and compared each complete literal fragment below with its
exact byte slice. It did not evaluate Conductor code or acquire another asset.

REA application evidence
`ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`
has incomplete large-renderer semantic coverage. The retained literal reads
supplement that limitation. Existing [REA gaps](../../tools/ui-map/REA-GAPS.md)
remain unchanged. No new REA failure occurred.

Ranges are zero-based, half-open UTF-8 byte offsets:

- Complete local store `pH`, `[2731122,2731473)`, SHA-256
  `f2ff58016cb731dea07ab225de3f6003e1ec5bd5d8ace544d0d84525f4bd0b8d`.
  The corresponding UTF-16 range is `[2730686,2731037)`.
- Complete viewer `Jqo`, `[9652565,9658452)`, SHA-256
  `0e24efc52f0ab809283b07a30fbb5e615db81ab56a03f12dad7e298d15a81a87`.
  Its UTF-16 range is `[9607037,9612924)`.
- Complete header `GPo`, `[8973445,8975165)`, SHA-256
  `c08b2b57a86261a300c6d0a35c61f529842ed3e4fedeba4dbfbec7e071d83014`.
  Its UTF-16 range is `[8927941,8929661)`.
- Complete bridge `bji`, `[9643145,9646819)`, SHA-256
  `2d2b8aac64bada5ead6bc143ac6bb272544791374a9b71b38e57eab55c8f5688`.
  Its UTF-16 range is `[9597617,9601291)`.

The complete `pH` assignment is:

```javascript
const pH=bf((t,e)=>({viewedFiles:{},markFileAsViewed:(n,i)=>{t(r=>{const o=r.viewedFiles[n]??{};return{viewedFiles:{...r.viewedFiles,[n]:{...o,[i]:Date.now()}}}})},markFileAsNotViewed:(n,i)=>{t(r=>{const o=r.viewedFiles[n];if(!o)return r;const{[i]:a,...c}=o;return{viewedFiles:{...r.viewedFiles,[n]:c}}})},getViewedAt:(n,i)=>e().viewedFiles[n]?.[i]}))
```

Marking copies every prior path in the workspace map, then updates only the
selected path. Unmarking removes only that path. Neither operation receives
or prunes against a scoped file list.

`Jqo` reads the workspace-wide getter and mark/unmark selectors from `pH`.
Its selected-file callback calls only the relevant mark/unmark operation,
then performs the existing navigation. `bji` forwards that same callback to
`GPo`; the header also has its own direct `pH` fallback. These complete local
callers close the operation's renderer-side wiring. This comparison does not
assert session-restart persistence, undocumented store internals, or unrelated
lifecycle behavior in Conductor.

## OpenConductor mismatch

At the comparison pin, the relevant blobs are:

- `useWorkspaceDiff.ts`: `ece91c83a54945925b98fee9de026612c71020d5`.
- `viewed.ts`: `a2ff903f63f39b0b5f17ea18a6853291267f031b`.
- `viewed.test.ts`: `30bd102e8b7726f54a1741a95a22f044dbcfbd1d`.

The hook's `setViewed` calls `pruneViewed(map, files)` before storing the map.
Its `files` belongs to the current scope. If `a.ts` is already viewed, a
switch to a scope containing only `b.ts` followed by marking or unmarking
`b.ts` removes `a.ts`'s mark. Returning to All changes cannot recover it,
even when `a.ts`'s modification time has not changed. The same loss is
written into OpenConductor's existing workspace-keyed storage.

The bounded correction removes only this scoped-list pruning. The unused
`pruneViewed` helper is removed with its last production caller. Timestamp
comparison, workspace keys, storage format, counts, navigation, file filtering,
metadata loading, CSS, and reference-app persistence choices are unchanged.

## Regression-first checkpoint

The existing test mounts the actual `useWorkspaceDiff` hook with real React,
real viewed helpers, and its existing API and storage boundaries. Eight new
cases combine header and keyboard actions, marking and unmarking, and
Uncommitted and commit-specific scopes. Each case narrows the loaded list to
`b.ts`, toggles it, returns to All changes, and unmounts and remounts the hook
against the same storage. It checks the unchanged `a.ts` mark, the requested
`b.ts` state, current-list counts, and later timestamp invalidation.

The old pure test's pruning-specific assertion described the incorrect
policy. It now asserts that marking and unmarking retain other paths. Its
existing current-file count and changed-file invalidation assertion remain.
All other existing timestamp, metadata, filtering, and navigation controls
are unchanged.

The first published checkpoint changes only the tests and this evidence.
Production still contains the old pruning policy. Ordinary automatic hosted
CI runs:

```bash
node --experimental-strip-types --test src/features/diff/*.test.ts
```

Hosted failing-before and passing-after results are pending. The regression
assertions will remain unchanged between those checkpoints.

## Verification limits

Local retained-file and literal-fragment hashes passed. Local source review
and `git diff --check` are the only code checks permitted in this lane.
Local Node tests, dependencies, typecheck, build, browser, server, native
execution, installation, acquisition, workflow dispatch, rerun, and new
workers or observers were not run under #847 FULL STOP. There is no running
UI screenshot. Hosted hook tests do not prove browser keys, mounted Pierre
behavior, native parity, installation, or deployment.
