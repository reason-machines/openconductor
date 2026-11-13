# Filtered model clicks preserve the menu

Conductor Rebuild, 2026-11-10. Baseline main is `cc4b1b832f3722dddaea4452d85fc82f41399e0a`; ModelPicker blob is `24bfbe7177f1719430f2f721f4bb5b1a36890d2c`.

## Reference source

The retained REA-extracted Conductor 0.87.6 renderer has SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. [Earlier model-menu evidence](../model-keyboard/README.md#reference-evidence) records the historical installed-app identity and decoded-frontend relationship. This pass rechecked retained artifact bytes, not the installed app. No reference JavaScript was executed.

The filtered-result callback chain is:

- `L7o` builds searchable model entries whose selection callbacks pass `focusComposer: false`.
- `A7o` renders those filtered entries through `ZU` with `closeOnClick: false`. Its shared selection callback applies the selected entry and clears the query, unless busy.
- `ZU` forwards that close policy through `Pu` and `eXe` to `r0i`. The item's close event is conditional on that policy.
- `RNi` routes the built-in selection through `Ue`, which does not set the menu's open state. `zHt` forwards that callback unchanged. Its separate favorite-selection wrapper closes the menu.
- Retained existing-chat and new-composer callbacks update configuration without requesting composer focus on this path. The same-model successful-path persistence and identity spans were revalidated. A locked chat choosing a different agent/model can navigate to a new chat; this correction does not change that behavior or claim survival across navigation.

These byte reads support a filtered-click query reset without an explicit menu dismissal. They do not establish the eventual focused element, browser event behavior, or native menu survival. The selected-current-result case isolates the local difference without a model change.

The old scratch `.rea-work/dist` copy is absent. The hash-matching `.rea-work/reference-retained` copy was used instead; no acquisition or restoration ran. No new REA invocation or tool failure occurred. Existing [REA limitations](../../rea-gaps.md) still apply.

## Failure and correction

The model-result mouse callback applied an unselected choice and then always closed the menu. Filtered keyboard selection already clears the query and retains the menu.

The correction changes only that mouse callback: a nonempty trimmed query clears search; an empty or whitespace-only query keeps the existing dismissal. The selected/current apply guard remains unchanged. No focus call was added. Keyboard, IME, effort, Fast, editor, agent, trigger, and loadout logic are untouched.

## Executable check

The dependency-free regression evaluates the exact model-result click callback extracted from ModelPicker. It observes final query/open state and the model delivered to `onChange`. It does not mount React, dispatch a browser click, or test lifecycle effects.

Before the fix, the unchanged eight-case regression had four failures: filtered clicks on both the current model and another model closed the menu and retained the nonempty query. Four unfiltered controls passed.

After the minimal fix, the same eight cases passed. The combined nearby run passed 22 tests:

```bash
node --experimental-strip-types --test \
  src/features/chat/modelPickerMouseSearch.test.ts \
  src/features/chat/modelPickerSearch.test.ts \
  src/features/chat/composerModels.test.ts \
  src/features/chat/loadoutChoices.test.ts
```

The baseline failure can be reproduced without changing the working tree:

```bash
MODEL_PICKER_REGRESSION_REF=cc4b1b832f3722dddaea4452d85fc82f41399e0a \
  node --experimental-strip-types --test src/features/chat/modelPickerMouseSearch.test.ts
```

`git diff --check` passed. No dependencies were installed. Local build, browser, provider, app, guest, native, and packaged-app behavior checks were not run under the existing runtime stop. There is no new screenshot or visual/native parity claim. Ordinary automatic hosted CI is separate.

## Ownership

Ledger receipt `85fa37d5` reconciled this exact three-path increment. Session 466's receipt `7c74b680` confirms the result-click hunk does not overlap its retained #856 effort correction or future trigger/Fast work. This change does not take over either task.

## Hash-bound retained packet

Ranges are half-open UTF-8 byte offsets. Every recorded fragment was compared with its retained artifact and SHA-256 before the correction. All 19 prior downstream spans matched both their saved literal text and hash. The renderer/index bytes were read only, with no extraction to disk or execution.

```json
{
  "renderer": {
    "file": "renderApp-D_fmY7hW.js",
    "bytes": 11600457,
    "sha256": "5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde"
  },
  "index": {
    "file": "index-BGEQ8YjU.js",
    "sha256": "b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3"
  },
  "mouse_callback_chain": [
    {
      "symbol": "A7o",
      "utf8_half_open": [
        8599657,
        8601817
      ],
      "sha256": "e94aaed3bf7beff63737f3574c578074d9b27d30067e6c303cd3358c3a1c7dce"
    },
    {
      "symbol": "Pu",
      "utf8_half_open": [
        700703,
        701652
      ],
      "sha256": "5e5bb87139311514fc37888edebac811b0e04529526cd6b96a183b15e601f3ae"
    },
    {
      "symbol": "eXe",
      "utf8_half_open": [
        697334,
        697975
      ],
      "sha256": "e1b9257a6f79b66c162106bd0639ae93f5be9f6329943943c34488a7b3fc06c1"
    },
    {
      "symbol": "r0i",
      "utf8_half_open": [
        696510,
        697334
      ],
      "sha256": "6d70b3eb855bde025ac197e7129d91f5d939368650340e29c5e6a0979ebdd15c"
    },
    {
      "symbol": "L7o",
      "utf8_half_open": [
        8603880,
        8613629
      ],
      "sha256": "28ce62757f3e58a1bb77386f90b76c3c6d98d15ba0ef93bc8313f82b781de2dd"
    },
    {
      "symbol": "RNi",
      "utf8_half_open": [
        8617661,
        8623873
      ],
      "sha256": "d3d66fcdcef43ef2ae30e74b0fb35553aa8e5e8c59850535353696f174880eb7"
    },
    {
      "symbol": "ZU",
      "utf8_half_open": [
        8480640,
        8481983
      ],
      "sha256": "b9e2bb2fc92ad89079dace9b71b45173ac1d87c967481387b27f2f3818676018"
    },
    {
      "symbol": "zHt",
      "utf8_half_open": [
        8614751,
        8617661
      ],
      "sha256": "1095aba8788b2c2604efab1db1e81d32b15c2fce15052ccf49b9d6b95f8894d3"
    }
  ],
  "downstream": [
    {
      "label": "Model config persistence and cache update",
      "artifact": "renderer",
      "utf8_half_open": [
        7574697,
        7575169
      ],
      "sha256": "bd33d99015444cdbe6e846a7f1b57385a242b4236c851b057f7ab48d4c7037d1"
    },
    {
      "label": "Locked Claude effort warning",
      "artifact": "renderer",
      "utf8_half_open": [
        7937748,
        7937942
      ],
      "sha256": "615c06d7f4133505f9a76fae1fb7be67cfbe459e851a5c0551619818918f4ad2"
    },
    {
      "label": "Existing-chat application hook",
      "artifact": "renderer",
      "utf8_half_open": [
        7938107,
        7941360
      ],
      "sha256": "85eb5939de7690fb0bae21f88781fe668730a35d4460a3e3e7e3220b60e43c3e"
    },
    {
      "label": "Picker local state and close branches",
      "artifact": "renderer",
      "utf8_half_open": [
        8617661,
        8623873
      ],
      "sha256": "d3d66fcdcef43ef2ae30e74b0fb35553aa8e5e8c59850535353696f174880eb7"
    },
    {
      "label": "New-composer application hook",
      "artifact": "renderer",
      "utf8_half_open": [
        9761898,
        9763269
      ],
      "sha256": "aa285b79b9d4559889bd34e952549f5c8d685866a69b94fb4a5288e22565308f"
    },
    {
      "label": "Launch-control merge setter",
      "artifact": "renderer",
      "utf8_half_open": [
        9774541,
        9774649
      ],
      "sha256": "3aa79ebe3c3000c0c04fcda29d789e1a949a2c1a1aba4b4a669cb542932a667a"
    },
    {
      "label": "Controlled launch store setter",
      "artifact": "renderer",
      "utf8_half_open": [
        7342071,
        7342115
      ],
      "sha256": "37a7617a36cb220ed7bd6fbad2c0609ded5ce505fb5618a45701fb02a34a83c6"
    },
    {
      "label": "Controlled new-composer caller",
      "artifact": "renderer",
      "utf8_half_open": [
        11047752,
        11048349
      ],
      "sha256": "79894a68f9d15b3804d467751c5304002ed472bc0891889fdb0db76a56b2304d"
    },
    {
      "label": "Uncontrolled draft-workspace caller",
      "artifact": "renderer",
      "utf8_half_open": [
        9800709,
        9801099
      ],
      "sha256": "ec1d9307c63132b7044eeeafbe27183f1647c6d479b3792b33f3f75998815cd3"
    },
    {
      "label": "Chat composer key uses selected session",
      "artifact": "renderer",
      "utf8_half_open": [
        8754426,
        8754442
      ],
      "sha256": "ece015f163f97df6f64cf618a96af6a1b8350bafe6961fd007b1aa45ec4189bb"
    },
    {
      "label": "Chat composer instance receives that key",
      "artifact": "renderer",
      "utf8_half_open": [
        8759252,
        8759715
      ],
      "sha256": "4e852e9cbb512be3983acdd0bd6e24f94a4a9bcf96da2707c1758436c1a8495f"
    },
    {
      "label": "Selected-session subscription cache key",
      "artifact": "index",
      "utf8_half_open": [
        1538273,
        1538467
      ],
      "sha256": "fc191e4b461d4825e15c48807a36b254230bf832ad7fe8b2882af7fd18188cb9"
    },
    {
      "label": "Session configuration mutation wrapper",
      "artifact": "index",
      "utf8_half_open": [
        1517245,
        1517479
      ],
      "sha256": "24dadefb7fd46239d5ebd16207183aef691a953ca141d8084841ab1a9e655490"
    },
    {
      "label": "Configuration SQL updates the existing row",
      "artifact": "index",
      "utf8_half_open": [
        1112268,
        1113001
      ],
      "sha256": "19d8e237d3125765041885fe78cc303d6b6d73800e19eb6554b2033bf64d7b5a"
    },
    {
      "label": "Serialized operation refreshes same session",
      "artifact": "index",
      "utf8_half_open": [
        1533814,
        1534090
      ],
      "sha256": "4e4a3f749057b6a46b95ebdca4fb976d0ab149aa88781b3f583371cb6786d20e"
    },
    {
      "label": "Refreshed session merged under same ID",
      "artifact": "index",
      "utf8_half_open": [
        1129087,
        1129649
      ],
      "sha256": "ca3cdd5b453f0d8cab0974620175b790d62446d8ee29d5c2aaf29cad3b8e6a1d"
    },
    {
      "label": "Local host sentinel identity",
      "artifact": "index",
      "utf8_half_open": [
        2439,
        2625
      ],
      "sha256": "4f1f52fd1c480db92b04366e7306b935f4c7606407f397e86e6c8491333f7414"
    },
    {
      "label": "Post-update synchronization is local-no-op",
      "artifact": "index",
      "utf8_half_open": [
        3146659,
        3147263
      ],
      "sha256": "130a738205075f7f2e1f13c0943cfdf92618b54abb1921f6cc977c8c1cbc671e"
    },
    {
      "label": "Configuration mutation continuation",
      "artifact": "index",
      "utf8_half_open": [
        3156568,
        3156790
      ],
      "sha256": "ab397598574e9e9032d7e229faffaca3be3abaa227bd9752b9807a3d83de0017"
    }
  ]
}
```
