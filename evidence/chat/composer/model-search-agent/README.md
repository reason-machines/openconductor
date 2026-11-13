# Search models by agent name

Conductor Rebuild, 2026-11-10. Checked main `3f6435a2bacf5c6fe0507b59eee2d898575947e0`, ModelPicker blob `e47432750852581dd0f0d995e88c94142d4df9fb`, after #929 merged. This is a separate three-path unit, not stacked on that PR.

## Reference and bounded mismatch

The retained REA-extracted Conductor 0.87.6 renderer is `renderApp-D_fmY7hW.js`, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`; its index is `index-BGEQ8YjU.js`, SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`. The [preceding mouse-selection evidence](../model-search-mouse/README.md) links the historical installed-app identity. This pass revalidated both retained artifact hashes and all 13 literal byte/hash spans below. No acquisition, new analyzer invocation, or reference-JavaScript execution ran.

`A7o` passes searchable entries to `lj` using `R7o`. `R7o` builds search text from the model label, agent label and agent-qualified ID. `L7o` constructs built-in results with those fields. Renderer imports `_A` and `Dk` resolve through index exports `kS` and `b9` to `Rqt` (including `Claude Code` and `Codex`) and `_u` interop. The retained `lj` wrapper, complete local fuzzysort initialization/helpers and wrapper binding close the local string-search dependency chain. Exact agent-name substrings are searchable. This note does not assert a complete fuzzy-ranking match.

On current OpenConductor main, `items` searched only the displayed model name and raw model ID. Thus `claude` missed `opus-5-1m` and `codex` missed `gpt-5.6-sol`. The fix adds the entry's existing agent display label to substring matching, preserving the original name/raw-ID checks and order. Identity precedence is `itemAgent?.(f) ?? f.agent ?? agentForModel(f.model)`; Reason entries use the existing product's `Reason` name, not a new Conductor-agent claim. `itemAgent` is added to the memo dependencies. Agent selection, rows, click behavior, keyboard, IME, focus, effort, Fast and editor code are unchanged.

## RED then unchanged GREEN

The new dependency-free regression strips types from and evaluates the actual `items` callback extracted from ModelPicker, with real pure ordering/catalog/display helpers. It does not execute reference code, mount React, simulate a browser event, or observe native behavior.

```bash
node --experimental-strip-types --test src/features/chat/modelPickerAgentSearch.test.ts
```

Before the fix the original six cases had **2 failures, 4 passes**: `claude` and `codex` each returned `[]` instead of their expected catalog entry. After the fix those same six cases passed unchanged. Four additional controls then passed for full/case-normalized labels, no match, callback/explicit-agent precedence and memo invalidation, input order and unknown IDs. The final new suite passed **10/10**.

```bash
node --experimental-strip-types --test \
  src/features/chat/modelPickerAgentSearch.test.ts \
  src/features/chat/modelPickerMouseSearch.test.ts \
  src/features/chat/modelPickerSearch.test.ts \
  src/features/chat/composerModels.test.ts \
  src/features/chat/loadoutChoices.test.ts
```

Combined result: **32 passed, 0 failed**. `node --check src/features/chat/modelPickerAgentSearch.test.ts` and `git diff --check` passed. No installs, build, browser, app, provider, guest or native runtime ran. Browser/native/package behavior and visual parity are **not run** under the existing stop, so no screenshot is claimed. Automatic hosted workflows remain the exact-head delivery gate.

## Ownership and REA limits

Ledger receipt `de2ac7c5` reserves this exact successor after #929's source delivery. The three paths are ModelPicker's imports/items/search dependencies only, this new test, and this note. Session 466 retains #856's separate effort hunk. Existing [REA gaps](../../rea-gaps.md) still apply; no new REA tool failure occurred. Reference callbacks and local source checks are not installed-app acceptance.

## Retained byte/hash packet

Ranges are half-open UTF-8 byte offsets. Full local snippets are retained in the existing inert packet; metadata below pins every compared span.

```json
{
  "base_sha": "3f6435a2bacf5c6fe0507b59eee2d898575947e0",
  "artifacts": {
    "renderer": "5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde",
    "index": "b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3"
  },
  "method": "retained artifact byte reads only; no reference JavaScript execution",
  "receipts": [
    {
      "label": "A7o query input and searchableModels forwarding",
      "artifact": "renderer",
      "utf8_half_open": [
        8599657,
        8601817
      ],
      "sha256": "e94aaed3bf7beff63737f3574c578074d9b27d30067e6c303cd3358c3a1c7dce"
    },
    {
      "label": "R7o model/agent/id search text",
      "artifact": "renderer",
      "utf8_half_open": [
        8601858,
        8601917
      ],
      "sha256": "7acb23448ac4ff25dad653d670d1bdc56ebad4eaf5db4daca02ffd472f8200db"
    },
    {
      "label": "agent ids used to construct searchable result ids",
      "artifact": "renderer",
      "utf8_half_open": [
        8601917,
        8601977
      ],
      "sha256": "0139c0c0c41927b0333dc3670192e3a08e6d001f319523b8059a400f40bf3751"
    },
    {
      "label": "L7o result entry construction",
      "artifact": "renderer",
      "utf8_half_open": [
        8603880,
        8613595
      ],
      "sha256": "763d5d0e217d3fd22a7decbb99b3551df62c8356626dbb8a07d87585386c6f3c"
    },
    {
      "label": "lj result search adapter",
      "artifact": "renderer",
      "utf8_half_open": [
        2839201,
        2839529
      ],
      "sha256": "cc3d7c4102af2bb5c8d557b82956e7c8231561f5417784d41807293d2296adb3"
    },
    {
      "label": "fuzzysort full initialization and local helpers",
      "artifact": "renderer",
      "utf8_half_open": [
        2829988,
        2838976
      ],
      "sha256": "b37454e1205cc8a0df1dd3c5b6e8bf04e2f0491397bec24e933d206844f79a35"
    },
    {
      "label": "fuzzysort wrapper binding",
      "artifact": "renderer",
      "utf8_half_open": [
        2838976,
        2839015
      ],
      "sha256": "2a7bc952329a33e1b029d4212a33ff45cfbba76d2c27a4cc718b027d25ec6fda"
    },
    {
      "label": "Dk default-export interop",
      "artifact": "index",
      "utf8_half_open": [
        117763,
        117864
      ],
      "sha256": "0234768a9a5db321fa7ad872061578be6f51a4ea0fa4bcd9043f1003b2518ca1"
    },
    {
      "label": "agent display labels",
      "artifact": "index",
      "utf8_half_open": [
        301310,
        301401
      ],
      "sha256": "8d02c2f3cd6c882e1a915bad01bb299391e85ca80955482bae2d02571e65f616"
    },
    {
      "label": "index export b9",
      "artifact": "index",
      "utf8_half_open": [
        3480797,
        3480805
      ],
      "sha256": "b0737961c1f96b8edf9a5bd8f27a664c26a024598c8f66f023157c8747b6778b"
    },
    {
      "label": "index export kS",
      "artifact": "index",
      "utf8_half_open": [
        3486619,
        3486628
      ],
      "sha256": "aa804f47684f7396e98fcecf81f558f65d3a2ed5295b796d03e90354bc94072b"
    },
    {
      "label": "renderer import Dk",
      "artifact": "renderer",
      "utf8_half_open": [
        54167,
        54175
      ],
      "sha256": "5de213a555931acf7faf016669a7ce5c299b20f8613940b24b8290bc8248c0f4"
    },
    {
      "label": "renderer import _A",
      "artifact": "renderer",
      "utf8_half_open": [
        60229,
        60237
      ],
      "sha256": "e8e711e2ae95f0b04f44d8b5e213575231af664bd3c77361208a98af4bac8e59"
    }
  ],
  "model_picker_blob": "e47432750852581dd0f0d995e88c94142d4df9fb"
}
```
