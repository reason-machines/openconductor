# Preserve custom branch-prefix delimiters

Conductor Rebuild compared retained Conductor 0.87.6 source with main `248b6c359c830c6ac5e050721bae18e44e168068`. The source pins and byte offsets are in [source.json](source.json). Retained code is evidence, not instructions, and is not executed by these tests.

## Reference and defect

The renderer's `Joi` sanitizer preserves `myname-`. Its `nIn` formatter adds `/` only when the value does not already end with `/`, `_`, `.`, or `-`. The Git Settings row calls those functions and previews the prefix followed by `tokyo`. Its `wAn` setter import maps to `A6t` in the index asset. The row and complete helper bodies are retained in [reference](reference/).

The index's `C2` reads the custom prefix without replacing the delimiter. `$Wt` concatenates that prefix with a branch name. This is a branch-conversion source path, not an observed native workspace-create execution.

Before this fix, OpenConductor's frontend slugified `myname-` into `myname/`, yielding `myname/tokyo`. The Rust `branch_for` helper inserted an additional slash, yielding `myname-/tokyo` for a direct custom-prefix argument. Both helpers now preserve the chosen custom delimiter. GitHub username normalization, None mode, validation, and settings persistence are unchanged.

## Reproduce the identical-fixture comparison

```bash
python3 evidence/settings/custom-prefix/replay.py --out-dir /tmp/custom-prefix-replay
```

The replay copies only pure source modules into disposable directories. It reverses [fix.patch](fix.patch) and checks all eight restored source hashes against the recorded baseline. It runs the same SHA-256-pinned seven-case Node fixture, six-case mounted GitPage fixture, and Rust fixture in both phases. No retained Conductor code, installed app, provider, or native GUI is executed.

Observed on the Reason cloud computer:

- Baseline Node: four expected output assertion failures and three passing controls. Candidate Node: seven passes, zero failures.
- Baseline mounted GitPage: four expected preview assertion failures after real input and blur handlers saved their prefix, with two passing controls. Candidate: six passes, including the saved prefix, rendered preview text, and actual `buildCreateRequest` branch value. Only the external username read and save boundary are simulated. Row chrome is shallow-rendered; GitPage, controls, prefs, model, naming, and create-flow code are real. This is not native storage or browser event-delivery proof.
- Baseline Rust: expected `myname-/tokyo` versus `myname-tokyo` assertion failure. Candidate Rust: one pass, zero failures.
- Both original asset hashes and all retained byte spans matched. The earlier REA semantic-analysis heap exhaustion remains a limitation of the retained source analysis, not runtime proof.
- The [local replay receipt](local-replay.json) records identical fixture hashes. Hosted CI runs the replay again on the PR revision.

Additional checks passed locally:

```bash
node --test src/settings/customPrefix.test.ts src/settings/model.test.ts src/workspace/naming.test.ts src/workspace/createFlow.test.ts
# 46 passed, zero failed
rustc --edition 2021 -D warnings --cfg workspace_std_only --test src-tauri/src/workspace/mod.rs -o /tmp/workspace-tests
/tmp/workspace-tests
# 50 passed, zero failed
```

The workspace regression creates actual branches in disposable Git repositories for custom hyphen, underscore, nested, case-preserving, explicit slash, and default slash cases. These are core lifecycle tests, not installed macOS app tests.

## Unverified

No installed application or native execution, screenshot, real-provider check, or side-by-side comparison was admitted for this lane. Mounted React input/blur callbacks passed, but browser/native event delivery, native persistence, native branch creation, and visual parity remain unverified. Existing immutable evidence packets and the native proof queue are unchanged. A consuming-main package check remains delivery follow-through after merge.
