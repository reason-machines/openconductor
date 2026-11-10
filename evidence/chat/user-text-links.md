# Sent-user ordinary HTTP(S) links

Conductor Rebuild. Delivery owner SAME029f; evidence source be7a40e4. Unit SENT-USER-HTTP-LINKS-BE7-01 follows merged #938, without reopening #847 or #916. Regression-first checkpoint: production source is unchanged in this increment.

## Provenance and scope

Reference: Conductor 0.87.6 shipped renderer `renderApp-D_fmY7hW.js`, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`; index `index-BGEQ8YjU.js`, SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`. Retained REA receipt `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2` skipped renderer semantic analysis after heap exhaustion. Static decoded shipped bytes are not successful semantic analysis or runtime observation.

The source owner transported the original handoff, receipt, audit and all 13 complete spans in two authenticated Session messages. All original SHA-256 locks passed independently. Full original assets were recovered from this Session's existing upload `write-content-disclosure-rea-packet.tar.gz`, SHA-256 `a6bf38db90720609aca1f3e3c941ab145818836c10127467538a084e0c679726`; only the two named regular members were read. Both full-asset hashes and all 13 span-to-asset hashes passed. No vendor JavaScript was imported or executed; no reference acquisition occurred.

Original handoff SHA-256: `f31470732ad3f8ea2c745985187ccf4c340f8b8a898a75c1da38d61f315ee7fb`. Original receipt: `190395ca584b2c82353a99739d2b5a07d51aea51cfdd6f21ebce2cba15e8ed96`. Unmodified audit: `f4c12d326b2549291a9e42dd6e2cff05cb88f5b06bb62b433526e38b4fca4336`.

## Current source comparison

Default main was fetched and read at `be38582638f1e40eb091d9bcd5c595bcb1ba1b63`. The supported existing assigned branch integrated main without touching the stopped source owner's branch. Its net diff against main was empty before the new regression.

`python3 .rea-work/user-links-packet/audit_user_text.py be38582638f1e40eb091d9bcd5c595bcb1ba1b63` passed **25/25 static assertions and 13 complete spans** on Reason Cloud. It re-read current plain Transcript user rows, rich sent text, existing LinkWithMenu and backend.openUrl, including their Git blobs. Both user text branches still insert raw text; assistant Markdown already uses LinkWithMenu/openUrl.

## Complete source joins

- `WOo` settled/queued user branch invokes `IOo`; queue context does not expand this unit into queue behavior.
- `IOo` uses `jri`, index `lz` export `loe`, to decode structured tokens. Text fragments are split by newline and passed to `bOo`; file/attachment handling is separate.
- `bOo` recognizes case-sensitive `/https?:\/\/[^\s<>]+/g`. `gOo` trims trailing `.,!?;:` and single/double quotes. `mOo` trims `)`, `]`, `}` only when that closing count exceeds its opening count inside the candidate. Leading, intervening, trailing and trimmed text remain in order.
- Each trimmed target and label reach `z5e`. Ordinary HTTP(S) anchor callbacks prevent default and invoke `vs(n)` with the original trimmed target.
- Renderer import `dG as vs` joins index export `Rue as dG`; `Rue` invokes `plugin:opener|open_url` with `{url:t,with:e}`. This is a static click-boundary join, not an observed native invocation.

Complete UTF-8 half-open ranges and SHA-256 identities:

- renderer user-WOo `[8888340,8895883)`: `4b90b5a2139db4f56e35ecbb311d00f586d41c24ce1c6e0d1a61d4d5072173c3`
- renderer rich-IOo `[8867370,8870021)`: `edf267a71a8d14291d2c28d0b2f4551bd94c3b82dc6e818c6bd9aebbeb78e816`
- index parser-loe `[1389713,1390513)`: `d3bbc32bb2dd279fbe10f58751afe1a929c1cd817ed616172329ebce98d85812`
- renderer text-fOo-mOo-gOo-bOo `[8860446,8861492)`: `1e913286fb81a83e691344f6555b202c32be7c3996e7647d71bb58f84ee2e54c`
- renderer link-z5e `[6532394,6535885)`: `3b8139d3f061f3687dad3e72cc9320cf993e63bdd9e16ff5dfc1136c6a985c08`
- renderer file-discriminator `[6130315,6130638)`: `13c70a14212f8f1c6400e4b6f62964f3d353509c4d5978bfaca1ef4c18995b1a`
- index workspace-origins `[778882,779008)`: `5c6851a644a9771efb0a1337c8b3e777b66d071c38adc2c3e8487ea7c472e2c9`
- index url-parser-AJ `[180214,180265)`: `54bffa8cfe07ea0dc3ab438c70d89dd47e1ace64df9884df22d977c30fe8926b`
- index workspace-discriminator `[779008,779290)`: `a8f08d644b08d2b295f1cb3ac78d557b4a6839a2c3f8a2bc38198f979e4b66c8`
- index opener-Rue `[2543420,2543494)`: `0602e4646c67f7bc952c618aa736007efcca5dcac75450beb393e34a69811f54`
- renderer renderer-index-import `[52991,66495)`: `711b96377098ad3838934209f1710cb85acfc256abecae07605139daf0670ed5`
- index opener-export `[3482114,3482123)`: `9141a9550be7a24c042f7b7341e12c056ce2fd289d45b12a04f6c597728d5839`
- index workspace-export `[3483546,3483555)`: `a4f5de5e4cb4c162b27e3615c6f28dd03e3f8ecfd265bb88841a0f276d89661f`

## Regression and delivery contract

The new fixture mounts actual production plain Transcript and rich SentUserContent text branches. It uses the unchanged production LinkWithMenu callbacks, with native-open and clipboard effects captured only at their platform boundaries. It checks multiple HTTP/HTTPS targets, punctuation/quotes/brackets, raw multiline/HTML/Markdown-like text, unchanged concatenation and original copy text, accessible anchors, exact opener targets, context actions, adjacent file/attachment chip targets and callback isolation, special exclusions and exact workspace-route boundaries.

The fixture permits absent UserText only while production still renders its original raw text; it supplies no replacement implementation. It must remain byte-identical through the correction. Existing transcriptAgentSummary.test.ts extracts Row without imports; the ledger cleared a sixth, test-only dependency-injection hunk for the real production UserText when the correction lands. All its summary assertions must remain unchanged.

Automatic hosted RED has not yet been observed at this checkpoint. Hosted GREEN, typecheck/build of the correction, merge and consuming-main/package checks are not yet verified. No manual dispatch or rerun.

## Explicit exclusions and acceptance gaps

File schemes, exact recognized Conductor workspace routes and the case-sensitive whole-string Wikipedia/Wiktionary preview predicate remain excluded from generic HTTP navigation. Their unchanged literal fallback is not claimed as parity. No new preview, iframe, network read, cloud UI or file handler. No shared LinkMenu/backend/Markdown/CSS, ToolRows, provider, queue, schema, persistence or metadata changes.

No local Node/tests/install/build/runtime, browser, native, provider or visual acceptance was run under the explicit scope. No screenshot exists for that reason. Hosted mounted tests are not native navigation or side-by-side appearance; package success is not deployment.
