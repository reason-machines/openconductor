# Home Projects choices include archived-only repositories

Conductor Rebuild. Source qualification at main `15e87440daa703030f4c402e7a41b9221a149768`.

## Reproduced component mismatch

The retained Conductor 0.87.6 Home caller derives project choices from the repository IDs of all scoped workspaces before applying the archive filter. OpenConductor derived them from sidebar workspace arrays, which deliberately exclude archived records. The hosted regression reproduced the missing Projects control for two archived-only linked repositories, a mixed pair, and archived rows hidden by the active filter.

The regression-only publication preceded every product edit. This is mounted component proof against retained shipped source, not observed Conductor or native parity.

## Retained reference and current consumer

[The source packet](reference.json) retains seven complete declarations with exact UTF-8 ranges and SHA-256 digests. Both original asset digests were rechecked against retained bytes. The renderer is tied to real-app REA evidence `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`.

- `Xh` imports index export `cb`, which exports `Afe`. `Afe` reads `YBt` and scopes through `QBt` and `J$`. Archived state is not excluded by those scope predicates.
- `UJo` uses `new Set(a.map(qJo))` to derive represented repository IDs. `qJo` returns `repositoryId`; repository order is preserved by filtering the repository array. `Tr = je.length > 1` controls visibility. `nFi` receives the same `je` options.
- The archive predicate later filters displayed workspace rows, not project eligibility.
- Current `db_list_workspaces` calls the database list without a state restriction. `reposFromDb` excludes archived records from sidebar arrays. `listArchivedWorkspaces` maps the same database rows through `archivedFromRows` for Home.
- Current `reposWithWorkspaces`, `showProjectFilter`, and the Home options caller do not take that archived input. No selection command or implicit backend restore occurs while calculating these choices.

The packet pins all nine inspected current files to the same main commit. It records 25 exact source checks. Its static checks do not establish execution.

## Frozen regression

The new `src/components/homeProjectEligibility.test.ts` mounts production `AllWorkspaces` with the real `reposFromDb`, `archivedFromRows`, Home filtering, and row grouping functions. Only the archive transport is replaced with the already-converted fixture data. Unrelated preferences, agent state, icons, and tooltips use the same recording-boundary pattern as existing Home component tests.

The seven cases cover two archived-only linked repositories, mixed live and archived-only repositories, eligibility while archived rows are hidden, live repository order, a single archived-only repository, a single live repository, and an archived record belonging to a closed repository. The first case also selects Project B and requires only its archived row to remain. Empty repositories are present in every fixture and must never become choices.

The fixture is frozen in `fixture-v1.ts.txt` and `fixture.sha256`. A valid failing-before result must reach the missing-control assertions while the single, live, and closed-repository controls pass. Setup failures are not behavior proof. The same fixture must pass after any correction.

## Correction

`reposWithWorkspaces` and `showProjectFilter` accept the existing typed archived-workspace rows. Both choices and visibility include represented linked repositories while preserving repository order and excluding empty or closed repositories. Home reads that archive data independently of row visibility. The existing row filter still decides whether archived rows appear.

The correction touches only the two eligibility helpers, the Home archive-read condition, and their two caller arguments. The seven-case regression, source packet, backend, menu behavior, keyboard handling, and other frozen fixtures remain unchanged. Laziness Protocol kept the existing archive reader and shared helper instead of adding another database query or state model.

## Hosted failing-before proof

Automatic CI [43097731266, unit job 130783587876](https://github.com/reason-machines/openconductor/actions/runs/43097731266/job/130783587876) ran `node --test "src/**/*.test.ts"` at regression-only head `7e58a8a1fba2f44f1004d54a16f3b5fad469c70d`. Three cases reached the intended missing-control assertion, `0 !== 1`. Four controls passed. The complete suite reported 3,107 passed and exactly three failed, with no skipped or cancelled tests. Checkout, Node setup, and `npm ci` passed. [The receipt](hosted-red.json) and [seven-case log excerpt](hosted-red.log.txt) retain that result.

## Checks and limits

- Passed static qualification on Reason Cloud. Both full original asset digests, seven complete declarations, nine baseline file pins, and 25 source anchors matched before the correction. Fresh main `838ab2a1c76d11f8048a89c9d4c01ba822db2204` retained all nine pinned source files unchanged.
- Passed `git diff --check` and `sha256sum -c evidence/home-project-eligibility/fixture.sha256` after the correction.
- Hosted failing-before proof passed as described above. Passing-after execution and every exact-head workflow are pending. The ordinary frontend workflow already includes `src/**/*.test.ts`; no workflow or dependency changes were made.
- Local Node, Rust, application, browser, provider, native, and installed-package execution were not run. No dispatch or rerun was started.
- There is no screenshot because this lane has no UI execution admission. A mounted component result will not prove physical clicks, popup layout, native event delivery, filesystem or database mutation, or side-by-side parity.
- The existing REA semantic-renderer heap-exhaustion limitation remains. This pass reuses retained real-app assets and their REA provenance; it does not claim a new REA engine run.

TDD determined the delivery order. The regression-only publication precedes the product correction.
