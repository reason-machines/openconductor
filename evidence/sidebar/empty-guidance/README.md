# Empty-sidebar guidance

Conductor Rebuild, sole existing SAME271 publisher. Scope: the existing zero-repository “Add a project to get started.” message only. Do not change repository counts, row projection, grouping, navigation, actions, or collapse persistence.

## Source qualification

Requalified default head `84a3153cbca1c25e210c3835ea9314f54e9f6c36`, which contains merged #1168. The assigned branch was merged with main and its tracked tree matched that head before regression preparation. No new publisher or retry of the provider-limited badge publisher was used.

`source.json` records both full original asset hashes, unique UTF-8 offsets and hashes for complete retained functions and import/export joins, current producer snapshots, and all 21 passing inert source checks. Original Conductor 0.87.6 bytes came from retained real-app REA evidence `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`; they were read as data, not executed. The original `hBi` local empty branch is outside `Gra`'s persisted main-collapse gate. The current empty message incorrectly shares the grouped-content gate.

Reachable counterexample: no repositories, local organization, no shared/visible workspaces, main section collapsed. The current header can toggle that independent persisted key with zero repositories. Removing the final repository also leaves the key intact. The original source permits the guidance regardless of that key. This is source qualification, not an observation of the original native application running.

## Frozen behavioral regression

The original eight cases are byte-identical, SHA-256 `a1942f64fa21dff44be7e9f0ac4814a442a80423c9f977cb9970544918356115`. Their `currentSourceMessage` values describe the pre-fix source; tests assert `referenceMessage`, never normalize away collapse, grouping, hidden state, repository identity, or filter inputs.

`src/components/sidebarEmptyGuidance.test.ts` mounts the actual Sidebar and actual builtin-collapse hook/store and project-filter hook/projection. Only storage/preferences are in-memory adapters; unrelated providers, menus, drag/drop, status/pending content and workspace-row presentation are inert. Each frozen case asserts hydrated header state before the guidance. The missing-project-filter control uses the existing path-less repository placeholder to retain the actual stale filter before repository hydration, and asserts that no repository group matches; the real filter reconciliation is not replaced.

Three separate adjacent controls exercise both grouping modes through live collapse/expansion and persistence, and removal/re-addition of the final repository while collapsed. They are additional to, not replacements for, the eight frozen cases.

Exact focused command, unchanged between RED and GREEN:

```bash
timeout 90s node --max-old-space-size=768 --experimental-strip-types --test --test-concurrency=1 src/components/sidebarEmptyGuidance.test.ts
```

Exact adjacent command:

```bash
timeout 90s node --max-old-space-size=768 --experimental-strip-types --test --test-concurrency=1 src/components/sidebarRepoBadgeCount.test.ts src/state/customSectionCollapse.test.ts src/home/repoFilter.test.ts src/state/sidebarOrder.test.ts
```

Own existing dependencies match the root lock: React and react-test-renderer 18.3.1, TypeScript 5.9.3. No dependency install requested. The immutable pre-admission identities and exact commands are in `freeze.json`.

## Executed verification

The source-only `source.json`, `freeze.json`, and expected-case wording above record the original pre-admission state and remain unchanged. ACC admitted one serial mounted-test pass on Cloud352 (`00637189-5c55-416e-b457-ed7419fb739a`) under `SAME271-EMPTY-SIDEBAR-GUIDANCE-01`. Before RED, every frozen source, test, fixture, adjacent-target, and package identity matched. The preflight containing main was `7d5c13c394e5599c32dd9678625202911f74ebf7`; all leased targets were byte-identical to the frozen baseline.

- RED reproduced the defect at 2026-11-12 12:19:46–47 UTC: exit 1, 6 passed and 5 failed. Only missing-guidance assertions failed: collapsed repository/status grouping, both live-collapse cases, and removing the last repository while collapsed. Hydration, persisted collapse, filter, hidden-repository and nonempty controls had no setup/control failure.
- The failing regression was committed before the product edit as `e00b70b7`. The product fix removes only `!groupCollapsed &&` from the zero-repository guidance predicate. Repository rendering, #1168 projection/count/map, grouping, actions, navigation, and persistence are unchanged.
- Identical full-eleven command GREEN passed at 12:20:19–20 UTC: exit 0, 11 passed, zero failures/skips/cancellations. Frozen eight and the three added live-state tests were not changed.
- The exact four-file adjacent command passed at 12:20:20–21 UTC: exit 0, 38 passed, zero failures/skips/cancellations.
- The ordinary runtime slot was explicitly released at 12:20:21.872555321 UTC. The own-namespace process list contained only sandbox/transport/shell/ps processes, with no Node/npm/server job. This is not a host-wide process claim.
- No install, local typecheck, lint, build, application browser, E2E, real provider, original-app runtime, native, package, or release check ran.

Raw TAP is preserved losslessly in `red.tap.gz`, `green.tap.gz`, and `adjacent.tap.gz`. `execution.json` seals both uncompressed and compressed hashes, terminal timestamps, exact commands, outcomes, and unchanged inputs. Gzip avoids committing whitespace-only TAP diagnostic lines; no fixture or test bytes were transformed. Every enabled automatic check on the exact published PR head must pass before requesting a protected merge; skipped jobs are not passes.

There is no screenshot because browser/native execution is outside this admission. No static or mounted check is a claim of side-by-side native parity. This unit stays outside the fixed 992 package cut; the existing release/native owner is unchanged.
