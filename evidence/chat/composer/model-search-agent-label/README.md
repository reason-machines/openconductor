# Agent labels in model search results

Conductor Rebuild. Ledger-cleared row-value scope, sole135.

## Reference contract and current source

Current main was inspected at `a588bddd7f56be4493644dae4c41952919e56f6a`.
ModelPicker had SHA-256
`1b3199b2c8c5f52f8b76e8d1bfcaa690f2243c151adfe75eb4cf3af11ab3bb10`.

The retained Conductor renderer has SHA-256
`5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
Its hash and these complete half-open UTF-8 spans were checked against the
held original bytes. No reference JavaScript was executed.

- `zHt [8614751,8617661)`, SHA-256 `1095aba8788b2c2604efab1db1e81d32b15c2fce15052ccf49b9d6b95f8894d3`. The menu wrapper calls `L7o`.
- `L7o [8603880,8613595)`, SHA-256 `763d5d0e217d3fd22a7decbb99b3551df62c8356626dbb8a07d87585386c6f3c`. It constructs entries with `agentLabel: _A[agent]` and passes them to `A7o` as `searchableModels`.
- `A7o [8599657,8601817)`, SHA-256 `e94aaed3bf7beff63737f3574c578074d9b27d30067e6c303cd3358c3a1c7dce`. Its filtered rows call `ZU` with `value: entry.agentLabel`.
- `I7o [8601817,8601858)`, SHA-256 `011c024f859bfddde24ec45ac3dfb24af70c074a78ce48d9c9cb93d6b4a5be63`. The result projection returns the original item.
- `ZU [8480640,8481983)`, SHA-256 `b9e2bb2fc92ad89079dace9b71b45173ac1d87c967481387b27f2f3818676018`. A defined `value` creates a native `span` with that text. The span is included in the row children independently of the selected checkmark.

The `_A` import, display map, and search-result producer joins are retained in
the [agent-search source evidence](../model-search-agent/README.md#retained-bytehash-packet).
The label map defines `claude` as `Claude Code` and `codex` as `Codex`.
This is a literal-render source contract, not evidence of native execution or
of the row button's event implementation.

Current caller files were read again on the inspected main. Their hashes
match the [qualified-ID eligibility chain](../model-qualified-id-search/README.md#retained-source-and-current-caller-joins).
`ChatModelPicker` passes its eligible favorites and `agentForPick` to
ModelPicker. `orderedModelChoices` retains the configured local Claude entry.
No current user configuration or local provider was observed.

For an eligible `claude` entry with model `opus-5-1m` and effort `high`, the
reference declares an `Opus 5` search result with `Claude Code` as its detail.
OpenConductor instead rendered `Opus 5 High`, with no agent label.

## Focused correction

Filtered rows now show the existing resolved agent's display label.
Identity precedence stays
`itemAgent?.(choice) ?? choice.agent ?? agentForModel(choice.model)`.
Blank and whitespace queries retain the existing effort detail. The correction
changes only row-detail text and reuses the existing detail span and styles.

Search matching, result ordering, callbacks, selection identity, query reset,
geometry, CSS, global keyboard handling, IME, provider behavior, and all
existing regression files remain unchanged.

## Mounted regression

The new test mounts the actual transpiled ModelPicker with real model data,
ordering helpers, and agent inference. Tooltip, icons, animation, document
listener registration, and global keybinding registration are isolated.
Assertions read text from the rendered result rows rather than a copied
formatting function.

```bash
node --experimental-strip-types --test --test-concurrency=1 \
  src/features/chat/modelPickerSearchAgentLabel.test.ts
```

Local focused checks used `NODE_PATH="$PWD/.ara-state/row-test-deps/node_modules"`
with the lockfile versions of React 18.3.1, react-test-renderer 18.3.1, and
TypeScript 5.9.3. Only these test dependencies and their transitive packages
were installed. No full app build or runtime was started.

`MODEL_PICKER_AGENT_LABEL_SOURCE_REF=<git-ref>` runs the same test against an
older actual component revision without changing the regression.

- RED passed as a reproduction check on the unmodified main component.
  Nine tests ran, six failed for missing agent text, and three preservation
  controls passed. The decisive result was:

  ```diff
  + 'Opus 5 High'
  - 'Opus 5 Claude Code'
  ```

  The same-name, Codex, callback-precedence, explicit-identity, and inferred-agent
  cases failed for the same cause. Blank-query effort details, query clearing,
  and selection callback identity passed before the fix.
- GREEN passed after the row-detail-only correction. The identical nine tests
  passed, with zero failures, skips, or cancellations. The regression SHA-256
  before and after the fix is
  `e85c350b3419865e6ede93fbb422279451ecf72162cb1b95995f8d4dfaf86428`.
- Nearby regressions passed with the same dependency prefix:

  ```bash
  node --experimental-strip-types --test --test-concurrency=1 \
    src/features/chat/modelPicker*.test.ts
  ```

  All 98 tests passed, with zero failures, skips, or cancellations.
- `git diff --check` passed. The only product change is ModelPicker row-detail
  text. All existing fixtures are byte-identical to the inspected main.
- Full local typecheck and build were not run. Ordinary hosted workflows
  provide full validation.

## Acceptance limits

No browser, native app, real provider, new reference acquisition, reference
JavaScript, or additional E2E observer was used. No screenshot is available
because this work is limited to retained-source inspection and mounted tests.
Rendered text checks do not prove layout, native or visual parity, or actual
provider behavior. No new REA tool failure occurred. Protected #847 and #916
work remains untouched.
