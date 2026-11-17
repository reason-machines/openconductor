# Task-specific Run Stop

Conductor Rebuild prepared the source candidate against main `492bc5c78f2e168924f9003bfb68c7023b4aa931`. Mounted-component validation passed on Reason Cloud against fresh main `975fce431b3d6448f0a20faeca1819a14bef05be`, incorporated normally at local head `ff580a069cc68f7c7595ae85ccff78ee03772677`.

## Reference and change

The retained Conductor 0.87.6 extraction comes from REA evidence `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. Its renderer SHA-256 is `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`; its index SHA-256 is `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.

In renderer `nro`, `ke` is the displayed task from `Yio`, and `We` is its busy state. Stop handler `B1` passes `We ? ke : ve?.id` to `q_.killProcess`. The import/export join connects `q_` to index `ARt`, whose task argument reaches `js.getState().killProcess`. That method distinguishes a specific task from an omitted argument meaning every workspace task. [Exact source ranges and hashes](source.json) retain these joins.

OpenConductor's ordinary Run Stop instead passed `null`. Its existing Tauri bridge preserves that argument, and `RunManager::stop` interprets it as all workspace tasks. The candidate changes only that consumer to pass `shown`. It does not change backend stopping, Spotlight, ScriptOutput, the browser stand-in, or frozen Copy13/input21 packets.

Both apps stop previous workspace runs when starting another task. This is not a concurrent-run defect. The bounded risk is a Stop control whose displayed task has been replaced before its status refresh. Actual native event ordering has not been observed.

## Regression identity

The existing nine-case `runActionErrorContext.test.ts` remains the basis of the successor. Its original SHA-256 is `1d6fd68c6743517fc21a60023339a440f5b65aae53d87b472e96f30b4fed2ee6`.

The successor explicitly changes the same-workspace Stop IPC expectation from `scriptId: null` to `scriptId: "dev"`. It adds a constructed stale-status case and a normal Stop control. They mount the real Run panel and use its real bridge with a modeled native stop boundary. Existing deferred-error cases keep their behavior. The eleven-case successor SHA-256 is `604e459b1186bad03190014a970473a564341fa9f18414d9d33253fd4cea30cb`.

Test Behavior, Not Implementation shaped these checks around the externally received task ID and which modeled task remains. The replacement schedule is constructed; it does not establish that native dispatch produced that ordering.

## Verification

- **Passed:** Python source qualification checked original asset hashes, producer/consumer joins, the exact one-argument production diff, original/successor fixture identities, existing bridge/runner semantics, and unchanged excluded source files.
- **Passed:** `git diff --check`.
- **Passed:** the identical eleven-case successor first produced nine passes and two intended assertion failures against the baseline, then eleven passes against the candidate. Both runs reached every case with zero skips, cancellations, or todos. The failures were the exact Stop IPC argument and the constructed replacement-task preservation assertion.
- **Passed:** adjacent `runSelectionHistory.test.ts` and `runTab.test.ts`, eleven cases with no failures, skips, cancellations, or todos.
- **Passed:** root `tsc --noEmit`, exit 0.
- **Not run:** the historical original-nine suite, build, browser, native process stopping, or packaged-app observation. Original-nine bytes remain preserved in Git history and the source packet. Native dispatch ordering, signal delivery, visual parity, and installed-build inclusion remain unverified. No screenshot is supplied because the allocation excluded browser and native execution.

The sole ACC admitted these checks under `ACC_1F_STOP11_20261113T0231`. The exact before-and-after command was:

```bash
NODE_OPTIONS=--max-old-space-size=512 nice -n 19 \
  timeout --signal=TERM --kill-after=5s 60s \
  node --test --test-concurrency=1 --test-reporter=tap \
  src/scripts/runActionErrorContext.test.ts
```

Adjacent command, exit 0:

```bash
NODE_OPTIONS=--max-old-space-size=512 nice -n 19 \
  timeout --signal=TERM --kill-after=5s 60s \
  node --test --test-concurrency=1 --test-reporter=tap \
  src/scripts/runSelectionHistory.test.ts src/scripts/runTab.test.ts
```

Typecheck command, exit 0:

```bash
NODE_OPTIONS=--max-old-space-size=2048 nice -n 19 \
  timeout --signal=TERM --kill-after=5s 120s \
  node node_modules/typescript/bin/tsc --noEmit
```

One root `npm ci --ignore-scripts --no-audit --no-fund` ran with a 1024 MiB Node heap and a 600-second timeout. Setup passed in 12.784 seconds with unchanged package and lock bytes. Normal resolution found Node 22.23.4, React 18.3.1, react-test-renderer 18.3.1, and TypeScript 5.9.3. No alternate dependency tree or loader was used.

[The validation record](source.json) retains raw stdout, stderr, exact argv, source hashes, exits, and counts. Baseline RED took 1.924 seconds, candidate GREEN 3.082 seconds, adjacent tests 3.928 seconds, and typecheck 32.159 seconds. These are execution bounds, not performance claims. Release occurred at `2026-11-13T02:35:03.982969Z`, 209.726 seconds after actual start, within the 1080-second inclusive allocation. A subsequent process-group check found no owned process remaining. The candidate and successor were restored and rehashed after validation.

Prove It Works shaped the check around the mounted production panel and real scripts bridge, rather than a source-only assertion. The native boundary remains modeled. This is neither a native parity verdict nor a concurrent-run claim. Capacity v2, Copy13, input21, and all other frozen packets remain unchanged. The standalone PR targets main and waits for every enabled exact-head workflow to pass before merge.
