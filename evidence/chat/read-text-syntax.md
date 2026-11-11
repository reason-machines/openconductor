# Ordinary Read text syntax

Conductor Rebuild, READ-TEXT-SYNTAX-BE7-07; sole builder 6c9f, source owner be7. Exact scope: ToolRows Read arm, Read-only NumberedCode and the existing guarded highlight import; new readSyntaxHighlight.test.ts; this evidence note. No image, Markdown, shared RowShell/FileBadge, CSS, provider, Edit/Write/MultiEdit or frozen #847 changes.

## Source and fresh-main check

The original handoff archive is 4,564,369 bytes, SHA-256 `be4d818ce814c572dee9f346fd3e6b526a4f4723bffb308a6874959802786578`. All 15 members were checked as regular files with safe relative paths before copying. Its reviewed standard-library verifier independently checked two retained full assets, 22 reference spans, nine source snapshots, 15 main spans and 30 declarative source joins: PASS. No reference JavaScript was executed.

Historical REA receipt `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2` covers the Conductor 0.87.6 retained bytes. The renderer semantic analysis exhausted heap and skipped that asset. This is retained static source evidence, not new semantic analysis or observed native behavior.

- Renderer: 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- Companion index: 3,493,297 bytes, SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.
- Ordinary Read `O0o`, UTF-8 range `[7816650,7817911)`, cleans the result, selects the path language with `B0o`, and supplies the numbered lines to `w0o`.
- Language selector `B0o`, `[7823360,7823740)`, maps js/jsx to javascript, ts/tsx to typescript, py to python, rs to rust, json to json, yml/yaml to yaml, css to css, html/htm to html, xml to xml, sh/bash to bash; otherwise text. Extensions are case-insensitive.
- `w0o`, `[7801811,7802965)`, invokes inline `i1e` separately for each line. The complete mapper/highlighter span `[4514423,4516402)` guards registration and the 100,000-character cutoff before highlighting. No grammar state or combined-result cutoff crosses lines.

The packet's main snapshot is `887964ad496b1069e6ef0fb54f16df373e82932a`. Fresh main was fetched and merged into the assigned branch before test edits; tracked net diff to `39c05c2b52a96254e504821d6f25142c5d5eaee6` was zero. Its actual ordinary Claude Read path still reaches the same Read arm and raw-span NumberedCode. The existing markdown.ts highlight helper already implements the registration/cutoff guard and real lowlight syntax spans; its source is unchanged.

The preceding Edit-hover #994 is merged as `de772b84c4be571ffc51dabf8b327b9291534742`. Its 23 PR checks, exact-main CI and exact macOS package contract/byte identities passed. Its two fixtures remain unchanged at SHA-256 `2f6aab47c4a4bb8c13fd5a457a0c68246be64d1f8fd6451717019c99a3a9442e` and `66fb7ad9f7a9cc53c222c83e4397f8673c0e5fd55aff5c090a638c5202ccb733`.

## Mounted regression before production edits

The fixture executes actual applyReasonPayload → reducer → buildRows/conductorTools → ConductorToolRow → Read/NumberedCode, using ordinary Claude toolName/rawInput and real React/react-test-renderer. The real existing markdown.ts highlight implementation is imported, not stubbed; only unrelated Markdown/link/external-open leaves throw. This is component execution, not a provider, browser or native app run.

The primary example has file_path `/repo/src/example.ts`, offset 7 and numbered result lines. Assertions preserve cleaned text, the blank line, exact line numbers and the collapsed/expanded toggle, then require real const/true syntax spans. Canonical extension aliases, unmapped/registered-but-unmapped/pathless fallbacks, per-line grammar reset, per-line combined-result cutoff, exact/over-limit fallback, safe literal markup, file navigation and empty/error controls are covered.

Test-only milestone: production ToolRows is unchanged. Hosted mounted RED must fail for missing syntax spans, not loading or fixture errors, before the production patch is made. The fixture will remain unchanged through GREEN.

## Validation record

- `python3 .rea-work/read-syntax-handoff/verify-packet.py`: PASS, retained identities/spans and 30 joins only.
- `node --check src/features/chat/readSyntaxHighlight.test.ts`: PASS, syntax only.
- `git diff --check`: PASS. ToolRows, markdown.ts and both #994 fixtures remain byte-identical to fresh main before RED.
- New regression fixture frozen at SHA-256 `acd015bba3bd0db2b53c1842a278278a837ebc26813486e4c721cf40758120ef` before test-only publication.
- Hosted mounted RED: pending test-only publication.
- Production fix and unchanged GREEN/full suite/typecheck/build: not yet run.
- Containing-main CI and macOS package verification: pending delivery.

## Limits

No dependency installation or heavy local build. No native/browser/visual/actual-provider/installed-package acceptance; no screenshot because these app surfaces are excluded from this unit. Static reference evidence does not establish pixel, theme or token-for-token parity with a running Conductor. An eventual hosted macOS artifact is not an installation or native acceptance.
