# Tool disclosure across chat remounts

Conductor Rebuild checked main `167492e56dbbb90850efbadf1db2848dae7622f2` before publishing this regression. All eight source pins in the inherited BE7 comparison are unchanged from its original checked main. The assigned branch remains `reason/task-64baa6b6`; the pull request targets `main`, not another pull request.

## Source evidence

The retained Conductor 0.87.6 renderer has a module-lifetime `dIt` expansion store. Uncontrolled `Mu` rows read that store through their caller's persistence key and write it only after a manual toggle. `O0o` supplies the Read tool-call id. `gpo` supplies the plan tool-call id and starts expanded. An explicit stored false is distinct from an untouched default.

`WorkspaceView` keys `ChatPanel` by the selected chat. That destroys and remounts `Transcript` when switching between chats. Baseline `Transcript` holds manual tool choices in a mount-local map. Corrected hosted baseline `51a2972e9fb0bcbd1e200601f2a2ec961ebbe922` reproduced both lost choices through the real tab and row handlers, with all three controls passing.

`source-lineage.json` retains the original REA evidence id, exact ranges, hashes, and limitations. `requalification.json` binds the comparison and frozen baseline `Transcript` to the current main above. `repository-fixture.json` and the fixture's own freeze record the final integrated files; the supporting rebind receipt also retains the earlier loader hashes before its whole-module replay override. The original renderer was inspected statically, not executed. Earlier REA semantic renderer analysis exhausted heap; the exact retained shipped bytes remain the source evidence.

## Frozen behavioral check

`src/features/chat/disclosureRemount.test.ts` enters the existing automatic frontend test glob. It runs the frozen five-case fixture twice through its proof loader. Baseline resolves the complete historical source closure from an isolated snapshot root; candidate resolves the actual current checkout. Baseline source pins, fixture hashes, two exact assertion failures and three passing controls are required before a candidate receipt can qualify. The wrapper removes inherited `NODE_TEST_CONTEXT` before spawning a real child test runner; the frozen host, loader, source policy and five scenario bodies are unchanged.

The fixture loads full production `WorkspaceView`, `ChatPanel`, `Transcript`, and `ToolRows` modules. It uses the production initializer, reducer, tab click handler, provider-snapshot subscription, row click handler, `aria-expanded`, and rendered content. It does not copy or replace those state or toggle handlers. Native transport and provider boundaries are synthetic. Markdown decoration and unrelated UI leaves are substituted.

The two intended baseline failures are:

- `read-open-return` must retain a manually opened Read row after chat A, chat B, then chat A.
- `plan-closed-return` must retain a manually closed default-open plan after the same chat switches.

The controls cover a distinct tool id in chat B, a same-chat rerender, and manual collapse through real `garry_mode` preference updates. The Garry control preserves existing behavior and is not a new original-parity claim.

A loader failure, import failure, transport assertion, timeout, incomplete run, or failure in a control does not qualify as behavioral RED. Product code must remain unchanged until both intended assertion failures and all three passing controls have actually run.

## Verification

Passed on the Reason cloud computer without product execution:

```bash
python3 evidence/chat/tool-disclosure-remount/verify_source.py <original-conductor-dxe-source-closure.tar>
git diff --check
```

The verifier checks the original archive, renderer identity, seven exact reference spans, eight current-main source pins, 132 loader dependency pins, five frozen fixture files, and the complete frozen baseline `Transcript` snapshot.

The automatic hosted frontend jobs run:

```bash
node --test "src/**/*.test.ts"
```

The first automatic hosted baseline, head `6c379ef1e08ae987ac20d53eadaecedd84c5bf4f`, failed all five cases during fixture mounting. The decorative `AllFilesTree` proxy supplied a component for the unrelated `useFilesToolbar()` hook; its no-argument call threw before any intended disclosure assertion. This run is rejected, not behavioral RED. [The diagnostic receipt](unqualified-hosted-baseline.json) retains the exact job and failure lines. The corrected host calls the actual `appPrefs.loadAppPrefs()` initializer through the existing synthetic native boundary before mounting, asserts the persisted panel and Garry values, and completes two missing unrelated boundary exports. No panel hook value or production component is fabricated to avoid the error. [The source-only host receipt](host-bootstrap-repair.json) records the four replacements. Only the host digest is re-frozen before a qualified behavioral baseline; product code and all five scenario bodies remain unchanged.

## Qualified baseline and minimal correction

[The complete five-case hosted log](qualified-hosted-baseline.log.txt) and [receipt](qualified-hosted-baseline.json) retain frontend job `130868554090` in run `43123185796`, head `51a2972e9fb0bcbd1e200601f2a2ec961ebbe922`. Both failures are `ERR_ASSERTION` at the intended post-return row assertions, not loader failures:

```text
not ok 638 - read-open-return: manually opened Read survives the actual A to B to A tab switch
  READ_OPEN_RETURN_LOST_MANUAL_EXPANSION: false !== true
not ok 639 - plan-closed-return: manually closed default-open plan survives A to B to A
  PLAN_CLOSED_RETURN_LOST_MANUAL_COLLAPSE: true !== false
ok 640 - different-tool-id-isolation: untouched B does not inherit opened A's state
ok 641 - same-mounted-chat-rerender: ordinary rerender retains the opened Read
ok 642 - expanded-setting-manual-override: real garry_mode update preserves explicit false
```

The fix changes only `Transcript` product source: an immutable tool-id-to-boolean snapshot now lives for the module lifetime and publishes to `useSyncExternalStore` subscribers. Only explicit toggles write entries; the existing helper still distinguishes stored false from an untouched default. Summary expansion remains component-local. Eight existing AST-extraction test hosts include the exact new production store declaration rather than a fake store; independent Todo test fixtures receive independent VM applications so reused synthetic IDs cannot leak across tests. Their scenario inputs and assertions are unchanged.

[Fresh main `bb717dad2e1c4cbcbdba3d29d607a76a069f7f85`](fresh-main-before-fix.json) has all eight comparison source pins unchanged from the qualified baseline. Source/hash verification passed again, including all five frozen helper files. First candidate `b7ce300be981d5f3487fc994ab503346ac1d2dff` failed the earlier standalone top-level chat-find step: its separate AST test loader also omitted `toolDisclosure`, producing five `ReferenceError` failures before the disclosure replay. Job `130873452281` in run `43124623077` retains this integration failure. The correction adds only the exact production declaration to that eighth loader; its fixture data, five scenario bodies and assertions are unchanged. Product code and all five disclosure helper files remain byte-identical to the first candidate. Candidate behavioral GREEN and exact-head aggregate workflows await the corrected automatic hosted run.

No local Node, React, browser, Rust, native, provider, credential, database, or package execution has run. No screenshot is provided because local/browser/native execution is outside this lane's admission; hosted React test-renderer evidence is not visible native-app verification. All exact-head workflows must pass before merge; consuming-main package verification follows the merge separately.

## Baseline root isolation after #1102

Main `a2ef261711b439e7ab00a25b3cb3275a5b55c823` changes `src/scripts/api.ts` legitimately. The original wrapper mixed a historical Transcript override with live dependencies, so its historical source preflight now fails before any scenario executes. The same fault blocks #1100 at `src/features/openIn/apps.ts`; [frontend job 130882947136](https://github.com/reason-machines/openconductor/actions/runs/43127398595/job/130882947136) records that failure. Neither failure is behavioral RED.

The wrapper now materializes `tests/chat-disclosure/baseline-sources.json.gz` beneath the checkout. It contains 213 exact historical files from `167492e56dbbb90850efbadf1db2848dae7622f2`: all 132 immutable source-policy files and 81 additional files needed to resolve the existing decorative, overridden, and stylesheet module boundaries. The additional paths and hashes are recorded separately in `baseline-resolver-files.json`; none replace the original pins. The wrapper checks every archived file, rejects escaping paths, and supplies no live-source symlinks or fallback. Its cheap source-root regression changes and removes a synthetic live dependency while the historical bytes remain unchanged, and executes the changing live text through the candidate root.

Baseline alone receives the historical root. Candidate receives the real checkout, rejects a Transcript override, verifies every tracked current `src` file against its current Git blob, rejects untracked source files, and logs that manifest. The unchanged paired cases then exercise the actual live Transcript. Both stages still use the installed external npm packages through the enclosing checkout. The archive is source evidence, not an isolated historical dependency installation or native build.

The frozen loader's raw `source_head` is the enclosing runner commit, not the historical source commit. Separate wrapper provenance identifies the historical revision, compressed archive hash, frozen source-policy hash, resolver-manifest hash, and source-file count. Cleanup removes only the wrapper's unique temporary directories.

Run the source-only preservation check without JavaScript execution:

```bash
python3 evidence/chat/tool-disclosure-remount/verify_baseline_root.py
```

To regenerate the deterministic snapshot from a checkout containing the historical commit, append `--write-snapshot`. Automatic frontend CI runs the new source-root regression and unchanged paired behavioral cases. Their runtime result remains pending until that exact-head run completes. No local JavaScript, native execution, manual dispatch or UI acceptance is part of this repair.

Only `Transcript` tool-map lifetime and dedicated regression/evidence files belong to the original disclosure change. This follow-on root repair changes no product source. Workspace producers, closed-chat catalogs, APIs, backends, models, labels, summary expansion, and Settings display wiring are outside scope. The merged login fixtures remain unchanged.
