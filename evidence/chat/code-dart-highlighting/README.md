# Fenced Dart highlighting

Conductor Rebuild registers only the existing locked Dart grammar alongside `common` and Nix. Ordinary multiline `dart` fences now render tokens. This change adds no dependency and does not expand the registry to all grammars.

## Retained reference source

The source owner supplied `dart-source-closure.tar.gz`, 6,226,760 bytes, SHA-256 `29557fbf62c37076841230dbaf9d9e2de7a77aa02b974ce3a1f8bb552d241fd6`. This Session checked that identity, rejected links and traversal paths, and read back all 11 extracted regular files against their original archive members.

The packet contains both complete retained shipped JavaScript assets. This Session independently checked their full lengths and SHA-256 digests, then checked all 20 embedded literal spans against their UTF-8 half-open byte ranges:

- `renderApp-D_fmY7hW.js`, 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- `index-BGEQ8YjU.js`, 3,493,297 bytes, SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.

The [Nix source note](../code-nix-highlighting/README.md#retained-reference-source) lists the shared 19 locators. Those spans were checked again here against the full original assets. The additional complete Dart factory `pPs` occupies renderer bytes `[3675486,3677689)`, 2,203 bytes, SHA-256 `9f2836f682f8a37f93c1aa63ac4f71102a8529c3272cf5599209bded8751caba`.

The source closes these joins:

1. Ordinary assistant text passes through `xS`, `pEi`, `dHn`, `VXs`, `$Xs`, and `WJe` to `i1e`. `WJe` removes one final newline.
2. `i1e` rejects a missing language, values longer than 100,000 characters, or a language absent from `EUn`. Otherwise it calls `EUn.highlight`.
3. `const EUn=gFs(dFs),_Fs=1e5;` binds that consumer to `dFs`. This map contains `dart:pPs`.
4. `gFs` creates a fresh `pFs.newInstance()` and registers the map. The renderer imports `b9 as Dk` from the retained index. The index exports `_u as b9`; `_u` resolves the module default. `fFs` sets its own default, so `Dk(hFs)` resolves that highlighter rather than an unrelated registry.
5. `pPs` returns the complete named Dart grammar without aliases. Its core helper references are present. Its Markdown comment sublanguage is already in `common`.

REA receipt `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2` identifies the retained source packet. The original semantic renderer analysis exhausted its heap. That limit remains recorded; source closure does not prove reference-app execution or visual parity.

The supplied `verify-source.py` was read before execution. It uses Python file reads, hashes, JSON, regular expressions, and tar member reads to rebuild the source packet. It passed with 20 reference spans, 37 common grammars, and 30 literal alias declarations. Its regenerated packet matched the original archive member byte for byte. No retained reference JavaScript was executed, and no new reference source was acquired.

## Checked current implementation

Fresh `origin/main` was `f19679e8b57ccba89f61c8212e144a39d567c458`, the merged Nix change from #985. Its main CI and macOS packaging passed before this sequential Dart code lease started. Native and visual acceptance are not part of that closure.

The packet's historical Markdown source was checked at `eef79ec9d15dba3661849024db8e4dd75c862be8`. A byte comparison established that fresh main differs from it only by the Nix import and registry initialization. Fresh-main identities before this fix were:

- `src/features/chat/markdown.ts`, SHA-256 `5d698abcec1aef6a633743e2bb5df5d47a08bf169bb5f375f3adcc7fb87f721e`.
- `package-lock.json`, SHA-256 `8fcbe02ec5febe97b0900d4a612a8bccf148d3ca40b868c77361e38e06e9dbf1`.

Both supplied dependency archives matched the current lockfile's SHA-512 SRI and their retained SHA-256 values:

- `lowlight@3.3.0`, 15,245 bytes, SHA-256 `00d85c3f0f77f3d1214e465b8a4c41e0513add492aab373ea1a8bee5e8dbd7ad`.
- `highlight.js@11.11.2`, 840,690 bytes, SHA-256 `5737fc030ac76469b797691464564cd5a88068327519078022637d7d638c7ce9`.

The verifier checked every common-map grammar and all 30 literal alias declarations, including Arduino's assignment. Dart is absent from that conservative name superset. The current source initializes `common` plus Nix without later registration. The retained Nix grammar has only the `nixos` alias, not Dart.

The public `highlight.js/lib/languages/dart` package export resolves to its ESM grammar. The locked CommonJS Dart member has SHA-256 `ea74baa813991a158984e40a26bbb10b24b1351c7c62bb7fe4224b019fa2586c`; the verifier checked its ESM equivalent and package export. Installed package metadata, lowlight initialization/common map, Highlight.js core, all common grammar members, and Nix and Dart CommonJS/ESM members matched the SRI-verified archives byte for byte.

The production diff adds only the Dart import and the `dart` registry entry. Nix remains registered. The cutoff, fallback, payload, layout, CopyCode, Transcript, CSS, Mermaid, and links are untouched.

## Behavioral regression

The test renders the real `Markdown` component through React server rendering. It does not mock the registry or assert source spelling.

Before the production edit:

```text
node --test src/features/chat/codeDartHighlighting.test.ts
# tests 7
# pass 5
# fail 2
```

The ordinary multiline Dart case and the 100,000-character Dart case failed because the expected highlighted code class and tokens were absent. Nix, common TypeScript, unknown-language fallback, missing-language fallback, and the 100,001-character cutoff control passed.

After the Dart-only registration, the same command passed all seven cases. The test file was unchanged, with SHA-256 `63a6dbc81ffef699c503b54fed4aafbed5690c60da79392b422fbf8247a600ef` before and after the production edit.

The related run also passed:

```text
node --test --test-concurrency=1 src/features/chat/codeDartHighlighting.test.ts src/features/chat/codeNixHighlighting.test.ts src/features/chat/markdown.test.ts src/features/chat/markdownFrontmatter.test.ts src/features/chat/copyCodeFeedback.test.ts
# tests 106
# pass 106
# fail 0
```

The new test checks keyword and number spans, unchanged Dart text, the existing code and scroll wrappers, and the copy-button label. The cutoff fixtures have exactly 100,000 and 100,001 characters after removal of the renderer-added final newline. Existing Nix and copy-feedback tests remain unchanged and pass, including the Nix alias and copy payload/notification behavior.

`git diff --check` passed. These focused checks ran on Reason cloud with one test worker. Full typechecking, build, and packaging were not run locally on the CPU-constrained shared computer; the existing hosted workflows verify those after publication. No native app, browser, real clipboard, or side-by-side visual check ran in this source-only unit. There is no screenshot for that reason. Packaging verifies consumption, not native or visual acceptance.

## CodeQL review follow-up

CodeQL flagged the new test's `replace(/<[^>]*>/g, "")` expression as incomplete HTML sanitization. That expression was used only to compare rendered text in an assertion, not to sanitize content for rendering. The test now compares the complete expected highlighted code fragment without stripping any tags. It still checks every source character, newline, keyword span, and number span. Production code and the other six cases are unchanged. No query, check, or alert was suppressed.

The original RED and GREEN hash above records the test before this review correction. The revised test has SHA-256 `3f164adc5f9cbbf93af5b3e5e9e65164636f74e3b40705991ae7d2a4b7a912f0`. The same related command passed all 106 cases again on Reason cloud after the assertion change. `git diff --check` also passed. The hosted CodeQL rerun remains the verification of the static-analysis finding; CodeQL was not run locally.
