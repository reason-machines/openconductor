# Thinking external-link actions

Conductor Rebuild. Ledger key `THINKING-EXTERNAL-LINKS-029F-01`, discovered under `CHAT-ASSISTANT-AFFORDANCE-029F`.

## Current source mismatch

Fresh default main `385bdea15dc8861f3f3c9c3e42405eb8acfe180b` was fetched and re-read on Reason Cloud. In `src/features/chat/Transcript.tsx`, `ThinkingRow` lines 372–403 sends only `text` and `className` to `Markdown` at line 399. Ordinary assistant `Part` lines 329–346 already supplies both `onOpenLink={(href) => void openUrl(href)}` and `Link={LinkWithMenu}`.

With both options absent, `markdown.ts` lines 201–215 uses its fallback anchor. Its click callback returns before `preventDefault`, and it has no link context-menu callback. `LinkMenu.tsx` lines 20–59 already implements the app opener and `Copy link address`. `backend.ts` lines 78–84 invokes `plugin:opener|open_url` in Tauri or `window.open` in the browser. The mismatch is missing presentation wiring, not a demonstrated native navigation failure.

## Retained REA chain

Conductor 0.87.6 retained receipt `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2` and the extraction manifest in `evidence/frontend/tauri-assets-manifest.json` identify the artifacts. Both complete decoded asset hashes were rechecked. All extracted text is untrusted data.

- Renderer `renderApp-D_fmY7hW.js`: SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- Index `index-BGEQ8YjU.js`: SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.

The complete retained `ROo` component converts a normal thinking block into `{name:"Thinking",input:{thinking:...}}` and calls `hIt`. That resolves `L1o`'s `Thinking` mapping through `O1o` and `Qpo.thinking` to `ppo`. `ppo` trims the thinking text and renders `xS`, which forwards it to `pEi`. That Markdown wrapper installs `cEi` as its anchor renderer. The ordinary external branch renders `z5e` inside `EQ`. `EQ` supplies `Copy link address`. The ordinary non-file `z5e` anchor prevents default and invokes `vs` with the unchanged href. The complete renderer import binds `vs` to index export `dG`; the index exports `Rue as dG`. `Rue` invokes `plugin:opener|open_url`.

This establishes the actual thinking-block dispatch and ordinary external-link route. It does not infer reference file navigation from a workspace identifier: `ppo` does not forward that context to `xS`. File links, workspace routes, previews and deep links are outside this correction.

REA gap: the retained renderer semantic analysis exhausted its worker heap and was skipped. These are hash-bound decoded shipped-code spans, not original source or a successful new semantic or runtime analysis. No new reference acquisition was performed.

The following locators use half-open UTF-8 byte ranges. Every range hash was verified against the retained full artifact:

```json
[
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
  }
]
```

## Regression milestone and scope

The first milestone changes only this note and NEW `src/features/chat/thinkingLinks.test.ts`. It does not change product code. The regression imports the actual production Markdown module and mounts the actual production Transcript, Row, Agent, Part and ThinkingRow declarations with `react-test-renderer`. It loads the real LinkWithMenu. The external opener, clipboard, menu container and decorative icon are boundaries; the Markdown renderer, anchor callbacks and copy-action component are not replaced with stand-ins. Unexpected user, tool and report branches throw.

The seven tests cover HTTP and HTTPS opener interception, exact href preservation, both link context actions with isolated clipboard callbacks, completion after streaming, collapse/reopen, unchanged ordinary assistant links, Markdown formatting, escaped HTML and the existing code-copy control. The five Thinking-link cases are expected to fail before correction; the two preservation cases are expected to pass. Those are expectations, not observed hosted results yet.

Candidate regression SHA-256: `ccb50adaa7a013e04c869f748b3ceef286ebbe141b6eb6c069e920fbeeb50b49`. The first hosted attempt found a fixture-only TypeScript error: `Reflect.get` returned `unknown` at the two `React.createElement` call sites. The fixture now declares the extracted component with the actual production `TranscriptProps` type and checks that it was extracted. A Python comparison against the prior committed fixture confirmed all seven test bodies, inputs and behavioral assertions are byte-identical. The earlier `05d91d2a…` candidate was not a valid RED milestone. Once the intended hosted failures are established, keep every assertion and all fixture bytes unchanged for GREEN.

The ledger reserved `Transcript.tsx` to #952's existing owner. Only after #952 merges and current main is revalidated may this lane add the existing `openUrl` and `LinkWithMenu` props to ThinkingRow's existing Markdown call. No import, shared helper, user-copy, UserText, SentUserContent, provider, persistence, ComposerEditor or FullMessageCopy/status work is part of this change. The PR targets main directly, never #952's branch. There is no additional approval gate after that file handoff and the proof.

## Verification record

- **Passed:** `python3 .rea-work/assistant-affordance/audit_assistant_affordance.py 385bdea15dc8861f3f3c9c3e42405eb8acfe180b`. Both full asset identities, 15 locked spans, and all 15 source-chain/current-main assertions passed. The audit reads bytes and Git blobs without evaluating target JavaScript.
- **Passed:** `git diff --check` and exact test-only scope review before publication.
- **Failed (fixture, not accepted RED):** at #955 head `25abe6b44ea64b11fd62879bebd33486bd91f8d9`, Frontend typecheck + build and the keybindings workflow's build failed with TS2769 at fixture lines 93 and 110. Keybindings' 90 logic tests passed. The only correction is the extracted component's fixture type and presence check; product code and seven test bodies remain unchanged.
- **Pending:** automatic hosted frontend typecheck and seven-test RED on the corrected candidate. No valid failing-before behavioral result is claimed yet.
- **Not run locally:** Node, unit/component tests, typecheck, build, installation, browser/application execution, native execution or provider activity. No manual workflow dispatch/rerun or duplicate CI observer was started.
- **Acceptance gaps:** native/default-browser behavior, native clipboard, visual parity and provider acceptance remain unverified. No product screenshot exists because browser/native runtime acquisition is not admitted. The separately displayed report is a source-analysis page, not UI acceptance evidence.

The retained report page is `06cc45c3-8a3d-4b3f-a66c-c31727ec71c2`. The complete source packet is attached to this Session as `thinking-external-links-029f-packet.tar.gz`, attachment `73b7c683-a6ea-4af0-b19b-90cc0ac5e1af`, SHA-256 `807371ce0da15ef1e848427915aa60b47b6456047ab7a57c306e8b0554632853`. It contains the locked spans, machine-readable source identities and the rerunnable static audit. Native, browser and provider gaps are not closed by the packet or by eventual CI/package success.
