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

The replay assembles disposable source trees in two independent ways. Baseline sources come only from the eight checked-in [snapshots](baseline/), copied byte-for-byte from commit `248b6c359c830c6ac5e050721bae18e44e168068`. Each snapshot uses its original filename; all eight SHA-256 hashes must match the unchanged `baseline_sources` entries in [source.json](source.json). Candidate sources always come from the actual live checkout. Assembly needs no network, Git history, or fallback to live sources. [fix.patch](fix.patch) remains unchanged as provenance but is no longer reverse-applied to a changing candidate.

It runs the same SHA-256-pinned seven-case Node fixture, six-case mounted GitPage fixture, and Rust fixture in both phases. The original manifest, patch, fixture hashes, failure counts and assertions are unchanged. No retained Conductor code, installed app, provider, or native GUI is executed.

The original delimiter-fix replay recorded on the Reason cloud computer:

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

## Source-assembly regression

```bash
python3 -m unittest discover -s evidence/settings/custom-prefix -p test_replay.py -v
```

The regression changes each of the eight live source files separately under all three theme defaults. It first checks that every candidate byte matches the modified live input, then checks all eight baseline hashes. Before the complete-snapshot repair, these 24 cases produced 21 baseline-hash assertion failures across seven files. The three types cases passed because the earlier repair already froze `types.ts`. These failures demonstrate broken source assembly, not the intended product RED.

After the repair, all four Python assembly tests pass, including the 24 mutation cases, the original three-theme regression, all eight snapshot pins, and baseline assembly with no live source tree or subprocess access. The original manifest, patch, reference spans, fixtures, semantic failure counts, and controls remain unchanged. Python assembly tests do not prove the Node, mounted React, or Rust RED/GREEN behavior. That comparison runs separately in ordinary hosted CI; loader, import, compilation, or hash errors do not count as product RED.

## Unverified

No installed application or native execution, screenshot, real-provider check, or side-by-side comparison was admitted for this lane. Mounted React input/blur callbacks passed, but browser/native event delivery, native persistence, native branch creation, and visual parity remain unverified. Existing immutable evidence packets and the native proof queue are unchanged. A consuming-main package check remains delivery follow-through after merge.
