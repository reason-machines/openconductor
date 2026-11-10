# Multiword model search

Conductor Rebuild. Scope: `COMPOSER-MODEL-SEARCH-135-01`.

## Source mismatch

At main `dbdcb4fa7ed0f361bc32abcd428898571d6d0362`, the ModelPicker items predicate requires the entire query to occur in one model name, model ID, or agent label. A local Claude loadout entry for `opus-5-1m` is therefore excluded by `opus claude`, although both words identify that entry.

This is an eligible source input, not an observed user configuration. `parseFavorites` accepts the explicit local agent, `loadoutChoices` preserves it, and `pickerState` includes the loadout when the agent is current or agent switching is available. `ChatModelPicker` passes those favorites and `agentForPick` to ModelPicker. `orderedModelChoices` includes the row before search filtering.

## Retained Conductor evidence

The already-held Conductor 0.87.6 renderer is `renderApp-D_fmY7hW.js`, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. Its bytes were rehashed during this investigation. No new acquisition or reference JavaScript execution occurred.

The direct source chain is:

1. `L7o` constructs searchable entries with model label, agent label, and an ID of the form `agent:model`.
2. `A7o` passes the query and those entries to `lj` with `R7o` as the text getter.
3. `R7o` joins the model label, agent label, and ID.
4. `lj` calls `KBt.go` without a score threshold.
5. `KBt` resolves through `mys` to the retained search implementation. Its query preparation splits whitespace-delimited words. The multiword evaluator checks each word against the same combined entry.

For the source witness `Opus 5 Claude Code claude:opus-5-1m`, both `opus` and `claude` occur literally. This establishes a narrow multiword inclusion mismatch. It does not establish full fuzzy scoring or result-order parity.

The verified half-open UTF-8 byte ranges and excerpt SHA-256 values are:

- `A7o` `[8599657,8601817)`: `e94aaed3bf7beff63737f3574c578074d9b27d30067e6c303cd3358c3a1c7dce`.
- `R7o` `[8601858,8601917)`: `7acb23448ac4ff25dad653d670d1bdc56ebad4eaf5db4daca02ffd472f8200db`.
- Agent ID arrays `[8601917,8601977)`: `0139c0c0c41927b0333dc3670192e3a08e6d001f319523b8059a400f40bf3751`.
- `L7o` `[8603880,8613595)`: `763d5d0e217d3fd22a7decbb99b3551df62c8356626dbb8a07d87585386c6f3c`.
- `lj` `[2839201,2839529)`: `cc3d7c4102af2bb5c8d557b82956e7c8231561f5417784d41807293d2296adb3`.
- Complete `mys` initialization and helpers `[2829988,2838976)`: `b37454e1205cc8a0df1dd3c5b6e8bf04e2f0491397bec24e933d206844f79a35`.
- `KBt` binding `[2838976,2839015)`: `2a7bc952329a33e1b029d4212a33ff45cfbba76d2c27a4cc718b027d25ec6fda`.
- `Dk` import `[54167,54175)`: `5de213a555931acf7faf016669a7ce5c299b20f8613940b24b8290bc8248c0f4`.
- `_A` import `[60229,60237)`: `e8e711e2ae95f0b04f44d8b5e213575231af664bd3c77361208a98af4bac8e59`.

Four matching-build index excerpts are retained in the earlier complete source packet for index SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`:

- Default-export interop `_u` `[117763,117864)`: `0234768a9a5db321fa7ad872061578be6f51a4ea0fa4bcd9043f1003b2518ca1`.
- Agent labels `Rqt` `[301310,301401)`: `8d02c2f3cd6c882e1a915bad01bb299391e85ca80955482bae2d02571e65f616`.
- `_u as b9` export `[3480797,3480805)`: `b0737961c1f96b8edf9a5bd8f27a664c26a024598c8f66f023157c8747b6778b`.
- `Rqt as kS` export `[3486619,3486628)`: `aa804f47684f7396e98fcecf81f558f65d3a2ed5295b796d03e90354bc94072b`.

The four index excerpt hashes were checked against their retained text, not a fresh read of the raw index artifact. The nine renderer excerpts were checked against the complete retained renderer bytes. The complete inert packet is attached to [this Session](https://reasonmachines.com/agents/13576d11-76fb-4842-aa9b-c398f9ca26f3) as `composer-model-token-search-source-packet.json`, SHA-256 `e05053f0d1cefb53b657209482c66b700cccd2af59063692fb728d74de879751`.

## Bounded correction

Require every whitespace-delimited query word to occur as a substring in at least one existing search field on the same entry. Keep case normalization, explicit agent precedence, single-word matching, list order, selection callbacks, and focus handling unchanged. No dependency or reference implementation is copied.

This is not a complete fuzzy matcher. Character-gap matching, scoring, ranking, and full threshold behavior remain outside this change.

## Regression and verification

`modelPickerAgentSearch.test.ts` evaluates the production items callback. The added fixtures cover cross-field words, mixed case and whitespace, multiple words within a model ID, absent words, matching the same row, original result order, explicit and callback agent identity, supplied labels, and unknown IDs. The existing single-word and blank-query cases remain unchanged.

The locked test-only checkpoint was published first in [PR #944](https://github.com/reason-machines/openconductor/pull/944). Automatic hosted CI establishes RED before the predicate correction is published to the same PR. Its frontend command is:

```bash
node --test "src/**/*.test.ts"
```

Local verification is limited to `git diff --check` and inert source/hash inspection. Local Node, tests, builds, installs, product runtime, browser, native, and provider execution remain prohibited. No workflow was dispatched or manually rerun. No screenshot exists because targeted browser and native execution were not permitted.

Hosted RED was verified at PR head `33c7f5740029929f8e3555e2f85c54876829b8b7` in [frontend unit job 130166745298](https://github.com/reason-machines/openconductor/actions/runs/42912577332/job/130166745298). The full source suite reported 2,012 tests, 2,005 passing and seven failing. All seven failures are the new positive multiword cases or their ordering, agent-precedence, and supplied-label checks. The first failure returned `[]` instead of the expected Opus row for `opus claude`.

The separate frontend job passed typechecking, then failed on those same seven unit regressions. Its build step did not run. The correction leaves the regression file byte-for-byte unchanged from the RED checkpoint. GREEN and exact-head build checks are pending automatic hosted CI.

Source-level checks do not establish mounted or native acceptance.
