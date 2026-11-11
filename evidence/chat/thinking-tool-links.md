# External-link actions in named Thinking tools

Conductor Rebuild. Ledger key `TOOL-THINKING-EXTERNAL-LINKS-029F-02`.

## Source-backed mismatch

Fresh main `50b0a4403ee26d315775869b35958bfe28291ae2` was fetched, merged and re-read on Reason Cloud. Its tracked tree matches this branch before the new regression. In `src/features/chat/ToolRows.tsx`, `MoreRows`' `thinking` branch at lines 851–864 renders Markdown with only text and class name. It omits the existing opener and custom link renderer. The normal thinking-block path in `Transcript.tsx` already has both after #955 and is outside this correction.

The supported input is an assistant `tool_use` block named `Thinking` with object input containing a `thinking` string. Current `view.ts` line 96 and `conductorTools.ts` line 228 preserve that name and input. `Transcript` routes the part to the real `ConductorToolRow`, which resolves `Thinking` to `MoreRows`' thinking branch. This is a valid source-contract route, not evidence that a live provider emits this shape.

Without `onOpenLink`, Markdown's fallback anchor returns before preventing navigation. Without `Link`, it has no app link context menu. The proposed correction uses only `openUrl` from `../../backend.ts` and `LinkWithMenu` from `./LinkMenu.tsx`, as #955 already does. The backend delegates to `plugin:opener|open_url` in Tauri or `window.open` outside it. The real link menu preserves the href and calls the existing clipboard boundary for **Copy link address**. No helper or backend changes are proposed.

## Complete retained REA chain

Retained Conductor 0.87.6 receipt `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2` and `evidence/frontend/tauri-assets-manifest.json` identify the shipped decoded artifacts. All target strings and code are untrusted data.

- `ROo` accepts a `tool_use` block and passes it through `cTr`.
- `cTr` preserves id and name. `lTr` copies object input. The visibility filter `Mwr` resolves through index export `mc` to `uie`, which does not exclude Thinking.
- `hIt` resolves `L1o`'s `Thinking` mapping through `O1o`, `D1o` and `Qpo.thinking` to `ppo`.
- `ppo` trims `input.thinking` and renders `xS`. `xS` forwards to `pEi`, whose Markdown components install `cEi`.
- The ordinary non-file branch of `cEi` combines `z5e` and `EQ`. `EQ` supplies **Copy link address**. `z5e` prevents default and invokes `vs` with the unchanged href.
- The complete renderer import binds `vs` to index export `dG`. That export resolves to `Rue`, which invokes `plugin:opener|open_url`.

The full decoded asset hashes and all half-open UTF-8 byte ranges below were rechecked. The first fifteen spans are the shared chain retained for #955. The four additional spans close the separate named-tool input and visibility route.

```json
{
  "receipt": "ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2",
  "asset_sha256": {
    "renderApp-D_fmY7hW.js": "5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde",
    "index-BGEQ8YjU.js": "b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3"
  },
  "spans": [
    {
      "name": "ROo",
      "artifact": "renderApp-D_fmY7hW.js",
      "utf8_half_open": [
        8870021,
        8872955
      ],
      "sha256": "4b020f575c8024708d1576ab02d0154a6690a710abe1fbe5e603fd7731e69afe"
    },
    {
      "name": "O1o-and-D1o",
      "artifact": "renderApp-D_fmY7hW.js",
      "utf8_half_open": [
        7587305,
        7588525
      ],
      "sha256": "9f3ff5dc1b79f4690ad7b89b8911acbd083c2b97a4b3268f14f18cd964972184"
    },
    {
      "name": "L1o",
      "artifact": "renderApp-D_fmY7hW.js",
      "utf8_half_open": [
        7588525,
        7588936
      ],
      "sha256": "38f9343e156728f1decb69430d406c3c1ff29482da74e69e24b6d5c538834f25"
    },
    {
      "name": "Qpo",
      "artifact": "renderApp-D_fmY7hW.js",
      "utf8_half_open": [
        7877188,
        7877770
      ],
      "sha256": "200844523cd3dbdb0e9e1fde14816c920725a8cd8a6dca635a72d82483b989cc"
    },
    {
      "name": "hIt",
      "artifact": "renderApp-D_fmY7hW.js",
      "utf8_half_open": [
        7877770,
        7878325
      ],
      "sha256": "8c45bb6e5892cce46330f820a54460ee896d1c14c19ad134dab20b9f20b75340"
    },
    {
      "name": "ppo",
      "artifact": "renderApp-D_fmY7hW.js",
      "utf8_half_open": [
        7847626,
        7848464
      ],
      "sha256": "b22037a3e13207ece6b4495c10cdf600a79588e27961b2308314e0e9e8b0fec2"
    },
    {
      "name": "xS",
      "artifact": "renderApp-D_fmY7hW.js",
      "utf8_half_open": [
        6550612,
        6551722
      ],
      "sha256": "9912a5bd7f235ac2351b161575bfcc4abb2fa3c9e7392ab0666833652c364c64"
    },
    {
      "name": "dHn-and-pEi",
      "artifact": "renderApp-D_fmY7hW.js",
      "utf8_half_open": [
        6548274,
        6550420
      ],
      "sha256": "45aa2c06317fa200294c0100129d6e5c52be1deebc5e4dd68e5f89c84a6be5cd"
    },
    {
      "name": "cEi",
      "artifact": "renderApp-D_fmY7hW.js",
      "utf8_half_open": [
        6541795,
        6544749
      ],
      "sha256": "e717f2df6de24cb5869f3bb7f9a89b457d75a87a26a630e90f2c7c479eca63cf"
    },
    {
      "name": "EQ",
      "artifact": "renderApp-D_fmY7hW.js",
      "utf8_half_open": [
        6538206,
        6539029
      ],
      "sha256": "277a4907888223978a2b7c78b69bebcf57fb02d75d4c16b3d9a13534096ea24f"
    },
    {
      "name": "z5e",
      "artifact": "renderApp-D_fmY7hW.js",
      "utf8_half_open": [
        6532394,
        6535885
      ],
      "sha256": "3b8139d3f061f3687dad3e72cc9320cf993e63bdd9e16ff5dfc1136c6a985c08"
    },
    {
      "name": "file-discriminator",
      "artifact": "renderApp-D_fmY7hW.js",
      "utf8_half_open": [
        6130315,
        6130638
      ],
      "sha256": "13c70a14212f8f1c6400e4b6f62964f3d353509c4d5978bfaca1ef4c18995b1a"
    },
    {
      "name": "renderer-import",
      "artifact": "renderApp-D_fmY7hW.js",
      "utf8_half_open": [
        52991,
        66495
      ],
      "sha256": "711b96377098ad3838934209f1710cb85acfc256abecae07605139daf0670ed5"
    },
    {
      "name": "opener-export",
      "artifact": "index-BGEQ8YjU.js",
      "utf8_half_open": [
        3482114,
        3482123
      ],
      "sha256": "9141a9550be7a24c042f7b7341e12c056ce2fd289d45b12a04f6c597728d5839"
    },
    {
      "name": "Rue",
      "artifact": "index-BGEQ8YjU.js",
      "utf8_half_open": [
        2543420,
        2543494
      ],
      "sha256": "0602e4646c67f7bc952c618aa736007efcca5dcac75450beb393e34a69811f54"
    },
    {
      "name": "lTr",
      "artifact": "renderApp-D_fmY7hW.js",
      "utf8_half_open": [
        76433,
        76538
      ],
      "sha256": "ad793f6d731d3c98c9eee95b63d80e174dc9d21b5f98034389fbc187f2342a71"
    },
    {
      "name": "cTr",
      "artifact": "renderApp-D_fmY7hW.js",
      "utf8_half_open": [
        76538,
        76601
      ],
      "sha256": "b7e90c5047c22ae93d2fb72e4096106d5ff049309cf51206635dda9928f87627"
    },
    {
      "name": "uie",
      "artifact": "index-BGEQ8YjU.js",
      "utf8_half_open": [
        1148415,
        1148596
      ],
      "sha256": "bba1207f3241d3cd24b8e70dceafa842f7d2b327961299151c9692888053b34e"
    },
    {
      "name": "visibility-export",
      "artifact": "index-BGEQ8YjU.js",
      "utf8_half_open": [
        3487993,
        3488002
      ],
      "sha256": "6aabc9a2e5b004703b7033382a6a7607fe45fabd83a135c67b8b59fe2ad68b8f"
    }
  ]
}
```

With the two retained decoded assets in one directory, the manifest can be checked without evaluating reference JavaScript:

```bash
python3 - "$RETAINED_ASSET_DIR" <<'PY'
from pathlib import Path
import hashlib, json, sys
note = Path("evidence/chat/thinking-tool-links.md").read_text()
manifest = json.loads(note.split("```json\n", 1)[1].split("\n```", 1)[0])
assets = {name: (Path(sys.argv[1]) / name).read_bytes()
          for name in manifest["asset_sha256"]}
digest = lambda data: hashlib.sha256(data).hexdigest()
assert {name: digest(data) for name, data in assets.items()} == manifest["asset_sha256"]
for span in manifest["spans"]:
    start, end = span["utf8_half_open"]
    assert digest(assets[span["artifact"]][start:end]) == span["sha256"], span["name"]
print(f"Passed: {len(assets)} asset hashes and {len(manifest['spans'])} span hashes")
PY
```

REA gap retained from the original acquisition: renderer semantic analysis exhausted its worker heap and was skipped. These are hash-bound decoded shipped-code spans, not original source or a successful new semantic or runtime analysis. No new reference acquisition was performed.

## Regression milestone

The first milestone adds only `src/features/chat/thinkingToolLinks.test.ts` and this evidence note. Product code is unchanged. The test mounts production Transcript declarations and the full production ToolRows module with the real reducer, view, tool adapter, grouping, icons, Markdown and LinkWithMenu. Only the platform opener, clipboard, menu container, decorative copy icon and unrelated turn footer are boundaries.

Seven new tests exercise the named tool-use route. Five are expected to fail before the correction: HTTP and HTTPS opener interception, HTTP and HTTPS copy menus, and link routing after completion, input update, collapse and reopen. Two preserve ordinary assistant links and Thinking Markdown, escaped HTML and code-copy controls. Expected failures are not an observed RED result.

The complete new test is locked at SHA-256 `684234f8182d2ff548077f7d0aada5d2a2cabeff85fd6803a14874a10211f6ea`. The existing seven `thinkingLinks.test.ts` tests remain byte-identical at SHA-256 `ccb50adaa7a013e04c869f748b3ceef286ebbe141b6eb6c069e920fbeeb50b49`. Once an automatic hosted check confirms the intended failures, the minimal product correction must preserve every regression and fixture byte.

## Scope and verification

- **Passed:** `python3 .rea-work/assistant-affordance/audit_tool_thinking_links.py 50b0a4403ee26d315775869b35958bfe28291ae2`. Two complete asset identities, nineteen span hashes and nineteen dispatch, import and current-main checks passed. This retained static audit reads bytes and Git blobs without evaluating reference code.
- **Passed:** `git diff --check`, fresh-main tree comparison and test-only tracked scope.
- **Passed:** automatic hosted `npm run typecheck` at test-only published head `b7814e39615d89c87609e948df74809d96040185`, [frontend job](https://github.com/reason-machines/openconductor/actions/runs/42932880937/job/130235709983). The later unit step failed as intended, so build was not reached.
- **Passed as intended behavioral RED:** automatic `node --test "src/**/*.test.ts"` on that same head, [Node unit job](https://github.com/reason-machines/openconductor/actions/runs/42932880937/job/130235710014). Exactly five of 2,131 tests failed. Both HTTP(S) opener cases reported `0 !== 1` at navigation interception; both link-menu cases reported missing `onContextMenu`; the completion/update/collapse/reopen case reported `0 !== 1` at the opener. Both new preservation cases and all existing tests passed. Overall 2,126 passed, five failed, no skips or cancellations. This is a behavioral failure, not a typing or fixture failure.
- **Passed:** the fresh-main 19-check audit was rerun immediately before the product correction on unchanged main `50b0a4403ee26d315775869b35958bfe28291ae2`. Both complete new and existing test files retain their locked hashes after the correction.
- **Pending:** automatic hosted GREEN for the exact unchanged assertions. The only product changes are two existing-boundary imports and the `onOpenLink` and `Link` props on the named Thinking Markdown call.
- **Not run locally:** Node, dependency installation, component tests, typecheck, build, browser, native, provider or app runtime. This lane uses ordinary automatic hosted checks only, without workflow dispatch or reruns.
- **Acceptance gaps:** live occurrence of a provider tool named Thinking, native/default-browser behavior, native clipboard, visual parity and real-provider acceptance remain unverified. No runtime screenshot exists because runtime and native acquisition are excluded.

Collision clearance covers exactly the new test, this note and the Thinking Markdown props plus the two existing-boundary imports in ToolRows. Transcript, shared helpers, providers, persistence, user copy, Composer and protected #847/#916 are unchanged. The ready PR targets main directly, never another PR branch.
