# Search by an agent-qualified model ID

Conductor Rebuild. Ledger packet QUALIFIED-ID, sole135.

## Retained source and current caller joins

Fresh main was inspected at `f19679e8b57ccba89f61c8212e144a39d567c458`.
Its ModelPicker blob is `d22544748616877b5a0b4ff92ea082655c731cbb`,
SHA-256 `cd55e47321acad3244bd9e43bed11529004a676a95d6fa848ae7826ae3cf6905`.

The retained Conductor renderer has SHA-256
`5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
All 13 excerpts from the preceding [agent-search source packet](../model-search-agent/README.md#retained-bytehash-packet)
were rehashed before this regression. Nine renderer excerpts matched the raw
held renderer bytes. Four index excerpts matched their retained text hashes;
the raw index was not newly read.

The complete source chain is `L7o → A7o → lj → KBt.go`, with `R7o`
as the text getter. `L7o` constructs the built-in row ID as
`${agent}:${model}`. `R7o` includes that ID in the search text.
The complete local matcher, its initialization, query/target helpers,
default-export interop, and import/export bindings are held. A contiguous
qualified-ID query is accepted without a nonzero score threshold. This is a
bounded inclusion claim, not full fuzzy scoring, ranking, or threshold parity.

Key half-open UTF-8 spans and SHA-256 values:

- A7o `[8599657,8601817)`: `e94aaed3bf7beff63737f3574c578074d9b27d30067e6c303cd3358c3a1c7dce`.
- R7o `[8601858,8601917)`: `7acb23448ac4ff25dad653d670d1bdc56ebad4eaf5db4daca02ffd472f8200db`.
- L7o `[8603880,8613595)`: `763d5d0e217d3fd22a7decbb99b3551df62c8356626dbb8a07d87585386c6f3c`.
- lj `[2839201,2839529)`: `cc3d7c4102af2bb5c8d557b82956e7c8231561f5417784d41807293d2296adb3`.
- Full matcher initialization/helpers `[2829988,2838976)`: `b37454e1205cc8a0df1dd3c5b6e8bf04e2f0491397bec24e933d206844f79a35`.
- KBt binding `[2838976,2839015)`: `2a7bc952329a33e1b029d4212a33ff45cfbba76d2c27a4cc718b027d25ec6fda`.

The local input is eligible. `parseFavorites` accepts an explicit `claude`
built-in favorite for `opus-5-1m`. `loadoutChoices` preserves its agent and
model. `pickerState` includes it when that local agent is current or agent
switching is available. `ChatModelPicker` passes its favorites and
`agentForPick` into ModelPicker. `orderedModelChoices` retains the entry.
The four caller files are unchanged between merged #980 and the inspected main.

Caller SHA-256 values, recorded before RED:

- ChatModelPicker: `17a6ce1601d1ecc0a4b1ef642f3e74ec5bc2a39ea418e1f904d41951ba4f17b9`.
- chatAgentChoice: `205d78402404009c68f5485e2833dd2a6d294302072ffef3216854518c0e6712`.
- loadoutChoices: `6f598e35d99d142e63711db22e0e189096cb0162410f1daf73a35833311c354c`.
- settings/agents/loadout: `689db32d91fcf7a84deb1c31293a8c877797c63bf0223ae1fd954011ff5ef3e7`.

## Mismatch and bounded correction

For that row, `claude:opus-5-1m` is a contiguous substring of the reference's
search text. Current OpenConductor searches only the display name, raw model
ID, and agent label. None contains the qualified ID.

The correction adds a search field formed from the already-resolved agent and
existing raw model ID. Identity precedence remains
`itemAgent?.(choice) ?? choice.agent ?? agentForModel(choice.model)`.
Existing fields, case normalization, word matching, result order, selection
identity, callbacks, and memo dependencies remain unchanged. No dependency,
fuzzy algorithm, or provider behavior is added.

## Regression

The new test transpiles and mounts the actual ModelPicker. Real model data,
ordering, shortcut formatting, and agent inference remain in use. Tooltip,
icons, animation, global keybinding registration, and document listener
registration are isolated. Assertions use rendered result rows after typing,
not a copied filtering predicate.

```bash
node --experimental-strip-types --test --test-concurrency=1 \
  src/features/chat/modelPickerQualifiedModelSearch.test.ts
```

`MODEL_PICKER_QUALIFIED_SEARCH_SOURCE_REF=<git-ref>` selects an older actual
component revision without changing the regression.

- Confirmed focused mounted RED against the unchanged inspected main component:
  nine tests ran, seven failed and two passed. The exact qualified-ID query
  returned `[]` instead of `["Opus 5"]`. Qualified prefix, case, order, and
  identity-precedence cases failed for the same missing row. Wrong-agent,
  missing-model, raw-ID, agent-label, and blank-query preservation controls
  passed. The regression SHA-256 before the fix is `c641fb42f55f0f18356fb7c6484724eb93385709bc00640565fff996b9bd1c93`.
- Passed: the same focused mounted command after the one-field correction,
  nine tests passed with zero failures, skips, or cancellations. The regression
  remained byte-identical at SHA-256
  `c641fb42f55f0f18356fb7c6484724eb93385709bc00640565fff996b9bd1c93`.
  Callback identity, explicit identity, catalog inference, matching order,
  qualified prefixes, normalized case, raw IDs, and no-selection controls pass.
- Passed: `git diff --check` and exact three-path diff inspection. All existing
  fixtures are unchanged. Full validation uses the ordinary hosted workflows.
- Passed: retained excerpt hashes, complete source/caller join inspection,
  and the exact three-path collision check.
- Not run: full local suite, local build, browser, native app, real provider,
  reference JavaScript, or a new E2E observer. No screenshot is available under
  this unit-test and retained-source scope.

All existing regression fixtures remain untouched. Geometry, busy state,
effort, provider identity, global keyboard, IME, query lifetime, and protected
#847/#916 work are excluded. Static shipped-source evidence and mounted row
tests do not prove fresh native or visual parity. No new REA tool failure
occurred.
