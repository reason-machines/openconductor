# Reconcile linked directories before the next idle Claude turn

Owner: Conductor Rebuild / Settings SAME49. Fresh-main baseline:
`a77e6efe35ea17dafc185fc9391de0cebca39fad` (#1414 actually merged).
This is a separate main-based successor, not a commit appended to #1414.

## Qualified reference and actual caller

The already-retained Conductor 0.87.6 REA-subject Bun sidecar is 13,025,924
bytes, SHA-256 `f72df80a11d76bacb7ed7e2a322b420e6250b4a2c7781272877b8c5cf985e6ab`.
The complete `Ln4` policy at bytes [3507564,3508680), SHA-256
`84781653d6c5b6b714b3894522864da8755f2523d3784c73b8e21d7bcecbfdf2`,
marks `additionalDirectories` as `recreate`. Its complete `WB5`/`An4` helper
span compares arrays by ordered JSON value, including removal and reordering.
The pinned query schema, `gp5` → `BT4` config mapping, `CB5`, runner reconciliation,
message/warm callers, resume/restart callback and SDK launch excerpt close the
query-to-generator path. Reconciliation recreates when eligible; busy work is not
interrupted. These are inert exact source records inherited from
[Auto policy](../auto-permission/reference.json) and
[Chrome reconciliation](../chrome-reconcile/reference.json), with full hashes
retained in [reference.json](reference.json). No reference code was evaluated.

The actual local `claude_prompt` resolves saved workspace links each turn,
checks that the workspace matches the chat folder and that every link is an
absolute local path, then passes the paths to `prompt_with_handoff`.
`prompt_with_handoff` calls `ensure_live` before enqueueing/sending the turn;
`ensure_live` assigns `launch.add_dirs` before spawn, and `ClaudeLaunch::args`
serializes each path to `--add-dir`. Three exact local caller/argv spans and
unchanged complete-file hashes are retained in the reference. Database resolution
is a static caller binding, **not an executed SQLite test**.

## Defect and smallest repair

Baseline `ensure_live` unconditionally rejects a changed directory list whenever
the existing process is alive, even when idle. That permanently blocks the next
turn instead of recreating its generator. The repair combines directory equality
with the existing option equality/restart boundary. Identical directories/options
still reuse idle or busy generators; changes reject while a turn is busy and
recreate after it ends, preserving the observed resume id and current launch
options. The busy message now includes linked directories. One production file
changes, with no API/schema, workspace-link resolution/UI, provider or permission
widening.

The old process-based runner test encoded the unsupported-directory error. Its
assertions now describe idle removal/addition, `--add-dir`, reuse and resume.
That test was updated but **not executed**, because even a stand-in CLI process
is outside this lane's no-process authorization.

## Frozen reproduction and results

The original ten-case [pure fixture](probe-template.rs) remains byte-for-byte
SHA-256 `2442793b8b979b8633779f6407776c7dd4d7406e6df5c38a6f75fd2f159b10a4`.
The driver also remains unchanged, SHA-256
`0587d8822a69b6ad06a5b288c9fbfe38444f39176308b073e23f722704c27600`.

- Original main `1d8c37ab6`: compiled, **5 pass / 5 intended assertion failures**
  ([original RED](original-red.log.gz), [historical qualification](original-qualification.json)).
- Fresh main `a77e6efe3`: compiled, **7 pass / 5 intended assertion failures**
  ([fresh-main RED](current-main-red.log.gz)). The same ten cases run, plus the
  two inherited permanent Chrome option tests. Add/remove/replace/reorder and
  retry-after-busy fail for the expected old directory rejection, not setup errors.
- Repair: identical ten cases plus those two permanent tests, **12/12 pass**
  ([GREEN](green.log.gz)). Controls cover unchanged idle/busy reuse, busy no-kill,
  retry after completion, first/dead launch, observed/saved identity, current
  directories, Plan/model/effort/Fast options and a separate untouched chat.
- Original Chrome fixture against its original current-main contract: **11/11
  pass** ([archived-contract check](chrome-archived-green.log.gz)). The original
  Chrome fixture and all its historical proof are unchanged.
- Explicit Chrome successor against this repair: **11/11 pass**
  ([successor GREEN](chrome-successor-green.log.gz)). Only the contradictory
  directory-rejection assertion and its test name change; new assertions require
  recreation, new directories, Chrome off and the observed resume id.
  [Exact successor diff](chrome-successor.diff), fixture SHA-256
  `5860d00356843824c9d4873ad962de6dcfe9c5b5e3e6145b9cd7cea6851bc2cb`.
- Adjacent pure checks **passed**: Auto/Plan policy/protocol **13/13**, interaction
  **7/7**, stream protocol **6/6**, launch policy **1/1** (retained `adjacent-*.log.gz`).
- Reference verifiers, Python syntax and `git diff --check` **passed**. The new
  verifier checks exact retained spans, frozen fixtures/driver, explicit successor
  delta, eight unchanged production files and the complete bounded runner diff.
  Unchanged-file checks are source preservation, not unexercised behavioral claims.

All logs use lossless gzip to preserve original whitespace. Actual prefix, whole
source and adapter hashes are in [baseline-source.json](baseline-source.json) and
[candidate-source.json](candidate-source.json). `source_ref` records the checked
HEAD; candidate bytes are distinguished by the recorded runner/prefix hashes.

```bash
python3 evidence/settings/linked-directories-reconcile/run-probe.py --source-ref a77e6efe35ea17dafc185fc9391de0cebca39fad # expected assertion RED
python3 evidence/settings/linked-directories-reconcile/run-probe.py
python3 evidence/settings/linked-directories-reconcile/run-chrome-successor.py
python3 evidence/settings/chrome-reconcile/run-probe.py --source-ref a77e6efe35ea17dafc185fc9391de0cebca39fad
python3 evidence/settings/linked-directories-reconcile/verify-reference.py
python3 evidence/settings/chrome-reconcile/verify-reference.py
python3 evidence/settings/auto-permission/verify-reference.py
python3 evidence/settings/auto-permission/run-tests.py
python3 evidence/settings/auto-permission/run-tests.py --filter interact_tests::
python3 evidence/settings/auto-permission/run-tests.py --filter agent::claude_stream::tests::
python3 evidence/settings/auto-permission/run-tests.py --filter launch_policy_case::
```

## Acceptance and REA limits

The pure harness copies the actual `ChatOptions` and `ensure_live` prefix and
stops immediately **before** `ClaudeSession::spawn`. Only the return type/reuse
return are mechanically adapted to expose the prepared launch. Kill/wait are
counters; the session/mapper/launcher are DTOs. The Chrome successor additionally
uses the existing immediate pure preference adapter. No CLI, stand-in executable,
provider process, Tauri app, database or vendor JS runs.

Full Tauri compilation/integration, the process-based runner suite, real SQLite
lookups, live CLI recreation/resume, installed identity, package containment and
native/visual behavior were **not run**. No screenshot is supplied because no
app/runtime action is authorized. Existing package/native/E1 owners and all holds
remain unchanged. Automatic CI reports only checks actually executed; skipped
manual Rust workflows are not passes. Merge only after all exact-head executed
checks pass.

No new REA invocation/acquisition occurred. The existing extraction/semantic
coverage gap remains: exact retained REA-subject source is not observed native
behavior, and the inherited parent binary/bundle binding was not remeasured here.
