# Saved Home project filters during desktop startup
Conductor Rebuild · HOME-SAVED-PROJECT-FILTER-HYDRATION-271

## Defect and bounded fix
The real desktop store initially exposes no repositories and startup=loading. App forwards that loading state through HomeWorkspaceScreen to the same mounted AllWorkspaces instance. Its initial loadFilters validates project ids against the empty set, dropping a saved project from in-memory state. Repository hydration did not reload those filters, so the visible label, rows and Enter target incorrectly used all projects. Saved storage itself was not overwritten by this defect.

The eight-line, one-production-file fix remembers whether the component initially mounted loading, and reuses existing loadFilters once startup settles. Every user filter change cancels that recovery. Subsequent repository churn/loading transitions do not reapply storage. No store, helper, schema, settings key, storage backend, policy, provider, cloud or unstarted/Start change.

This unit was ledger-deduplicated and product ownership activated only after #1429 actually merged as d14e1307fe225f4bf9128545551ae36709b1b4cd. It is a separate main PR, not appended or stacked. The latest integrated main is 08be22cfcb0034e23171fe9b5f3b0a5df93585f3; AllWorkspaces has the same baseline blob c0b226895d569c060ee9d1531dde67fd1c37efee at both commits.

## Original REA source chain
Existing retained Conductor 0.87.6 assets only, read as inert bytes:
- renderApp-D_fmY7hW.js: 11,600,457 bytes, SHA-256 5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde.
- index-BGEQ8YjU.js: 3,493,297 bytes, SHA-256 b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3.

UJo consumes MJo's project/archive preference values. In the stable personal scope without overriding Home URL filter parameters, MJo reads mFi preferences. mFi binds filters to the encoded all-workspaces/personal route and Gde schema/default handling. Gde subscribes to DGe, whose persisted routeStates merge through the same indexed storage chain. Exact renderer import/index export joins bind the store, persist, JSON storage and subsystem-storage functions. The subsystem bridge reaches the app-data storage manager/root; array/string schema constructors are joined too.

Full parent hashes, 25 exact byte spans and their storage/root joins, and the frozen fixture identity: **64 checks passed**. See source.json and verify-source.py. No vendor bundle was executed and no new REA acquisition was made. Parent evidence id: ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367.

**Boundary:** Conductor uses an app-data subsystem preference store, while OpenConductor already uses localStorage. This change repairs eventual recovery through our existing storage path; it does not establish storage-backend equivalence, first-paint timing, installed native behavior or provider success.

## Frozen mounted regression
Fixture SHA-256 aa3264f1cc330057277b52c8932ef0ede10850ef49ffa6b66ee1358c8e4ed5ec. The committed fixture and frozen copy are byte-identical.

- Fresh main d14e1307fe: **5 controls passed / 5 intended assertions failed**, no skipped tests or import/setup failure. All five failures were saved project-label assertions: single, partial-stale, multiple, all-archive and immediately resolved IPC startup.
- Treatment: **10/10 passed**, unchanged fixture. It exercises actual App → HomeWorkspaceScreen → AllWorkspaces, real desktop useAppStore startup, persisted DB decoders and the real parse/load/save path. Outward adapters are bounded fixtures; unrelated App effects are inert, while store/Home effects remain real.
- Existing controls retain absent/malformed/removed-project defaults, archive mode, visible rows, exact Enter identity, no hydration writes, immediately resolved IPC, and live user saves. Source evidence does not replace these local checks.
- Supplemental guards: **4/4 passed** for user archive edit while pending, user project edit before settled, once-only recovery plus later repo churn, and initially ready Home. They use mounted real React components and controlled preference reads/writes.
- Final integrated affected suite: **353/353 passed, zero skips** (includes frozen10, supplemental4 and section-scroll18). Earlier pre-latest-main affected335 also passed; counts overlap, not additive.
- **Passed:** npm run build, including branding, full TypeScript and Vite production build; repeated on integrated main. Existing chunk-size advisory only.
- **Passed:** retained-source checks, sha256sum -c fixtures.sha256, git diff --check and exact one-production-path scope.

Accepted RED/GREEN, guard, affected and build logs are compressed alongside this record. historical-baseline.json records the earlier scratch baseline; fresh-main-red.tap.gz is the accepted fresh replay after #1429 merge.

Replay:
```bash
node --max-old-space-size=768 --experimental-strip-types --test --test-concurrency=1 src/components/homeSavedProjectFilterHydration.test.ts
node --max-old-space-size=768 --experimental-strip-types --test --test-concurrency=1 evidence/home-saved-project-filter-hydration/guards.test.ts
python3 evidence/home-saved-project-filter-hydration/verify-source.py <retained-renderer> <retained-index>
sha256sum -c evidence/home-saved-project-filter-hydration/fixtures.sha256
npm run build
```

The exact final affected-suite command is preserved in qualification.json.

## Bounded visible browser observation
In visible cloud Chrome, the real Home project menu selected Project B, writing through real saveFilters. No browser storage or cookies were fabricated. The fixture's Restart button mounted Home with empty repositories/loading; its Settle button supplied repositories to that same mounted instance. The final visible label remained In Project B and only Working B appeared. Real keyboard Enter emitted the exact hydration-b/workspace-b selection, recorded by the fixture rather than sent to any backend. Existing archive mode Showing all was preserved.

![Saved project B recovered after repository hydration — bounded browser fixture](https://api.reasonmachines.com/media/pr-screenshots/c962f6df-dbb7-4e57-bf70-d1b1a04c9164/7ec507f8e13affa819e02cff2c0f92e1/56015eca-bc52-4d19-baea-d344b7046efc.png#w=1208&h=545)

Reproduce this bounded browser fixture, not the full application:
```bash
node node_modules/vite/bin/vite.js --config evidence/home-saved-project-filter-hydration/vite.config.ts --host 0.0.0.0 --port 4871 --strictPort
# Open /evidence/home-saved-project-filter-hydration/browser.html
```

## Explicit limits and release custody
Browser repositories and archive listing are supplied; this is not native IPC, installed restart/persistence, Conductor side-by-side, provider, first-paint or package acceptance. The full application test suite and native acceptance were not run. #1429's backend restore/persisted mutation and native/package gaps are not closed by this filter fix.

Package #1791 remains immutable and excludes this successor. Existing serialized ledger/release custody owns containing-build, embedding and installed-behavior proof. No native/provider/package dispatch, duplicate job or watcher was created. Merge requires every executed exact-head check to pass.
