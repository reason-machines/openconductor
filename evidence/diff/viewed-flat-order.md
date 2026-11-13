# Flat Changes ordering by viewed state

Conductor Rebuild compared the retained Conductor 0.87.6 renderer with
OpenConductor main `941a67f65f467b79ab0b3c9907ce8bc219e3a705` on 2026-11-10.
The source-only lease covers `changesTree.ts`, its tests, the `ChangesList.tsx`
call, and this receipt. This is static parity evidence, not native observation.

## Retained reference

The 11,600,457-byte `renderApp-D_fmY7hW.js` has SHA-256
`5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`, matching
[the extraction manifest](historical-chip/extraction.json). The Conductor binary
provenance is SHA-256
`0ba55751aea5ecf592d2c78379760af641fb912a34b2c3573d41df031ffb831d`.
Existing REA evidence
`ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`
has incomplete large-chunk semantic coverage. Bounded reads of the already
retained decoded/minified asset supplement that gap. No new acquisition,
analyzer invocation, app execution or native admission occurred.

Complete-definition UTF-8 half-open byte ranges and SHA-256 hashes were checked:

- `fJe`, `[2731481,2732090)`,
  `94dad71f536536d4dabd1f7081e22aa17154f8b2843c29a7fcff9086c455e095`.
  It partitions conflicted, unviewed and viewed files, sorts each group with
  `Zvs`, and returns `sortedFiles` in that group order. Viewed means both numeric
  timestamps exist and the viewed timestamp is at least the modification time.
- `Zvs`, `[2732090,2732144)`,
  `169f8deccb76e4d42c05aefc98d07ea5864ce3b232f8e3fd1f64d536f67ab6f6`.
  Its comparator is `t.path.localeCompare(e.path)`.
- `bys`, `[2840211,2849411)`,
  `d77fdd8a944737a5ecca9d41deefd024307cf526de8c871a25a7f91aa4a8c450`.
  Production GitPanel reads `sortedFiles:Q` from `fJe(i,L)`, filters it with
  `gyi(Q,te)`, and passes that sequence as `sortedFiles:be` to `rys`.
- `gyi`, `[2840025,2840211)`,
  `870f3a77fdc09ab5da4b31e1bef67a2d639c62e5f6254148040ad5f5c9c235a8`.
  It filters the original array using a set of matching files, preserving order.
- `rys`, `[2827028,2828488)`,
  `f5cf99cefec94eed5848c2c3513e99b4da9c264f318d0175c54517bb1ef66c7e`.
  Its flat branch walks the supplied sequence directly. The tree branch uses
  its separate directory builder.

The earlier [discovery receipt](https://reasonmachines.com/agents/de6c02f4-4880-4a0d-bf8f-9e3954522753?page=a9665bd1-76b0-4e06-9324-95c9ab8095b9)
records the complete causal chain and exact-main blob comparison.

## Cause and bounded correction

At the comparison pin, `changesTree.ts` blob
`af3c2a728967266aefa1d0fba01ef7406b90433b` sorts all flat rows by path.
`ChangesList.tsx` blob `195a5ef7059ba3d8b7ac92b585f2d7dc3d3a382e` uses
`diff.isViewed` only for row styling, not ordering. A viewed `a.ts` therefore
stays before unviewed `b.ts`, contrary to the retained renderer.

`ChangesList` now supplies its existing viewed classifier to `changeRows`.
Only the flat branch partitions the already path-sorted files, putting unviewed
files before viewed files. Each input file is classified once. File references,
path labels, counts and relative order inside each group are retained. Tree
construction, collapse state, filtering, navigation and selection are unchanged.

The current `FileStatus` model has no `conflicted` variant. This correction does
not add one, change conflict handling or claim full conflict-header parity.
It implements viewed grouping only for the currently represented file statuses.
The production timestamp predicate and historical metadata rules from #897 are
reused without modification.

## Regression evidence

The available Node v22.23.4 ran this lightweight command on Reason cloud, without
installing dependencies:

```bash
node --experimental-strip-types --test src/features/diff/changesTree.test.ts
```

Before the production fix, the run passed 8 of 12 tests and failed exactly four
new ordering cases: mixed groups, timestamp boundaries, mark/reclassification,
and a filtered subset. All five original tests passed. The distinguishing
failure returned `a.ts, b.ts, c.ts, d.ts` instead of `b.ts, d.ts, a.ts, c.ts`.
The regression-first local commit is
`a40d098abc52e0160cc81bc3d19c8393c2b6470d`.

After the production fix, the same assertions passed 12 of 12 tests. Coverage
includes all-viewed, all-unviewed, empty and singleton inputs; equality, older,
newer, absent and zero modification times; deleted-file zero metadata; marking,
unmarking and invalidation; retained object identity and rename metadata;
and unchanged expanded/collapsed tree rows and aggregate counts. `git diff
--check` also passed. Later test edits only add explicit TypeScript annotations;
no RED assertions were changed.

The subset case exercises already-filtered input, not fuzzy matching itself.
No React render, actual-hook integration, typecheck, full suite, build, browser,
screenshot or native test ran locally. Ordinary automatic hosted CI supplies the
broader checks after publication. No workflow dispatch or rerun was requested.
Native flat-row parity remains **NOT RUN**. Packaging alone cannot prove it.
