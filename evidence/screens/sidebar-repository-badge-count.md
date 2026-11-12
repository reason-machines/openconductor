# Collapsed repository badge count

## Original source qualification

Conductor Rebuild revalidated the supplied inert REA packet on 2026-11-12 against fetched default head `6281fd5b157d5926ce4dab42dff3e21e4c9c2979`, before any product edit. The leased source and root dependency lock were unchanged from the initial `f3a52c4aaa59d12e2d0050e2997174be30a59cac` qualification; only this publisher's assigned branch was fast-forwarded. No original JavaScript was executed.

Original REA evidence: `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`.

Verified whole-asset SHA-256 values:

- `renderApp-D_fmY7hW.js`: `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- `index-BGEQ8YjU.js`: `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.

Each complete retained span matched exactly once in the original render asset. UTF-8 byte offset, byte length, and SHA-256:

- `hBi`: 10101417, 5346, `7067608ebeaae54a7005b9ad75e5b212029ed36d23ecd6fe4b3886324efcc11a`.
- `Gra`: 10089186, 1420, `22312381fdc801b5a07f5a2966825b3561d66ffff32582df4c5ef966400d1b38`.
- `dBi`: 10085016, 3789, `4981a5c0897f3b4214f47e48ad309fc19bd30f8c17a07a0e034be6a452f5a708`.
- `Dra`: 10078590, 6162, `ce74998d935a19a67e5c620887af56bd2573a2e9488d737447cddeec9156044a`.
- `aW`: 10035062, 186, `54918e82e28401153aa6a7784f3f64eb97198e97dc27240cd73325e518f7700d`.

Full caller joins were read, not inferred from isolated strings. `hBi` passes section exclusion IDs through `Gra` to `dBi`. `dBi` excludes pinned, sectioned, archived, and shared entries before grouping local IDs by repository. `Dra` receives those IDs and uses the same array for its folded badge and ordinary rows. Pending IDs remain a separate array and render while folded. `aW` stores collapse state independently.

At the checked OpenConductor head, `Sidebar.tsx` uses `repo.workspaces.length` for the badge but `repoGroupWorkspaces(repo.workspaces, sectioned, state.sidebarSort)` for ordinary rows. The existing projection excludes pinned and sectioned entries. This change reuses that projection without adding exclusions or changing collapse, selection, sorting, pending-launch, or persistence logic.

## Mounted regression

[The eight-case fixture](../../tests/fixtures/sidebar-repo-badge/expected-cases.json) is a byte-for-byte copy of the supplied frozen contract, SHA-256 `fc9072761891c65736db29285644eaf15cd822fcbc3d50c53e5eeb4b26ede3b3`. Its historical `currentBadge` values describe the pre-fix source, not expected candidate results. The mounted test asserts `referenceBadge`, pending rows, and revealed ordinary rows without normalizing counts.

The test mounts the real `Sidebar`, real workspace projection, real `RepoWorkspaceList`, and real pending-launch store with React's test renderer. Unrelated menus, providers, row presentation, animations, and drag-and-drop adapters are inert. Four adjacent mounted controls cover both row sort modes, a folded pending-only group, and live pending add/remove with expansion.

## Measured behavior (2026-11-12, UTC)

ACC admitted one serialized focused-node slot on Cloud computer 352 (`00637189-5c55-416e-b457-ed7419fb739a`). All commands ran sequentially in this publisher's own checkout. The slot was explicitly released at 10:41:17 after all commands terminated and no own runtime jobs remained.

- Dependency setup, 10:40:24–10:40:32: `timeout 180s npm ci --ignore-scripts --no-audit --no-fund` passed, exit 0, 394 packages installed. Root lock SHA-256 remained `0714cb6ccdd0e8332f4ff08dc6b9ec0eb786e8f7b6b386663d31b9323579796a`.
- Actual mounted RED, 10:40:36–10:40:37, before product edits on the qualified main: exit 1, 12 tests, 6 passed / 6 failed. Five frozen-eight badge assertions and the live-pending control's badge assertion failed; ordinary/pending row assertions, both sort controls, and pending-only behavior passed. Representative failures: `'2' !== '1'`, `'1' !== null`, and the live mixed badge `'3' !== '1'`. [Raw RED TAP (gzip)](sidebar-repository-badge-count/red.tap.gz).
- Identical mounted GREEN, 10:41:10–10:41:11, after the three-line projection reuse change: passed, exit 0, 12 passed / 0 failed / 0 skipped. [Raw GREEN TAP (gzip)](sidebar-repository-badge-count/green.tap.gz).
- Adjacent focused pass, 10:41:11–10:41:17: passed, exit 0, 26 passed / 0 failed / 0 skipped. Covers row activation, sidebar projection/collapse/order, persistence, sort, and pending launches. [Raw adjacent TAP (gzip)](sidebar-repository-badge-count/adjacent.tap.gz).

Exact RED and GREEN command (unchanged):

```bash
timeout 90s node --max-old-space-size=768 --experimental-strip-types --test --test-concurrency=1 src/components/sidebarRepoBadgeCount.test.ts
```

Exact adjacent command:

```bash
timeout 90s node --max-old-space-size=768 --experimental-strip-types --test --test-concurrency=1 src/state/sidebarOrder.test.ts src/state/sidebarPersist.test.ts src/home/sidebarSort.test.ts src/workspace/pendingLaunches.test.ts src/components/sidebarRowActivation.test.ts
```

Regression committed before the fix: `6fa7ade1afeaa4fb14681befb66e6e955bc6d9d1`. Verified fix commit: `f07bf65ec124b93cb98d718a8c23eb09fc96cae7`.

Frozen mounted-test SHA-256 before RED and after GREEN: `992cc94a1de7832df281655944bc1250d9707c640b20d5377d99e5ae86014548`. The eight-case fixture's full hash above is unchanged. Fixed `Sidebar.tsx` SHA-256: `50c3c3eebb2e3ca253b35964fc95a00d65757b6372591961b98de078dc424a43`.

Only production changes: evaluate the existing `repoGroupWorkspaces` projection once in the repository render callback, use its length for badge visibility/count, and reuse it for normal row mapping. No filtering rules, collapse handling, pending mechanics, stores, navigation, row actions, header rename, or timestamps changed.

## Limits

This is retained shipped-source evidence, not a fresh native observation. No browser, server, native app, provider, end-to-end test, package, release, or workflow dispatch is admitted in this unit, so there is no screenshot or package/native parity proof. Release inclusion belongs to Session `992a715e-aafd-49b0-88ba-9cabca1a3126` and this change is outside its fixed cut.
