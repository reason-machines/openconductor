# Sent-user ordinary HTTP(S) links

Conductor Rebuild. Delivery owner SAME029f; evidence source be7a40e4. Unit SENT-USER-HTTP-LINKS-BE7-01 follows merged #938, without reopening #847 or #916. The regression-only checkpoint preceded the bounded correction in PR #947.

## Provenance and scope

Reference: Conductor 0.87.6 shipped renderer `renderApp-D_fmY7hW.js`, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`; index `index-BGEQ8YjU.js`, SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`. Retained REA receipt `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2` skipped renderer semantic analysis after heap exhaustion. Static decoded shipped bytes are not successful semantic analysis or runtime observation.

The source owner transported the original handoff, receipt, audit and all 13 complete spans in two authenticated Session messages. All original SHA-256 locks passed independently. Full original assets were recovered from this Session's existing upload `write-content-disclosure-rea-packet.tar.gz`, SHA-256 `a6bf38db90720609aca1f3e3c941ab145818836c10127467538a084e0c679726`; only the two named regular members were read. Both full-asset hashes and all 13 span-to-asset hashes passed. No vendor JavaScript was imported or executed; no reference acquisition occurred.

Original handoff SHA-256: `f31470732ad3f8ea2c745985187ccf4c340f8b8a898a75c1da38d61f315ee7fb`. Original receipt: `190395ca584b2c82353a99739d2b5a07d51aea51cfdd6f21ebce2cba15e8ed96`. Unmodified audit: `f4c12d326b2549291a9e42dd6e2cff05cb88f5b06bb62b433526e38b4fca4336`.

## Current source comparison

Default main was fetched and read at `be38582638f1e40eb091d9bcd5c595bcb1ba1b63`. The supported existing assigned branch integrated main without touching the stopped source owner's branch. Its net diff against main was empty before the new regression.

`python3 .rea-work/user-links-packet/audit_user_text.py be38582638f1e40eb091d9bcd5c595bcb1ba1b63` passed **25/25 static assertions and 13 complete spans** on Reason Cloud. Before correction, the same unmodified audit was rerun against fetched default main `3555c192cd00b8781d8bdfe225ea0a09d1fe5c81`, again passing **25/25 and all 13 spans**. It re-read plain Transcript user rows, rich sent text, existing LinkWithMenu and backend.openUrl, including their Git blobs. At that checked main both user text branches still insert raw text; assistant Markdown already uses LinkWithMenu/openUrl. Those four production files had no diff between the delivery checkout and this main.

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

## Hosted RED and correction

Automatic PR CI run [42914099024](https://github.com/reason-machines/openconductor/actions/runs/42914099024), tied to regression-only head `9809c14cc3b6cd11cc6308f37344afc5fc95acca`, reproduced **exactly seven intended failures** in `node --test "src/**/*.test.ts"`: the four plain-text URL cases, production opener/context callbacks, rich-text links beside chips, and ordinary workspace-origin/path variants. The four explicit literal/special exclusion cases passed. Both frontend jobs reported **2,020 tests / 2,013 pass / 7 fail**. This is an observed regression RED, not a successful check.

- [Frontend unit job 130171920015](https://github.com/reason-machines/openconductor/actions/runs/42914099024/job/130171920015): failure window lines 4572–4794 shows empty actual anchor targets, including the plain and rich production render paths. All seven `not ok` names belong to `userText.test.ts`.
- [Frontend typecheck/build job 130171919634](https://github.com/reason-machines/openconductor/actions/runs/42914099024/job/130171919634): the same seven failures; `npm run typecheck` and color lint passed before the regression step. Build and subsequent steps were skipped, not passed.

The unchanged regression fixture SHA-256 is `0410992207283b4a3abba04f9f1f57c75deec66b6d6e0b1cbeecb1d0a1107604`. The correction adds private `UserText.tsx` and uses it only in the plain user-row branch and rich text-part branch. URL matching, punctuation stripping and bracket balance follow the retained source. Original visible text and MessageActions copy text are preserved. Anchors reuse unmodified LinkWithMenu and its existing production openUrl callback; no shared-helper changes.

The sixth cleared test-only path now supplies the real UserText functions to the existing transcriptAgentSummary VM extraction. Every original summary assertion and the complete test body from `const sid` onward remain byte-identical; no passive replacement leaf or product test-environment branch was introduced.

Static checks on Reason Cloud passed: locked fixture hash, unchanged summary assertions, unchanged excluded helpers, and `git diff --check`. Automatic correction [CI run 42916255723](https://github.com/reason-machines/openconductor/actions/runs/42916255723), tied to head `00157d449e38631373e96d22dd812bb86940b29b`, passed **2,031 TypeScript tests and 45 onboarding regressions**, with zero failures, in [frontend unit job 130179347160](https://github.com/reason-machines/openconductor/actions/runs/42916255723/job/130179347160). [Frontend typecheck/build job 130179346911](https://github.com/reason-machines/openconductor/actions/runs/42916255723/job/130179346911) also passed. Checkout was synthetic merge `02e68b8`, not standalone-head execution; the larger total includes intervening main changes.

CodeQL check `130179658583` reported two high-severity incomplete-URL-substring-sanitization findings on the preview exclusion. Re-reading retained `link-z5e.txt` confirmed the reference intentionally classifies matching substrings anywhere in the original text, not only a parsed hostname. This branch leaves those URLs literal with no navigation or preview; it is not a security allowlist. The follow-up represents this as the explicit case-sensitive text pattern `/(?:wikipedia|wiktionary)\.org/` and `hasPreviewText`, preserving that exclusion, including query strings and deceptive hostnames. It does not adopt a host-trust check, add a preview or suppress/dismiss the scanner. Python static comparison of the extracted pattern against the original predicate passed 648 contextual cases (including foreign hosts, query/hash, case changes, literal-dot near-misses, Unicode and line separators). This is a static equivalence check, not JavaScript execution. The locked regression fixture and summary dependency binding remain byte-identical. Current main was fetched and re-read at `802204ebdc033ee42efcb8620d589584c4818000`: its plain and rich user branches still render raw text. Follow-up automatic CI/CodeQL, merge and consuming-main/package checks remain pending. No manual dispatch or rerun.

## Explicit exclusions and acceptance gaps

File schemes, exact recognized Conductor workspace routes and the case-sensitive whole-string Wikipedia/Wiktionary preview predicate remain excluded from generic HTTP navigation. Their unchanged literal fallback is not claimed as parity. No new preview, iframe, network read, cloud UI or file handler. No shared LinkMenu/backend/Markdown/CSS, ToolRows, provider, queue, schema, persistence or metadata changes.

No local Node/tests/install/build/runtime, browser, native, provider or visual acceptance was run under the explicit scope. No screenshot exists for that reason. Hosted mounted tests are not native navigation or side-by-side appearance; package success is not deployment.
