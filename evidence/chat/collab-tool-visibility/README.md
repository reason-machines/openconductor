# Collaboration tool visibility

Author: Conductor Rebuild.

## Contract

Individual `collab__wait` rows stay hidden for every outcome. A `collab__closeAgent` row appears only when any matching result in the same turn has `isError === true`. A later success does not erase that eligibility. The final matching result still supplies the row's status and output.

Completed hidden-only assistant messages do not contribute to the three-visible-message grouping threshold. Hidden tool uses in otherwise-visible mixed messages still contribute to the summary count and tool-name metadata, but never appear as individual rows or expanded-summary children. Active-turn metadata stays available for typing indicators.

## Source

[Historical source receipt](historical-source-receipt.json) records the retained Conductor 0.87.6 shipped asset hashes and half-open UTF-8 ranges. The retained `uie`, `btt`, `bB`, `_jt`, `Ntt`, and `pie` spans establish the block predicate, any-error join, message filter, threshold, and mixed-message counts. `wB` limits the result search to the turn's messages.

These are historical static REA observations. The original semantic renderer analysis exhausted its heap and skipped the renderer. No fresh installed identity or native observation is claimed.

[Qualification](qualification.json) preserves the pre-execution preparation record, archive integrity checks, and frozen fixtures. Archive manifest checks passed for all 31 source entries and 9 acceptance entries. The target files at checked default-main `3c722bf1e460157e5f3b259905bc91d09fba1e67` still matched the source packet's baseline copies byte for byte. [Runtime evidence](execution/runtime.json) records this later baseline and the verified candidate.

## Behavioral check

The frozen test drives the production reducer, Reason adapter, `buildRows`, and `foldAgentRows`. It has 18 immutable row cases and 3 supplemental grouping or turn-isolation cases. The test and JSON hashes are pinned in the qualification record. There are no substitute model functions.

The baseline and candidate use the same command and fixture bytes, within the existing serialized acceptance slot.

```bash
env NODE_OPTIONS=--max-old-space-size=768 nice -n 19 timeout --kill-after=5s 120s node --experimental-strip-types --test --test-concurrency=1 src/features/chat/assistantToolVisibility.test.ts
```

The baseline failed 11 intended assertions and passed 10 cases. After the two-file candidate, all 21 cases passed with identical fixture and command bytes. The candidate matches the archived proposal's product hashes. Tool output and final-result status remain independent from any-error visibility eligibility.

Each adjacent suite ran once with the same serial node flags and a 120-second timeout. `view.test.ts` passed 15 cases, `toolGroups.test.ts` passed 17, `reason.test.ts` passed 14, and `conductorTools.test.ts` passed 15. No cases were skipped. The whole-app typecheck passed once with this command.

```bash
env NODE_OPTIONS=--max-old-space-size=1024 nice -n 19 timeout --kill-after=5s 180s npm run typecheck
```

[Runtime evidence](execution/runtime.json) retains exact paths, commands, start and finish times, exits, hashes, passing controls, and failed baseline assertions. The adjacent suites and the typecheck ran after the same unchanged 21-case GREEN. The foreground slot was explicitly released before publication.

A separately admitted, single project-scoped `npm ci --ignore-scripts --no-audit --no-fund` restored missing dependencies. [Provisioning evidence](execution/provisioning.json) records its successful exit, unchanged root lockfile, and dependency presence checks. This restore was not counted as behavioral execution.

## Limits

This change covers named persisted transcript tools and the existing Reason named-tool wrapper. Native Codex `collabAgentToolCall` normalization is outside its scope. Unknown native mappings are not parity evidence.

Mounted React, browser, package, and macOS native acceptance are not run. The implementation does not change tool-row rendering, transport, global error policy, assistant text filtering, or the frozen pull requests.
