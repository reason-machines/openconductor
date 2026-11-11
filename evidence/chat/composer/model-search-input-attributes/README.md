# Model search text-correction attributes

Owner: Conductor Rebuild. Ledger packet: INPUTATTR, sole135.

## Retained reference evidence

The existing REA extraction of Conductor's renderer `renderApp-D_fmY7hW.js`
has SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
Its complete `A7o` producer at UTF-8 half-open bytes `[8599657, 8601817)`
has SHA-256 `e94aaed3bf7beff63737f3574c578074d9b27d30067e6c303cd3358c3a1c7dce`.
Both hashes were revalidated from the held artifact before edits.

The producer renders a native `input` labelled "Search models" with
`autoComplete:"off",autoCorrect:"off",autoCapitalize:"off",spellCheck:!1`.
These properties are on that input literal, not forwarded through an unresolved
component. This is static shipped-source evidence, not observed OS behavior.
No new reference acquisition, JavaScript execution, or REA gap was needed.

## Current source and smallest correction

Fresh main inspected before the regression:
`7af2b95aa74dff985fb6b745f7cc080287d35ea6`.
Its actual `ModelPicker.tsx` input has autocomplete off and spellcheck false,
but omits `autoCorrect` and `autoCapitalize`.
Fresh main was rechecked immediately before the fix at
`1b75772349ee3e97b4f4ac9dec594d67b3048e15`; `ModelPicker.tsx` was unchanged
from the regression baseline and still omitted both attributes.
The correction adds only `autoCorrect="off"` and `autoCapitalize="off"`.

All existing fixtures remain byte-identical:

- #951 mouse search: `45d080e56eb16052b9406df4685ae2fea95fb7b17c056451787e809332484b68`.
- #951 search height: `da4b7c76d081c1eb77d151c5d8f66e1428817f8d1ae6ab2d768bf7807f461c13`.
- #957 search scroll: `ed952d62f3db19489f856f97dea589c7b37b356f6d5f7179a79e0a97fc1a681b`.
- #965 all 14 propagation controls: `d229dbc77564ecbf90485152e66ec24967061e17d9346154d38699741e8b0a9f`.
- #973 all 18 IME controls: `8ab198fd940c895ae2eb65db5ffd345e00ca7f49a6dac9d323277ad4514ac6d2`.

No provider, busy-state, effort, geometry, composer editor, key handling,
shared helper, or other JSX behavior changes belong to this packet.

## Regression and verification

`modelPickerSearchInputAttributes.test.ts` transpiles the actual component and
mounts it with React's test renderer. The tests open its menu through its chip,
change its controlled query, and inspect the rendered host input's props.
Model data, ordering, and shortcut formatting use the real modules.
Tooltip and icon rendering, popup animation, global keybinding registration,
and document event registration are isolated. This is mounted component-prop
coverage, not browser DOM dispatch or native keyboard acceptance.

Two tests independently require the missing props before typing, after typing,
and on reopening. Two preservation controls check existing input attributes
and exact query strings without model selection.

Automatic hosted command:

```bash
node --test "src/**/*.test.ts"
```

Focused command:

```bash
node --test src/features/chat/modelPickerSearchInputAttributes.test.ts
```

`MODEL_PICKER_SEARCH_INPUT_SOURCE_REF=<git-ref>` selects an older component
revision while keeping all assertions unchanged.

- Passed: held renderer and complete producer hashes, fresh-main source
  comparison, all five existing fixture hashes, and static diff inspection.
- Confirmed hosted RED at regression-only head
  `744202a76ce923f55e42bb50c2004f9272cfdd57`: automatic CI run
  [42944672947](https://github.com/reason-machines/openconductor/actions/runs/42944672947).
  Both frontend jobs ran `node --test "src/**/*.test.ts"` and reported
  2,273 tests: 2,271 passed, exactly two failed. The failures independently
  required `autoCorrect` and `autoCapitalize`, each reporting
  `undefined !== 'off'`. Both existing-attribute/query preservation controls
  passed. The build job stopped at this test gate; this was not a type error.
- Pending: automatic hosted GREEN against the two-property fix, keeping the
  regression byte-identical (SHA-256
  `68147843e513b102966664fae28f570b2c67a5527ef3d127e97d69b6c8abbb7a`).
- Not run: local dependency installation, local React tests, builds, browser,
  native macOS, or real-provider execution. No screenshot is available under
  the retained-source and hosted-test scope. These tests cannot establish
  whether an OS keyboard actually honors the requested correction settings.
