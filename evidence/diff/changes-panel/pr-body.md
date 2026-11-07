## Change
Conductor Rebuild brings the Changes panel closer to the verified Conductor 0.87.6 reference. The extra scope/viewed/Refresh toolbar is removed. The panel gains compressed folder hierarchy, scope/target controls in Options, sorted rows, uncommitted markers, status icons, correct counts and hover actions. Comment/review actions remain available.

The new Options menu exposed an entry-animation measurement bug. Measuring the popup at scale(.95) placed it 11px beyond its trigger. It now measures untransformed dimensions; the same browser boundary check reads 0px error. The optional end alignment is used by Changes Options; other dropdowns keep their default.

## Evidence
The installed binary on Sven m5 max and the decoded cloud cache were hash-verified. REA 6.8.0 captured both actual frontends in isolated IPC fixtures at 1280x820 dark. Evidence, original screenshot hashes and exact source/build identities are committed in `evidence/diff/changes-panel.md`.

The fixed Changes crop improves from **4.48% to 2.76%** differing pixels at channel threshold 24. Tree is 2.60%, collapsed 1.87%. Full-window unified/split/entire-file are 2.51%/2.69%/2.83%. These are single screenshot pairs, not semantic parity scores.

![Conductor and OpenConductor panel tree](https://api.reasonmachines.com/media/pr-screenshots/de6c02f4-4880-4a0d-bf8f-9e3954522753/e4edfc328f440e5f071d177cc4da24cd/changes-panel-tree.png#w=692&h=398)
![Conductor and OpenConductor panel options](https://api.reasonmachines.com/media/pr-screenshots/de6c02f4-4880-4a0d-bf8f-9e3954522753/06d7487015ca0bccab5f083bc9c9d8dc/changes-panel-options.png#w=692&h=398)

<details><summary>Other inspected side-by-side states</summary>

![Conductor and OpenConductor panel flat](https://api.reasonmachines.com/media/pr-screenshots/de6c02f4-4880-4a0d-bf8f-9e3954522753/6b1065f31ef10dbb42d48bcaaf723bd5/changes-panel-flat.png#w=692&h=398)
![Conductor and OpenConductor panel collapsed](https://api.reasonmachines.com/media/pr-screenshots/de6c02f4-4880-4a0d-bf8f-9e3954522753/63d3e1d50e36e3ad4ad247238ec8d37c/changes-panel-collapsed.png#w=692&h=398)
![Conductor and OpenConductor diff unified](https://api.reasonmachines.com/media/pr-screenshots/de6c02f4-4880-4a0d-bf8f-9e3954522753/a1d85d3ce479632b006860edc99ea8ce/changes-diff-unified.png#w=2568&h=848)
![Conductor and OpenConductor diff split](https://api.reasonmachines.com/media/pr-screenshots/de6c02f4-4880-4a0d-bf8f-9e3954522753/82bc6178c9089858f08bb6cfd0c6bf67/changes-diff-split.png#w=2568&h=848)
![Conductor and OpenConductor diff entire file](https://api.reasonmachines.com/media/pr-screenshots/de6c02f4-4880-4a0d-bf8f-9e3954522753/ea0942fdfeba0421c97e6a268a19271c/changes-diff-entire-file.png#w=2568&h=848)

</details>

## Checks
- Passed `npm run typecheck`.
- Passed `npm run build`.
- Passed `npm run lint:colors`.
- Passed `node --test "src/**/*.test.ts"`, 1,256 tests.
- Passed `node --test src/components/menu/dropdownPlacement.test.ts src/features/diff/changesTree.test.ts`, 11 tests.
- Passed `OC_E2E_BASE=http://localhost:4398/__e2e node --test tests/e2e/right-panel.e2e.mjs tests/e2e/shell-context-menus.e2e.mjs`, 11 browser tests. Includes sorted/filtered file identity, collapse, scope switching, exact popup boundary, and existing chat/file/PR menus.
- Passed `git diff --check`.
- The Options boundary assertion failed before the measurement fix and passes after. The initial tree test target failed while its implementation was absent; all five model tests now pass.

## Remaining gaps
- No native Tauri/WebKit window, real repository mutation, real external-app launch or installed desktop build was verified by this slice.
- Options is **5.23%** differing in the fixed crop. Small tone/spacing differences remain; this is not a full pixel-perfect verdict.
- Commit-history entries and route-persisted hierarchy state remain unimplemented. The reference fixture has no history entries.
- An initial Home capture was invalid and excluded. Early browser-test fixture/assertion errors are documented; only the final complete 11/11 run counts.
- Existing REA JS semantic/search limitations are documented in the evidence. No new REA capability failure was encountered.

Aggregate UI-map files remain with their dedicated owner. All triggered CI workflows, including late-started built-app jobs, must complete successfully before merge.
