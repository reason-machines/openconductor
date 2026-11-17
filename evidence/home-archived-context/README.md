# Archived Home context menu
Conductor Rebuild · HOME-ARCHIVED-CONTEXT-271-05 · archived-only

## Defect and smallest fix
Home row composition deliberately excluded archived rows from the active-only context capability. Its container also looked up every target only in sidebar repositories, whose persisted decoder intentionally omits archived records. A separately decoded persisted archived row was therefore visible but had no menu.

An explicit archived caller capability now carries the settled archived row identity and its existing row-owned restore action. Shared menu composition replaces Archive with Unarchive only when that capability is supplied. The button and menu share one pending ref and the existing archive lifecycle reset subscription, preventing duplicate restore dispatch. Active-only callers and old fixtures are unchanged. Unstarted rows still have no local context menu or Start.

Only four production files change: AllWorkspaces, HomeWorkspaceScreen, WorkspaceContextMenu and WorkspaceActionsMenu. No backend/store, provider, default permission, cloud, native or startup filter-hydration changes.

## Original REA source qualification
Existing retained Conductor 0.87.6 assets, read inertly:
- index-BGEQ8YjU.js: 3,493,297 bytes; SHA-256 b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3.
- renderApp-D_fmY7hW.js: 11,600,457 bytes; SHA-256 5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde.

The already retained _Jo → EJo → D9e → Aao chain binds Home rows to lifecycle-aware shared menu composition. New minimal index literals bind Ms/aJ → il/MXe/xXe and N6/fh → W2/ylt, plus BYe/hG → HYt/Z2 → we.unarchiveWorkspace/RWt; SDt/hH → zYt → we.setWorkspacePinned; wDt/hF → VYt/VWt → we.setWorkspaceManualStatus. The list cb/Afe/YBt and menu Ms/il/MXe/xXe both read we.store.workspacesByLocalId: a settled rendered archived row is available for the original menu lookup. Existing Ld/dh → kYt/ZBt permission accessor spans were also freshly rebound.

Full parent byte identities, 34 new index spans, 16 prior permission/status spans, four core renderer spans, five import/export joins and three frozen fixture identities: **64 checks passed**. The verifier parses original JavaScript as a TypeScript syntax tree; it never imports or evaluates it. Original whole bundles are not committed.

The default service factory is NOT evidence of installed provider population, allowed permission domains, persistence or native success. Those boundaries remain unqualified, and this patch does not alter them.

## Frozen mounted reproduction
New fixture SHA-256: 828088deea49b09aee131f138cb4436fc7fbc788c7d1351c8342151a8225557a.
- Initial main 29c82d0bf7: actual **4 controls passed / 6 intended missing-handler assertions failed**.
- Fresh main 93b9d53ce02970967a831b0ac93ecdbf17bdea31: same **4 passed / 6 intended assertions failed**.
- Treatment: **10/10 passed**, fixture unchanged.
- No import/setup failure or skipped assertion in these accepted baselines. An earlier cross-VM object-prototype fixture draft was corrected before freezing and is not a product RED.
- The fixture mounts actual Home/list/shared menu components with actual persisted DB decoders. Portal primitives, runtime adapters and archive listing are bounded fixtures, not pixels/native success.
- Controls cover active Archive, archived primary navigation, unstarted/Start exclusion and existing button single-flight. Targets cover archived menu presence, filtered exact target, shared pin/status/read/section/copy/rename callbacks, pending/failure reset, cross-button single-flight and repository unlink dismissal.

Old active and integration fixtures remain byte-for-byte:
- homeContextMenu.test.ts: 000a0ac3eefce9da250cb31dcc535bd6965c192fd0a764b5debb18a42edb3818.
- homeContextMenuIntegration.test.ts: 406685142fdf946f9c06182da6e756f16256c187d90dcc0f396242e26e53a7bf.

## Validation on Reason cloud
- **321/321 passed, zero skips:** integrated affected Home/list/menu/persistence/sidebar/palette suite. Command in qualification.json. Includes the unchanged ten-case fixture and old active controls.
- Earlier bounded runs: 21/21 core, 248/248 Home/decoders, 83/83 shared callers (overlapping sets; not additive).
- **Passed:** npm run build, including branding, full TypeScript and Vite production build; existing bundle-size advisory only.
- **Passed:** source verifier, frozen SHA checks, exact four-production-file boundary and git diff --check.
- Accepted original and fresh-main RED, core/integrated GREEN, adjacent and build output are compressed alongside this record.

Replay source checks with existing retained assets:
```bash
node evidence/home-archived-context/verify.mjs <retained-index> <retained-renderer>
node --max-old-space-size=768 --experimental-strip-types --test --test-concurrency=1 src/components/homeArchivedContextMenu.test.ts
npm run build
```

## Bounded browser observation
Real Home/list/menu/portal components were rendered in visible cloud Chrome. Only archive listing was supplied by the fixture; the archive decoder and sidebar persisted split are real. No browser storage or cookies were fabricated. User-observed controls selected Showing all; a real right-click opened the archived menu, with Unarchive and no Archive/Start. Selecting Unarchive emitted exactly {type: "unarchiveWorkspace", repoId: "a", workspaceId: "Archived target"}, dismissed the menu and disabled the same row restore button. Dispatch is recorded, not sent to a backend.

![Archived Home menu — bounded browser fixture](https://api.reasonmachines.com/media/pr-screenshots/7783de16-b378-4499-8d5d-6ea5fd1a224c/e81d8b386ad6e4b2145d8a5ce06c420b/cd112bbe-dd00-42cd-9e62-6d7d927f2b0f.png#w=1208&h=545)

![Exact archived restore dispatch — no backend mutation](https://api.reasonmachines.com/media/pr-screenshots/7783de16-b378-4499-8d5d-6ea5fd1a224c/34b336ce557987f4ba1f0a2e92a7f502/b16525f8-d49a-4016-b36a-d3435bb4f6d4.png#w=1208&h=545)

Reproduce the bounded fixture, not the full app:
```bash
node node_modules/vite/bin/vite.js --config evidence/home-archived-context/vite.config.ts --host 0.0.0.0 --port 4871 --strictPort
# Open /evidence/home-archived-context/browser.html
```

## Explicit limits and release custody
This is source-qualified rendering/callback proof, not a full application, installed Conductor side-by-side, native/provider/service permission policy, backend mutation, persistence, restore completion or package acceptance. No native/package workflow dispatch or watcher was created. Package #1791 remains immutable and excludes this successor. Existing serialized release custody owns future containing-build and runtime proof. Startup project-filter hydration is a separate queued candidate sharing AllWorkspaces, not included here. Merge requires every executed exact-head check to pass.
