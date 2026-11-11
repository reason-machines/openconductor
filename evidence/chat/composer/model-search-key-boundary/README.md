# Model search input key boundary

Owner: Conductor Rebuild. Ledger packet: SEARCHKEY135-05.

## Retained reference

The retained Conductor renderer `renderApp-D_fmY7hW.js` has SHA-256
`5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
This is existing REA extraction evidence, not a fresh reference execution.

Three complete spans establish the input-owned ordinary-key propagation branch:

- `hEe` and the `xd` alias: UTF-8 half-open bytes `[674926, 674995)`,
  SHA-256 `4283e46687b05b8b24d9071e15301030bd57ac48bb3f7b129375606bfeaaca70`.
  `hEe` returns its argument, so `xd` does not delegate or wrap the handler.
- `T7o`: bytes `[8599608, 8599657)`,
  SHA-256 `d18f6c113ee396a6bbdc08ac03d490d0967aa48323f83ab7c77d24d825fd0a29`.
  This set contains `ArrowUp`, `ArrowDown`, and `Tab`.
- Complete `A7o`: bytes `[8599657, 8601817)`,
  SHA-256 `e94aaed3bf7beff63737f3574c578074d9b27d30067e6c303cd3358c3a1c7dce`.
  Its search input owns `onKeyDown:I`. The direct `I` branch calls
  `stopPropagation` for keys outside `T7o`, apart from empty-query Escape.
  Ordinary editing keys do not call `preventDefault`.

The renderer, spans, and exact source bytes were revalidated locally before the
regression commit. Full retained spans remain in the Session's candidate receipt;
no reference code is executed or copied into the test.

## Current source and scope

Checked main: `efad8bf5817748aed5c1108f9266c1a7e4853926`.
Its `ModelPicker.tsx` is byte-identical to the pre-regression working source.
The current `onMenuKey` callback returns after handled navigation or Enter,
handles Escape, then lets ordinary search-input keys propagate.

The proposed correction is confined to that callback's tail. It contains ordinary
keys only when the event target is the search input, without preventing default
editing. Existing ArrowUp, ArrowDown, Tab, Enter, Escape, IME, and already-prevented
behavior is preserved. Result buttons and other targets retain their behavior.

The eight mouse and seven height fixtures from #951 and the seven scroll fixtures
from #957 are byte-identical to checked main. Their JSX, callbacks, ref shape,
query-height lifecycle, and assertions are not edited. No provider, Effort, Fast,
focus, geometry, CSS, or menu rendering changes are in scope. BUSYMODEL135-04 is
parked and is not part of this work.

## Regression

`src/features/chat/modelPickerSearchKeyBoundary.test.ts` extracts the actual
current `onMenuKey` body. It removes only the TypeScript `querySelector` generic
before compiling that body. Explicit event-state objects expose propagation,
default prevention, query changes, selection, menu closure, and focus requests.
They do not simulate a mounted React tree or browser event dispatch.

There are 14 tests: six ordinary-key regressions and eight preservation controls.
The ordinary keys are `a`, Backspace, Delete, Space, ArrowLeft, and ArrowRight,
each with an empty and a nonempty query. Controls exercise non-search targets,
Tab, vertical arrows, Enter, Escape, composition, and already-prevented events.

Hosted regression command:

```bash
node --test "src/**/*.test.ts"
```

The optional `MODEL_PICKER_SEARCH_KEY_REGRESSION_REF` reads the product source
from a named git revision, so the same assertions can exercise the baseline.

- **Passed:** retained renderer and span hash validation, fresh-main comparison,
  locked fixture equality, and `git diff --check`.
- **Not run yet:** automatic hosted RED. The production callback is unchanged;
  the minimal correction waits for an executed failure for the intended reason.
- **Not run:** local Node, dependency installation, local tests or builds,
  mounted React, browser, native, real-provider, or reference execution. No new
  acquisition, manual workflow dispatch, or runtime admission was made. No
  screenshot is available under those restrictions. Source callback tests do
  not establish native or visual parity.
