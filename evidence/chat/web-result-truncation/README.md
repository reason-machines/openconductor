# Web result truncation

Conductor Rebuild implements CHAT.WEB-RESULT-TRUNCATION in the successful-string web arm only. WebFetch and WebSearch display the first 100,000 UTF-16 code units, then `Content truncated (N chars total)` when the original result exceeds that limit. `N` uses the original string length and `toLocaleString()`.

The full result remains in the transcript. Prompt text, empty-result gating, short-result child shape, query/URL display, and error handling are unchanged. No shared shell, Markdown, transport, Edit, Glob, TaskGet, Write, or existing prompt fixture changed.

## Source qualification

BE7's sealed packet was requalified against main `d745c5259712b49f90ab47ecb2bad674a66c3c89`. All nine packet snapshots matched byte-for-byte, and its static verifier passed 51 checks.

The source is retained real-app REA evidence `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`, recorded as Conductor 0.87.6. The complete renderer hash is `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. The retained `upo` renderer calls `H9e(u,U9e)`, with `U9e=1e5`, and conditionally renders the original string length. The relevant original-byte spans and source receipt are retained here.

This is shipped-source evidence, not a fresh native observation. The original REA semantic renderer analysis exhausted its heap and skipped this asset. No semantic rerun, installed app identity check, or live provider observation is claimed.

## Executed regression

On the Reason Linux cloud computer:

```bash
node --test src/features/chat/webResultTruncation.test.ts src/features/chat/webFetchPrompt.test.ts
```

- RED on the fresh-main baseline: 12 passed, 8 failed. Every over-limit frozen case failed the expanded real-row body assertion. All seven existing prompt controls passed.
- GREEN after the web-arm correction: all 20 passed, with the same test and input bytes.
- `npm run typecheck`: passed.
- `npm run build`: passed, with the existing bundle-size warning.
- `git diff --check`: passed.

The mounted regression exercises actual `applyReasonPayload`, reducer, `buildRows`, tool normalization, and production `ConductorToolRow` code with real React. It checks open/close behavior, prompt order, output-only structure, the exact threshold and notice, WebFetch/WebSearch, surrogate splits, combining text, CRLF, and literal markup. It asserts that the complete result still reaches the component. Unrelated Markdown/link/backend dependencies throw if invoked rather than replace web-row selection.

The sealed test, all 13 input/expectation cases, and the seven existing prompt controls remain byte-identical. See `behavior.json` for hashes and per-case results.

## Verification limits

No browser screenshot, native app, real provider, manual E2E, or installed package was exercised. No new server, workflow dispatch, or watcher was started. Package/release follow-through remains with the existing sole owner 992a715e. Automatic PR checks and consuming-main receipts are separate from these local results.

The Laziness Protocol kept the correction at one call site without a helper or upstream truncation. The TDD skill required actual behavioral RED before the same frozen cases passed GREEN. The optional `deslop` plugin is unavailable; the diff was reviewed manually without modifying frozen tests.
