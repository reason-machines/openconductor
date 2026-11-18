# Run-script primary shortcut ownership

Conductor Rebuild / `RUN-SCRIPT-DIALOG-PRIMARY-1F`.

## Change and reproduction

`RunScriptDialog` now reads the existing live keybinding overrides and matches `dialog.primaryAction` with the existing `effectiveShortcuts` / `matchesEvent` primitives. Remove its legacy `ScriptEditor.onModEnter={submit}` binding: the dialog owns Save activation once, rather than both editor and dialog saving the same bubbled event. Validation, pointer Save, payloads, Escape/Cancel, global keybinding infrastructure and SAME49's entire `ScriptRow` region remain unchanged.

Only production `src/settings/rows/RepoScriptsRows.tsx` changes: five insertions / two deletions. Baseline SHA-256 `9fcfca0123de65aa4aa069a234904988d35f140253a86054971bb375838f4018`; treatment `01a4744126293c4602e628ea2737f2169654a43972e9d02486b881ca0ff10c6e`. Protected ScriptRow-region SHA-256 on both sides: `08aa5d6ea7686016791b717b2442045b342689d8a402572dbc2cf3a83c33c79b`.

Fresh main `1e2500a959f68411be54cdca5c0473d0010b0559` matched all 35 frozen source files before RED. Fresh main `d435e2baba6552de85b12cac2544579d20c14ce1` matched them again before GREEN; the only deliberate loaded-source delta was this treatment. The assigned branch was merged with main, never stacked on another PR.

## Unchanged paired fixture

Frozen original: `frozen/runScriptDialogPrimaryKey.test.ts.txt`, SHA-256 `03c71a53a888567759ea2100713d6379281c9077693b601db1f52915f81205dc`.

The fixture mounts actual `RepoScriptsRows` → Add/Edit → `RunScriptDialog` / `ScriptEditor` under the real keybinding provider, persistence producer, override parser and matcher. Scripts/configuration transport and decorative leaves are inert boundaries. It walks actual React host callbacks in bubbling order. It does not execute reference JavaScript or any script, start a terminal, or access a provider.

One exact command per side, with only `OC_PRIMARY_SOURCE_ROOT` changed from the retained baseline `src` to this checkout's `src`:

```bash
taskset -c 0 nice -n 10 timeout --signal=TERM --kill-after=5s 90s \
  env UV_THREADPOOL_SIZE=1 OC_PRIMARY_SOURCE_ROOT="$SOURCE_ROOT" \
  NODE_OPTIONS=--max-old-space-size=1024 \
  node --experimental-strip-types --test --test-concurrency=1 \
  .oc-tmp/frontend-primary-fixture-1f/frozen/runScriptDialogPrimaryKey.test.ts
```

**RED — failed, exit 1:** 15 total, eight passed / seven failed. Six intended rebind failures: configured name/command shortcuts did not save; replaced Command-Enter still saved; live replacement and additional configured shortcut did not save. The preserved default command-editor bubbling control also failed with **two writes instead of one**. This additional failure was reported, diagnosed against the actual two handlers, and not hidden or weakened. No setup failures, cancellation, skips or TODOs.

**GREEN — passed, exit 0:** identical 15 tests / assertions all passed, including command-field exactly-one Save, pointer payload, Edit id, blank/duplicate/unchanged disabled state, exact modifiers and Escape/Cancel. Original fixture bytes unchanged. Raw TAP is losslessly gzip-compressed under `execution/`.

Permanent regression `src/settings/runScriptDialogPrimaryKey.test.ts` is the prepared port: only comments, URL import and source-root default differ; every byte from `const sourceRoot =` onward remains identical, including all assertions. Frozen port SHA-256 `e52aa095219bad2d8ec6fc64502d822b6c634d7b13eb1c496131950904141508`.

## Focused validation

The separately admitted permanent-plus-adjacent command **passed, exit 0: 36/36**, no failures/skips/cancellations/TODOs: permanent regression 15, repoScripts 5, overrides 8, shortcut matching 8. Actual release **2026-11-17T22:33:53.585735527Z**, no own Node/npm/compiler/browser survivors observed. No test was disabled or weakened.

```bash
taskset -c 0 nice -n 10 timeout --signal=TERM --kill-after=5s 90s \
  env UV_THREADPOOL_SIZE=1 NODE_OPTIONS=--max-old-space-size=1024 \
  node --experimental-strip-types --test --test-concurrency=1 \
  src/settings/runScriptDialogPrimaryKey.test.ts src/settings/repoScripts.test.ts \
  src/keybindings/overrides.test.ts src/keybindings/shortcut.test.ts
```

`python3 evidence/settings/run-script-primary/verify.py` verifies the inert reference spans, exact admitted production delta, protected SAME49 region, immutable fixture and unchanged permanent assertion body, paired TAP outcomes/names and focused TAP. `git diff --check` passed. These are not build/native checks.

## Retained original oracle

Original real-Conductor REA asset provenance: `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. Existing original-byte recovery attachment `4db32769-6ddc-468a-b8da-37ee7cd4cc12`, SHA-256 `5f9359889985aa5664f4f53b6b8c4f64fc9c8f9e46d42f5bcf13eccbf1c1d196`.

Complete retained renderer identity: `renderApp-D_fmY7hW.js`, 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. Index: `index-BGEQ8YjU.js`, 3,493,297 bytes, SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`. No new acquisition or REA execution was required.

`source-manifest.json` preserves the historical qualification, with exact UTF-8 half-open spans, byte sizes and SHA-256 for all 30 inert reference spans. Its old NOT_RUN fields describe that source-only phase, not the later executions recorded here.

Closure: renderer `ama` → `nd` → `uma`; `nd` calls `Qh("dialog.primaryAction", nativeEvent)`, prevents default and clicks an enabled primary action. `Qh` → index `TQt` → `nh` reads live overrides. Editor `FCe` → `KVt` → `tVo` resolves the same configured command via `Mde`, `IMi`, `iEt` and their included joins. `tVo` consumes the dialog chord with `run:()=>!0`, not another settings-save callback; `nd` owns the primary click. Its handler does not reject already-prevented events, so no incompatible defaultPrevented gate was added. The original static Command-Enter hint is intentionally unchanged.

## Execution boundaries

Serialized Reason Cloud, Node v22.23.5. A distinct admitted private dependency-only phase used the committed lockfile with ignored scripts / omitted optional packages; real typed strip-types and nine locked package identities passed. Installation took 27.844 seconds; peak allocated own dependencies plus private cache was 497,393,664 bytes. Private cache was removed at release; no shared tree was used.

Actual dependency cleanup release: **2026-11-17T22:21:36.744243Z**. RED release: **22:24:12.699556643Z**. GREEN release: **22:29:51.280278538Z**. No own Node/npm/compiler/browser survivors were observed at those releases. One CPU0 / low-priority / one test file at a time; 1024-MiB V8 old-space is a per-process heap setting, not group RSS enforcement. Peak RSS was not measured.

## Limits

The callback fixture is not trusted DOM keyboard delivery, CodeMirror newline behavior, macOS, native implicit submission, provider, PTY, packaged/installed-app or side-by-side acceptance. Browser/native execution was not admitted, so there is no new screenshot or recording. Full build/typecheck and broader tests were not run locally; exact-head hosted checks and separately recorded focused checks are distinct evidence. Native/package follow-through remains with Root's existing sole executor; no duplicate dispatch or provider retry was started.
