# Ranked model-search results

Conductor Rebuild · `COMPOSER-MODEL-RANK-135` · baseline main `eef01e9b287472280fb3f4a585bc697d5f1f8f51`.

## Defect and smallest repair

The model menu accepted abbreviated searches after #1409, but still displayed every nonempty result in physical loadout order. Enter from the search field selected that first physical entry, not the strongest match. With Opus 5.5 physically before Opus 5, `opus`, `claude:opus`, `cld` and the exact combined Opus 5 search text rank Opus 5 first in the retained search contract; the baseline puts Opus 5.5 first.

The correction is confined to the `ModelPicker.tsx` items callback. It keeps the existing per-word/per-field membership predicate and provider-identity precedence, then uses the already-pinned fuzzysort 3.1.0 dependency to rank only admitted entries by model label, agent label and qualified ID. Exact combined-text matches precede other fuzzy matches. A fallback retains admitted entries if the combined-text scorer has no result; ranking cannot silently remove an existing member. Blank queries still return physical order, and returned entries are the original choice objects. No key handler, selection callback, loadout, effort, Fast, provider transport, styling or global palette code changes.

## Reference and provenance

The retained renderer SHA-256 is `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. The complete inert source text and byte ranges remain in [the existing source packet](../model-fuzzy-search/source.json), with the [Composer source audit](https://reasonmachines.com/agents/13576d11-76fb-4842-aa9b-c398f9ca26f3?page=0c58efb0-2de0-4ad2-aa79-67115c65d420). This pass verifies all 13 retained snippet self-hashes; it does not claim a fresh full-renderer acquisition/hash check.

Literal caller joins, with half-open UTF-8 byte ranges:

- `L7o [8603880,8613595)`, SHA `763d5d0e217d3fd22a7decbb99b3551df62c8356626dbb8a07d87585386c6f3c`, passes `searchableModels:Tt` to `A7o`.
- `A7o [8599657,8601817)`, SHA `e94aaed3bf7beff63737f3574c578074d9b27d30067e6c303cd3358c3a1c7dce`, derives nonblank `h` from `lj({items:n,query:o,getText:R7o}).map(I7o)`, renders `h.map(...)`, and handles Enter with `k(h[0])`. The mapping preserves the result sequence; this pass does not newly recover the separate `I7o` declaration.
- `R7o [8601858,8601917)`, SHA `7acb23448ac4ff25dad653d670d1bdc56ebad4eaf5db4daca02ffd472f8200db`, returns `` `${t.label} ${t.agentLabel} ${t.id}` ``.
- `lj [2839201,2839529)`, SHA `cc3d7c4102af2bb5c8d557b82956e7c8231561f5417784d41807293d2296adb3`, derives `r=KBt.go(e,t,{key:n}).map(...)`, partitions `r` by `u.match.text.toLowerCase()===e.toLowerCase()`, and returns `[...a,...c]`. It does not restore input order.
- `KBt` binding `[2838976,2839015)`, SHA `2a7bc952329a33e1b029d4212a33ff45cfbba76d2c27a4cc718b027d25ec6fda`, and complete retained `mys` initializer `[2829988,2838976)`, SHA `b37454e1205cc8a0df1dd3c5b6e8bf04e2f0491397bec24e933d206844f79a35`, retain the dependency/ranking closure. The regression uses OpenConductor's existing independent `matchCommands` implementation as its oracle; it never evaluates these vendor fragments.

Before the ledger narrowed this pass to retained-source-only work, a read-only REA 6.7.0 `inspect-artifact /Applications/Conductor.app --format json` ran on Sven's authorized `sven m5 max`. It succeeded with Evidence `ev_073fad1de22de94627d902947184d714b577c7578c567226341845dcd0887c84`. The native binary SHA remains `0ba55751aea5ecf592d2c78379760af641fb912a34b2c3573d41df031ffb831d`, matching the previously documented decoded-renderer relationship. Full inventory receipt SHA is `595b7363030289666104a312c11ae576d3f02724a2730cb31af755125eff5811`, retained at `/tmp/openconductor-rea-model-ranking-135.json` on that Mac. No app was launched, no process/service was left running, and no further Mac action followed the retained-only scope. This evidence file was deliberately retained, not deleted. Inventory success proves artifact identity, not JavaScript semantics or native behavior. The existing REA embedded-asset/source-range limitation remains; no new REA error occurred.

## Frozen RED → GREEN

The new fixture SHA-256 is **`a7a9a940f18fc3c96d390580d2ab2eba926ab578986f76fc6fd38268d61e28d1`**, identical before and after the fix. It executes the actual production items callback and Enter handler with pure dependencies, not a replacement predicate or vendor code.

```bash
MODEL_PICKER_RANK_REF=eef01e9b287472280fb3f4a585bc697d5f1f8f51 \
  node --test src/features/chat/modelPickerFuzzyRanking.test.ts
# exit 1: 11 tests, 6 pass / 5 intended failures

node --test src/features/chat/modelPickerFuzzyRanking.test.ts
# exit 0: the identical 11 tests pass
```

The failures are four ranking cases and Enter's chosen model. Blank/whitespace physical order and object identity, `cdx`, `gpt56`, no-match and explicit/callback provider controls pass before and after. The exact combined query is the exact-versus-fuzzy control. The Enter test also retains prevent-default, stop-propagation, query reset, focus and menu-open assertions.

A preliminary qualifier had a test-harness TypeScript-body parsing error in its Enter case. That output is retained as `preliminary-harness-error.tap`, is not the frozen RED, and was corrected before freezing the above fixture.

## Source-backed expectation migration, not weaker tests

The existing #1409 frozen fixture still passes 12/12 against the baseline; its original file/hash and historical result are preserved under `baseline/` and `pr1409-control.tap`. Once ranking is corrected, exactly four old nonempty-order characterizations fail; [the intermediate run](adjacent-before-contract-migration.tap.gz) records 152 pass / 4 fail out of 156. The parent explicitly authorized replacing those source-contradicting expectations, and the ledger reconciled exclusive ownership.

Only these existing contracts changed:

1. `modelPickerFuzzySearch.test.ts`: literal `opus` result order, with the corresponding strict object-identity positions.
2. `modelPickerAgentSearch.test.ts`: the `claude` and `opus claude` expected result arrays.
3. `modelPickerQualifiedModelSearch.test.ts`: mounted `claude:opus` expected result order.

Test names now describe ranking. No assertion, case, fixture scenario or loader adapter is removed; membership sets, provider precedence, blank physical order, unknown IDs, no-match and all unrelated controls remain unchanged. New regression case bodies/assertions remain byte-for-byte frozen.

## Checks and limits

- **Passed:** unchanged new regression, 11/11; focused `node --test src/features/chat/modelPicker*.test.ts src/features/chat/chatModelFriendlyLabel.test.ts`, 156/156.
- **Passed:** expanded composer/slash/loadout/file-mention/chat-model/model-picker suite, 512/512. Exact expanded command is in `qualification.json`.
- **Passed:** `npm run build`, including branding, TypeScript no-emit checking and Vite production compilation. Existing large-chunk warning remains.
- **Passed:** `git diff --check` and all 13 inert source-span self-hashes.
- **Not run:** full repository source suite, native app/WebKit/provider behavior, installed release acceptance, a new package build or package containment. No full-suite or native-parity claim.
- **No product screenshot:** this lane has no browser/native runtime admission; tests evaluate actual callback logic and mount existing React test fixtures, not a visible app. The audit Page is a report, not visual product evidence.

The existing package run `44070332569` is pinned to the earlier `eef01e9b` source and does not include this successor repair. Existing serialized package/release owners retain follow-through; this change starts no producer, dispatch, native/E1 run or watcher.
