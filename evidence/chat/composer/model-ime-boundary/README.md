# Model picker composition-key boundary

Owner: Conductor Rebuild. Ledger packet: IME229, sole135.

## Retained reference evidence

The retained REA extraction of Conductor's renderer
`renderApp-D_fmY7hW.js` has SHA-256
`5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
This is static evidence from the existing extraction, not a new acquisition or
reference execution. These UTF-8 half-open spans were revalidated before edits:

- Composition code literal `$$e=229;`, bytes `[8415731, 8415739)`, SHA-256
  `daa7b1b31b64d1c5a942f120deff423e81c42e80fe5662bc756158009e3ec1f4`.
- Complete `oRt` predicate, bytes `[8415739, 8415890)`, SHA-256
  `0cf63f73563cef134d6089a084469a5d52f916f9d502afade3b4752e2c20bb4b`.
  It recognizes a true synthetic or native `isComposing`, or a synthetic or
  native `keyCode` or `which` equal to 229.
- Complete `A7o` producer, bytes `[8599657, 8601817)`, SHA-256
  `e94aaed3bf7beff63737f3574c578074d9b27d30067e6c303cd3358c3a1c7dce`.
  Its search input owns `onKeyDown:I`. The handler calls `oRt` before model
  commands and returns when that predicate recognizes composition.
- Complete identity wrapper and `xd` alias, bytes `[674926, 674995)`, SHA-256
  `4283e46687b05b8b24d9071e15301030bd57ac48bb3f7b129375606bfeaaca70`.
  `xd` does not delegate the handler to an uninspected helper.

The reference also stops propagation on the composition branch. This change
preserves OpenConductor's existing early-return propagation policy, as required
by the unchanged #965 composition controls. It only broadens recognition of the
reference's composition signals. It does not claim full propagation parity.

## Source and scope

Fresh main inspected before the regression:
`166139398538f0e58eabd3870facbb1702ea665b`.
Its `ModelPicker.tsx` is byte-identical to the #965 merged picker and checks only
`nativeEvent.isComposing` before menu commands. With composition flags false,
Enter or Escape carrying code 229 can reach selection, query-clear, or menu-close
branches. A top-level true composition flag is also unrecognized.

The leased product scope is only the first guard in `onMenuKey`. No shared
helper, provider, BUSYMODEL, Effort, Fast, focus, geometry, JSX, composer editor,
or global key-dispatch change is authorized by this packet.

All existing fixtures are locked byte-for-byte:

- #951 mouse search: `45d080e56eb16052b9406df4685ae2fea95fb7b17c056451787e809332484b68`.
- #951 search height: `da4b7c76d081c1eb77d151c5d8f66e1428817f8d1ae6ab2d768bf7807f461c13`.
- #957 search scroll: `ed952d62f3db19489f856f97dea589c7b37b356f6d5f7179a79e0a97fc1a681b`.
- #965 all 14 propagation cases: `d229dbc77564ecbf90485152e66ec24967061e17d9346154d38699741e8b0a9f`.

## Regression and verification

`src/features/chat/modelPickerImeBoundary.test.ts` extracts the actual current
`onMenuKey` callback, removes only its `querySelector` TypeScript generic, and
runs that body with explicit event and callback state. It does not copy the
composition predicate into a toy implementation.

Its 18 tests cover all four 229-only signal positions with Enter and Escape,
each composition flag independently, normal selection and Escape behavior,
already-prevented events, adjacent numeric codes, and composing versus ordinary
navigation. Selection, query, menu state, focus, propagation, and default
prevention are observed directly. Existing #965 controls remain unchanged.

Automatic hosted command:

```bash
node --test "src/**/*.test.ts"
```

`MODEL_PICKER_IME_REGRESSION_REF=<git-ref>` optionally selects the product source
from another revision without changing the assertions.

- **Passed:** retained renderer and complete span hashes, fresh-main picker
  equality, all four locked fixture hashes, and `git diff --check`.
- **Executed RED:** automatic hosted `node --test "src/**/*.test.ts"` on
  regression-only head `bfbe1fed5af905127114aa97e97b08ac6106683a` ran 2,194
  tests. Exactly 11 intended composition cases failed and 2,183 tests passed,
  including the seven new preservation controls. All eight 229-only Enter and
  Escape cases, both synthetic-flag cases, and composing navigation failed.
  For example, empty-query 229 Escape closed the menu and prevented default
  instead of leaving it untouched. [Hosted RED log](https://github.com/reason-machines/openconductor/actions/runs/42937756727/job/130251933068).
  Assertions stop at the first failing query in each case; RED does not claim
  that both query variants executed. Product source was revalidated against
  unchanged fresh main `166139398538f0e58eabd3870facbb1702ea665b` before the fix.
- **Pending GREEN:** automatic hosted rerun on the first-guard-only correction.
  The new 18-case test SHA-256 remains
  `8ab198fd940c895ae2eb65db5ffd345e00ca7f49a6dac9d323277ad4514ac6d2`.
  All #951, #957, and #965 fixtures remain byte-identical. The correction uses
  the reference's six composition signals without a shared helper or type cast.
- **Not run:** local Node, dependency installation, local tests or builds,
  mounted React, browser dispatch, native macOS, real-provider, or reference
  execution. No screenshot is available under the retained-source-only scope.
  Callback tests and packaging do not establish mounted or native acceptance.
