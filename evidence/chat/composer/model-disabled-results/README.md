# Disabled model-result buttons

Conductor Rebuild qualifies one source correction. A model menu already open when its existing `disabled` prop becomes true must render disabled native result buttons. This does not change when callers set that prop.

## Retained reference source

The existing REA extraction of Conductor 0.87.6's renderer `renderApp-D_fmY7hW.js` is 11,600,457 bytes with SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. The packet producer reread and hashed the retained bytes and each following half-open UTF-8 span on 2026-11-11. This delivery independently verified the 7,854-byte attachment SHA-256 `2e7543bae1807257fe3176bbfbf44f7c43b885887cb1f4b8fe9a4d2f8b6b4bdb`, every manifest payload hash and length, and all four retained span text hashes and lengths with Python's standard library. The full renderer was not reacquired or independently rehashed in this delivery. No new installed-app acquisition or reference execution ran.

- `A7o`, bytes `[8599657, 8601817)`, SHA-256 `e94aaed3bf7beff63737f3574c578074d9b27d30067e6c303cd3358c3a1c7dce`. The function receives `isBusy:i`. Its filtered result map renders `ZU` with `disabled:i` and `onSelect:()=>k(F)`. The shared `k` callback checks `i!==!0` before applying the entry and clearing the query. This closes the direct filtered-result selection path without assuming how an upstream chat computes busy state.
- `ZU`, bytes `[8480640, 8481983)`, SHA-256 `b9e2bb2fc92ad89079dace9b71b45173ac1d87c967481387b27f2f3818676018`. This function forwards its `disabled` argument to `Pu` and its `onSelect` argument as `onClick`.
- `Pu` and the following partial declaration, bytes `[700703, 701652)`, SHA-256 `5e5bb87139311514fc37888edebac811b0e04529526cd6b96a183b15e601f3ae`. `Pu` computes effective disabled state from its argument and the menu store, then passes that state to `eXe`. Its own complete definition ends before the following `l0i` declaration. The recorded range deliberately includes that partial declaration and is not described as a complete single-function span.
- `eXe` and its following context declaration, bytes `[697334, 697975)`, SHA-256 `e1b9257a6f79b66c162106bd0639ae93f5be9f6329943943c34488a7b3fc06c1`. It passes disabled state into `O6` button behavior. This establishes prop forwarding, not independently observed browser suppression.

The direct `A7o` callback guard and the disabled result declaration are static shipped-source facts. The eventual focused element, actual pointer dispatch, native accessibility state, and upstream busy-state mapping are not established by this packet.

## Current main and correction

The packet qualified main `2b079f13e07b580d26191f7f1f50b4d21e62174e`. This delivery fetched and inspected fresh main `d8f6bdfd26370491295f38ffecd7090c71a2a6db`; its `ModelPicker.tsx` is unchanged from that qualified base. Its blob is `738efcb5971be2dbbe9dd4477947ed5b07d2fe09`, SHA-256 `4ce287b6a0c41879356dc28af4fd73998d255cb05f9863b02bed4eece35769e4`.

The component already disables its trigger and guards keyboard result selection with `!disabled`. However, its result rows are native `button` elements without a disabled prop. Their click callbacks can still apply a model and clear the query. The correction adds only `disabled={disabled}` to the result button. It relies on native disabled-button interaction semantics, rather than changing the click callback.

All existing result-click callback bytes and all existing fixtures stay unchanged. In particular:

- `modelPickerMouseSearch.test.ts`, SHA-256 `45d080e56eb16052b9406df4685ae2fea95fb7b17c056451787e809332484b68`.
- `modelPickerSearchKeyBoundary.test.ts`, SHA-256 `d229dbc77564ecbf90485152e66ec24967061e17d9346154d38699741e8b0a9f`.
- `modelPickerImeBoundary.test.ts`, SHA-256 `8ab198fd940c895ae2eb65db5ffd345e00ca7f49a6dac9d323277ad4514ac6d2`.

The older `BUSYMODEL135-04` packet remains parked. No upstream `isBusy` wiring, agent-running mapping, model persistence, effort, Fast, Settings, focus, menu lifetime, global shortcut, or frozen controller assertion changes belong here. Ledger receipt `ab09ccc3` reserves only this independent source candidate and regression.

## Regression and limits

`modelPickerDisabledResults.test.ts` transpiles and mounts the actual production component with React's test renderer. It observes native result-button props after opening, searching, and changing `disabled` on the same mounted component. Controls check that disabling does not itself select or clear a query, replacement results stay disabled, and reenabling preserves the existing filtered click callback behavior.

The fixture isolates tooltip rendering, icons, popup animation, document event registration, and global shortcut registration. It uses the actual model, loadout, shortcut-formatting, and component modules. It never fakes a disabled click dispatcher or calls a disabled button callback to claim browser suppression.

Focused command:

```bash
node --test src/features/chat/modelPickerDisabledResults.test.ts
```

Baseline source can be selected without altering assertions:

```bash
MODEL_PICKER_DISABLED_SOURCE_REF=2b079f13e07b580d26191f7f1f50b4d21e62174e node --test src/features/chat/modelPickerDisabledResults.test.ts
```

Ordinary automatic hosted CI runs `node --test "src/**/*.test.ts"` and the repository's typecheck, build, and platform checks. Baseline failure and corrected test results must be recorded from actual execution, not inferred from this source comparison.

## Hosted delivery observations

The first ready pull-request increment contains only this evidence and the supplied regression. Production remains unchanged so ordinary automatic hosted CI can establish the baseline. No baseline RED or corrected GREEN has been observed yet.

At packet creation, source hashes and the one-line diff were checked. Local Node tests, builds, browser, native macOS, packaged app, and provider execution were not run. No screenshot exists because no visible or native execution is admitted. Mounted host-prop coverage is not browser mouse suppression or native parity proof. The existing REA semantic-worker limitation remains documented in `evidence/rea-gaps.md`; this packet executes no reference code and introduces no new REA tool failure.
