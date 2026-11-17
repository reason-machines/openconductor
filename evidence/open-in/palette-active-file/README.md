# Palette Open in uses the visible file

Conductor Rebuild fixes the palette launch target for the selected local workspace. A visible diff file or Markdown preview supplies the file path. Chat and other non-file tabs retain the workspace directory. Folder-only apps keep their existing folder payload. Finder and VS Code retain the existing workspace context.

`WorkspaceView` publishes a typed target through `App` to `PaletteHost`. Each publication identifies its repository, workspace and root. Cleanup removes only its own registration, so an obsolete owner cannot clear a newer target. The palette resolves actions inside the selected repository and rejects stale or invalid relative file targets. There is no new native command, provider path or alternate file reader.

## Retained Conductor source

The inert [reference excerpts](reference/) come from the existing Conductor 0.87.6 REA packet for Sven's installed app, not a new native observation. Its source pins and limitations are retained in [existing-source-pins.json](reference/existing-source-pins.json). Original REA evidence identity: `ev_338577609e67c31212d529d59606e90597850528ea9a2f9559d23a4876c960d1`.

The lexical chain is palette `m_a` → `H9=Ac` → `SBt` → `cvs`. The file route must belong to the requested local workspace; `SBt` joins the workspace root with the selected relative file path. The index export joins `d2=AOt` and `db=D$` identify the parsed file route. [Route joins](reference/route-joins.json) and [palette joins](reference/palette-reference-joins.json) record excerpt positions. These shipped-byte excerpts support the behavior; they are not an observed external-editor launch or an automatically verified call graph. Active-editor line tracking is outside this change.

## Actual v4 validation

Ran serially on Reason Cloud computer 355 against fetched main `4fe392155011727e0728ebc2c668db37ee98c48c`, assigned branch checkpoint `18e07691f3fedd528df8d182ecd7fd71fa231ad6`. Source, complete tracked-tree, original fixture, candidate, lock and own-dependency identity checks passed. No dependency install ran.

The v4 test-support input differs from the original lifecycle fixture. It loads the real agent-choice module while replacing only agent sessions, uses the real ESM Pierre import, captures boundary arrays in the host realm and finds tabs by established rendered-text extraction. Expected values, all test bodies, consumer fixture and product candidate are unchanged. Earlier setup failures and the historical 14/15 result remain historical, not passing evidence. This run independently repeated the complete v4 baseline before applying the candidate.

Identical baseline and candidate command:

```bash
timeout -k 5s 120s nice -n 19 env NODE_OPTIONS=--max-old-space-size=1024 node --experimental-strip-types --test --test-concurrency=1 src/palette/paletteOpenInTarget.test.ts src/palette/paletteOpenInLifecycle.test.ts
```

- Baseline reproduced the defect: exit 1, all 15 collected, exactly seven intended assertion failures and eight passing controls. Failed indices were 1, 2, 3, 4, 5, 10 and 14. No setup errors, skipped tests, cancellations or todos.
- The unchanged sealed product patch then passed: exit 0, all 15 passed. This includes mounted App/WorkspaceView diff-to-chat and Markdown-to-chat transitions, owner changes and obsolete-registration cleanup.

The six unchanged adjacent files passed, exit 0, all 113 tests, with zero failures, skips, cancellations or todos:

```bash
timeout -k 5s 120s nice -n 19 env NODE_OPTIONS=--max-old-space-size=1024 node --experimental-strip-types --test --test-concurrency=1 src/palette/openIn.test.ts src/palette/paletteComposition.test.ts src/palette/fromAppState.test.ts src/palette/createSection.test.ts src/palette/gitPanelActions.test.ts src/features/openIn/apps.test.ts
```

Candidate typecheck passed, exit 0:

```bash
timeout -k 5s 180s nice -n 19 env NODE_OPTIONS=--max-old-space-size=1536 npm run typecheck
```

The original [terminal receipt](validation-v4/receipt.json) and lossless [raw TAP, argv, events and cleanup archive](validation-v4/raw-proof.tar.gz) retain actual timings and hashes. Receipt SHA256 is `68ddcbd3c0893d41f4669bdaa9db8f31d4d5adeef1577d0822435d68cd9297a9`; archive SHA256 is `afc161499a1fff9fc11b6de2d1aac95f391fceeb35149767a14a6fe0a57a6552`. Runtime ran from `2026-11-13T00:37:27.188097Z` to clean release at `00:39:19.141064Z`, 111.953 seconds within the retained 934-second continuation budget. All frozen before/after hashes matched. Cleanup reversed the exact product patch and removed only the exact staged fixtures, returning the tracked tree to main with no own jobs, servers or runtime. The exact executed source bytes were then restored for this delivery without another runtime run.

## CI test-support correction

Hosted CI on PR #1205 head `8cf7baa3` passed typecheck but failed seven tests in `src/features/diff/viewed.test.ts`. Its `emptyDiffCloseFixture` extracted every workspace statement from `activeReview` through `prNumber`. The new Open in effects fell inside that range, so the Diff-only probe threw `ReferenceError: useEffect is not defined` before its assertions ran.

The correction selects the existing `activeReview`, `showFile` and `showBrowser` declarations, followed by the actual `activeTab` through `prNumber` owner statements. The real automatic-close callbacks, fixture body and every assertion remain unchanged. No product source, palette fixture, dependency or workflow changed.

Conductor Rebuild reproduced and corrected the failure serially on Reason Cloud computer 355, against freshly fetched main `492bc5c78f2e168924f9003bfb68c7023b4aa931`. The assigned branch contained published head `8cf7baa3` with identical source bytes. Both before and after used:

```bash
timeout -k 5s 120s nice -n 19 env NODE_OPTIONS=--max-old-space-size=1024 node --experimental-strip-types --test --test-concurrency=1 src/features/diff/viewed.test.ts
```

- Before correction: exit 1, 65 collected, 58 passed and the same seven hosted `useEffect` errors. These were harness failures, not new product regression evidence.
- After correction: exit 0, the identical 65 cases passed.
- The unchanged 15 palette regressions passed with the baseline/candidate command above, exit 0.
- Typecheck passed with the command above, exit 0.

Every test run had zero skipped tests, cancellations and todos. Product-source, palette-fixture, lock and own-dependency hashes stayed unchanged. The Diff support file changed from `577f59aa` to `aee7da55`, using patch `dc668614`.

The [CI-correction receipt](validation-ci1205/receipt.json) and [complete raw logs, commands, source bindings and runner](validation-ci1205/raw-proof.tar.gz) preserve the run. Receipt SHA256 is `ce2988ec2781666a26bd8140f2e1b717c52a494e8455c4554f7f32db7ce0eb8d`; archive SHA256 is `1c139a394c84bc31ca7437215646248c54e20866bc1743474d3a3dfb9a68c9b5`. The run started at `2026-11-13T00:57:59.022676Z` and released at `00:58:39.460280Z`, after 40.443 seconds. All own process groups had exited; no jobs, servers or runtime remained. The validated support correction was retained for publication to the same PR. The complete hosted suite and build must pass on the new published head before merge.

## Limits and delivery

The tests mount real production App, WorkspaceView and PaletteHost with controlled native/provider boundaries. They mock the external launch adapter. They do not prove actual macOS IPC, external editor behavior, browser interaction, installed-package inclusion or visual parity. Existing React undefined-component warnings remain unsuppressed in the raw TAP; no claim about their cause is made. No browser, native, provider, server, build or package check ran locally. No screenshot exists because browser and native execution were outside this serialized unit.

This change is standalone against main. Merge only after every triggered workflow on the exact published head passes. Native and packaged-app acceptance remain with the existing serialized release owner; this proof does not create another runtime slot or native runner.
