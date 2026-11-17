# Pending config-sync selection

Conductor Rebuild owns this source candidate after ledger message `19427ce2-2b1d-45fc-8388-7d5ac5aefc8b` resolved the exact overlap with Settings49. Main was fetched and reread at `492bc5c78f2e168924f9003bfb68c7023b4aa931`. Settings49's success notification change is separate. No runtime registration, admission or new queue row is created here.

## Two-line correction

Conductor keeps loaded category and item selection editable while copying. Current `ConfigSyncDialog` disables both during its `syncing` state. The proposed [candidate.patch](candidate.patch) changes only those two disabled conditions to test whether the diff is loaded. Empty categories remain disabled. Cancel, dismissal, single-flight Sync, submitted selections, copy backends, notifications and refresh behavior are unchanged.

The patch is **not applied**. The [dedicated two-case regression](configSyncPendingSelection.test.ts) is prepared before baseline reproduction. It is preserved byte-for-byte here, outside automatic test discovery, so this unvalidated ConfigSync candidate does not enter the independent Reset-indicator delivery. The original source manifest and archive retain their historical paths and hashes. Before ConfigSync's own admitted validation, restore the unchanged fixture to `src/settings/configSyncPendingSelection.test.ts`; its relative imports and the recorded commands below require that location. It mounts the real GeneralPage and dialog through the unchanged existing harness. It defers synthetic copying, changes category or item selection, and verifies that the actual request objects remain unchanged. It then returns a synthetic failure and verifies that the changed selection controls the next attempt. It also checks duplicate Sync, disabled Cancel, empty categories and absence of unrelated boundary calls. Checking the actual request references avoids relying only on the harness's cloned call log.

## Retained real-app source

[source.json](source.json) binds ten complete spans and their UTF-8 byte offsets to the retained Conductor 0.87.6 renderer. Its complete SHA-256 is `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. The original REA archive is attachment `9bba4171-4ff7-4ded-83e7-5a62a9f75350`, SHA-256 `c007a6ac77d57b56cdfe8158817ffbcffee6a8f5e7f4a63e2eaef65cbf21b30d`, lineage `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`.

- `Bxa` mounts `e6a` globally. `n6a` renders the config-sync dialog and passes no mutation-pending restriction to `a6a`.
- `a6a` disables the category checkbox only when its total count is zero. It passes the item state and callback to `zei` without a pending flag.
- `zei` renders an enabled checkbox plus click and keyboard selection handlers. The retained `pv` and `nds` chain forwards disabled state, whose field, fieldset and checkbox-group defaults are inactive.
- At submission, `n6a` builds new category and included-item Sets before invoking `Yva`. Later selection callbacks replace state Sets. `Yva` retains the submitted Sets across asynchronous work.
- Current `ConfigSyncDialog` likewise derives a new item array and passes the selected array to `configSyncApi.sync` before awaiting it. Subsequent renders cannot alter that submitted selection.

These are static source conclusions, not observations of a running Conductor or OpenConductor app. The historical renderer semantic analysis exhausted heap. This work reads identity-checked retained bytes as data and does not execute vendor JavaScript or claim a fresh semantic-analysis success.

## Verification

Passed on Reason Cloud352:

```bash
python3 evidence/dialogs/config-sync-pending-selection/prepare_source.py
node --experimental-strip-types --check src/settings/configSyncPendingSelection.test.ts
git apply --check evidence/dialogs/config-sync-pending-selection/candidate.patch
```

The source check verifies the complete renderer, all ten span memberships, the exact baseline, and six protected counterparts. The other commands check syntax and patch applicability only. No application code or test imports execute in these checks.

Not run: baseline RED, candidate GREEN, adjacent tests, typecheck, build, browser, packaged app or native acceptance. There is no screenshot because no UI was executed. The product source remains unchanged until ACC supplies baseline results through its existing serialized ownership.

When ACC admits the existing owner's work, the unchanged regression command for both baseline and candidate is:

```bash
node --experimental-strip-types --test --test-concurrency=1 --test-reporter=tap src/settings/configSyncPendingSelection.test.ts
```

The unchanged harness supports `CONFIG_SYNC_SOURCE_ROOT` for the admitted source tree and `CONFIG_SYNC_DEPS` for its already-approved dependencies. No provisioning, browser, driver, workflow dispatch or native access is added. The adjacent checks are the existing `configSyncDialog.test.ts` and `configSyncSuccessFeedback.test.ts`. Their files, the harness, Full Disk Access pins and original8, org3, SectionV3, QuickStart13 and Icons6 remain untouched.

A ready standalone main PR follows actual behavioral verification. All applicable exact-head checks must pass before merge. No merge or native acceptance is claimed by this source candidate.
