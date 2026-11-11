# Fenced Nix highlighting

Conductor Rebuild adds the locked Nix grammar to the existing common-language registry. Ordinary `nix` fences and the grammar's `nixos` alias now render highlighted tokens. Other grammars, fallback behavior, the 100,000-character limit, copy payload, and code-block layout are unchanged.

## Retained reference source

This is a retained-source comparison, not a native or visual observation. The original REA semantic renderer analysis exhausted its heap. The retained shipped-byte packet records REA receipt `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`.

The source owner relayed `syntax-eligibility-source-closure.tar.gz`, 934,215 bytes, SHA-256 `d14a2c5cf3412e1311f91cae5d70062da65ffffa83294c75643229f2e08ca3a8`. This Session verified that archive identity and all 19 embedded literal lengths, UTF-8 half-open ranges, and SHA-256 digests. It did not receive or independently rehash the two full reference assets. Their whole-file identities below are retained producer evidence, not a new full-file verification:

- `renderApp-D_fmY7hW.js`, 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- `index-BGEQ8YjU.js`, 3,493,297 bytes, SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.

The packet closes the ordinary assistant-text route:

1. `ROo` sends assistant text through `xS` to `pEi` and `dHn`. `pEi` includes `VXs`, whose `code` component is `$Xs`.
2. `$Xs` sends ordinary multiline code to `WJe`. `V$t` extracts the fence language. `WJe` removes exactly one final newline and passes the value to `i1e`.
3. `i1e` refuses missing languages, values longer than `_Fs`, and names absent from `EUn`. Otherwise it calls `EUn.highlight`.
4. `const EUn=gFs(dFs),_Fs=1e5;` binds that consumer to the full registry. `dFs` contains `nix:PLs`; `PLs` includes `aliases:["nixos"]`.
5. `gFs` constructs `pFs.newInstance()` and registers the supplied map. `registered` queries that instance's language registry.
6. The renderer imports `b9 as Dk` from the retained index. The index exports `_u as b9`; `_u` returns a module default when present, otherwise the module. `fFs` returns the highlighter with `zt.default=zt`, so `const pFs=Dk(hFs)` refers to that same highlighter. This is not an unrelated or implicit global registry.

The 19 retained spans are recorded below. All offsets are UTF-8 half-open byte ranges. The final two interop spans belong to the index asset; all other spans belong to the renderer.

- `common-registry-uFs` `[4487978,4488366)`, SHA-256 `20092afc76070f69084a9c6eec18d1f9173e28cd7239610d55ea9ef8a47fb9d1`.
- `full-registry-dFs` `[4488367,4490081)`, SHA-256 `182c4faa17f465ac4ed972b8bdaa5917b4ef2802711559c18a0756db6f30bf88`.
- `highlight-core-fFs-and-pFs-binding` `[4490094,4512210)`, SHA-256 `6d25b1d3094420802240e7b8a4d7015ae315a62130dd6db222b9a7615b8b46dc`.
- `lowlight-factory-gFs` `[4512210,4513521)`, SHA-256 `87c54e2b88f216c09d77ed4f53b81b665ec88a06737f827271a50c77da04ad0e`.
- `highlight-emitter-bFs` `[4513521,4514396)`, SHA-256 `f13c60c51a0c3ceee6d5040cd10f3796aaee46191f7dac57e4009984af9006b7`.
- `registry-and-cutoff-binding` `[4514396,4514423)`, SHA-256 `8302615fbc8f63a0129d4712fb1565e3dfe6c3008328a74c4b704e18d9688b5f`.
- `highlight-consumer-i1e` `[4514849,4516267)`, SHA-256 `eb8c2c135fe24f580e733f4bc8378e7bcbd47750ca16cda03a06291f12d0a9a6`.
- `language-parser-V$t` `[4516301,4516402)`, SHA-256 `cf3f68b7dc2fd71a5d24bdc761d6bba8342e572f6aba1ea80e1b2cff08dd6739`.
- `code-consumer-$Xs` `[6545913,6546798)`, SHA-256 `d664b4d77b4eca45ae9bcc75a67ab0480580ae5dc8be64e32aa0fec09c5d8562`.
- `code-block-WJe` `[4516402,4518213)`, SHA-256 `8bca789a22bf92ce0f0efb9123b88c4923c80f7e2a18044974f4a7d28244a179`.
- `renderer-index-import` `[52991,66495)`, SHA-256 `711b96377098ad3838934209f1710cb85acfc256abecae07605139daf0670ed5`.
- `standard-wrapper-xS` `[6550618,6551722)`, SHA-256 `a07330f389b4cd51067832834b6418949256690d604ae6a6fea3902e7b9ac8e1`.
- `workspace-host-pEi` `[6548725,6550420)`, SHA-256 `efae9424849d941421c66cf6e9b644ef73ecb1a797ef638be08b3046358ede15`.
- `component-map-VXs` `[6547974,6548073)`, SHA-256 `52dbe173bb02be2801306380ae1823cacb390feba4759d527885a401ad770e6e`.
- `markdown-host-dHn` `[6548274,6548567)`, SHA-256 `86a76ce15009f4a3a4dd16419d083462484430dbbf2ba8f8c54ccdfa4615d534`.
- `assistant-text-branch` `[8870027,8870969)`, SHA-256 `95066ad731bbe806d317467e445620008c16e3084d366e38aa8b58995f893c1e`.
- `Nix-grammar-PLs` `[4121267,4124655)`, SHA-256 `018a31a0ae16b895be860e3c169cd83d725dc797d7a0f09ea6c3c8a1b2854c47`.
- `Dk-default-interop-definition` `[117763,117864)`, SHA-256 `0234768a9a5db321fa7ad872061578be6f51a4ea0fa4bcd9043f1003b2518ca1`.
- `Dk-index-b9-export-alias` `[3480797,3480809)`, SHA-256 `6b21aa25e9380d987515a17ca73fbdb02b83debd66936f00d2ed8247b5ec3b07`.

No reference JavaScript or packet script was executed. The suggested broader common-to-all grammar change in the source packet was not adopted.

## Checked OpenConductor source

Fresh `origin/main` was `1b75772349ee3e97b4f4ac9dec594d67b3048e15` before the fix. The current Markdown source and lockfile matched the packet's bytes:

- `src/features/chat/markdown.ts`, SHA-256 `1b6e2475477dd1bbe92a23c60a68cc85632228c70b97b39f6fd6844b3cb868ab`.
- `package-lock.json`, SHA-256 `8fcbe02ec5febe97b0900d4a612a8bccf148d3ca40b868c77361e38e06e9dbf1`.

Both included dependency archives matched the current lockfile's SHA-512 SRI and the packet's SHA-256:

- `lowlight@3.3.0`, 15,245 bytes, SHA-256 `00d85c3f0f77f3d1214e465b8a4c41e0513add492aab373ea1a8bee5e8dbd7ad`.
- `highlight.js@11.11.2`, 840,690 bytes, SHA-256 `5737fc030ac76469b797691464564cd5a88068327519078022637d7d638c7ce9`.

A read-only Python check independently enumerated all 37 common-map imports and all 30 literal alias arrays or assignments in those grammar files. It reproduced the packet's conservative name superset, including Arduino's `ino` assignment. Neither `nix` nor `nixos` occurs in that set. The locked lowlight factory creates a fresh Highlight.js instance and registers only the supplied grammars. The checked Markdown source supplied `common` without further registration.

The fix imports the existing public `highlight.js/lib/languages/nix` entry and supplies `{ ...common, nix }`. It adds no dependency and enables no other full-registry language.

## Behavioral regression

The regression renders the real `Markdown` component using React server rendering. It exercises ordinary fenced code, not a source-string assertion or mocked grammar registry.

Before the production edit:

```text
node --test src/features/chat/codeNixHighlighting.test.ts
# tests 7
# pass 4
# fail 3
```

The `nix`, `nixos`, and 100,000-character Nix cases lacked the expected `hljs` code surface and tokens. The TypeScript common-language control, unknown-language fallback, missing-language fallback, and 100,001-character cutoff control passed.

After the registration-only edit, the unchanged test file has SHA-256 `8bd3344bed7b21a9e4c921e70cb8bd1f0acae4f309f7eb82468373930c4982f9`. The combined run passed:

```text
node --test src/features/chat/codeNixHighlighting.test.ts src/features/chat/markdown.test.ts src/features/chat/markdownFrontmatter.test.ts src/features/chat/copyCodeFeedback.test.ts
# tests 99
# pass 99
# fail 0
```

The boundary cases use actual fences whose values are exactly 100,000 and 100,001 characters after removal of the renderer-added final newline. Unknown and missing languages preserve escaped plain source. Tests also retain the scroll wrapper, code surface, and copy button; existing copy-feedback tests cover its payload and notification behavior.

- `npm run typecheck` passed.
- `npm run build` passed, with Vite's non-fatal large-chunk warning.
- `git diff --check` passed.

All commands ran on this Session's Reason cloud computer. Native app, browser, real clipboard, and side-by-side visual acceptance were not run or authorized in this source-only unit. There is no screenshot for that reason. A successful macOS packaging workflow proves consumption and packaging only, not native execution or visual parity.
