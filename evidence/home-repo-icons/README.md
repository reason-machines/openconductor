# Home repository icons

Conductor Rebuild, 2026-11-10. Source baseline `78be9716ea031e8aa90e045fe66e88bd7d7a39a4`.

## Retained reference

The retained Conductor 0.87.6 renderer came from Sven's real app. [Extraction provenance](../frontend/README.md) identifies REA evidence `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`. The existing Diff and composer evidence owners independently reread the archived renderer in memory and verified SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. No new extraction or target execution occurred.

[Exact retained excerpts](reference-static.json) record separate UTF-16 and UTF-8 ranges and excerpt hashes:

- `_Jo` delegates the row repository icon to `SJo` when its repository-icon gate is on and the status matrix is off.
- `SJo` delegates to `U9`, Conductor's repository-icon component, and keeps the repository-name tooltip.
- `nFi` delegates each mapped project-menu repository icon directly to `U9`.

These are decoded shipped-JavaScript observations, not original source or native observations. The row excerpt does not establish the live setting that enables that branch. This change preserves OpenConductor's existing row gates. No new REA error occurred; existing semantic-analysis and native-evidence gaps remain.

## Defect and correction

OpenConductor's corresponding Home row and project-filter entries rendered `repo.name.charAt(0).toUpperCase()` directly. A configured repository emoji or uploaded image therefore appeared as an initial in both places, unlike the retained delegation contract.

Both slots now use the existing `RepoIcon`. Its shared implementation, backend lookups, caches, and styles are unchanged. The row keeps its repository-name tooltip. The existing status-matrix override and selected-project rule still hide row repository icons. Repositories without an available icon retain their initial and the existing Home initial style.

## Component regression on Reason cloud

The test executes the actual `AllWorkspaces` and `RepoIcon` TSX through TypeScript's transpiler and React's server renderer. It uses the real icon parser, generated icon registry, and Home logic. Native I/O is rejected. Effects do not execute during server rendering. Only settings, session status, and unrelated UI dependencies are supplied as test fixtures. The Projects-menu case seeds its initial open state through the module's `useState` dependency; it does not test pointer or keyboard interaction.

Before the production change:

```bash
node --experimental-strip-types --test src/components/homeRepoIcon.test.ts
```

Both icon cases failed because the configured emoji was absent. The selected-project, status-matrix, and initial-fallback cases passed. [Raw red result](red.tap).

After replacing the two slots:

```bash
node --experimental-strip-types --test src/components/homeRepoIcon.test.ts src/home/allWorkspaces.test.ts src/state/repoIcon.test.ts
```

All 23 tests passed, including both configured emoji and uploaded-image assertions. [Focused green result](green-focused.tap). `npm run lint:colors` passed all six lint regressions and the scan of 800 files. `git diff --check` passed.

The coordinator authorized a bounded local dependency install for this Node regression. Only TypeScript, React, and React DOM were installed under a temporary prefix and moved into the ignored dependency directory. No package manifest or lockfile changed.

## Unverified behavior

Browser and native acceptance, layout, tooltips, menu interaction, mounted icon changes, favicon lookup, remote-avatar loading, and app packaging were NOT RUN for this change. No screenshot is available because browser and native runtime admission remains with the existing acceptance owners. No application build, install, workflow dispatch, or new runtime started. Local full typecheck was NOT RUN with the partial test-only dependency set; automatic exact-head CI must verify it separately.

On the admitted packaged app, the existing acceptance owner can use repositories with an already-configured emoji and uploaded image. Compare their unfiltered Home rows and Projects-menu entries with Conductor, then select one project and enable the status matrix to check that the row gate remains unchanged. Also inspect a repository with no available icon. This is queued acceptance only, not an instruction to start another runtime or change app data.
