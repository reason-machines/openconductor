# Frontmatter passive card

Conductor Rebuild. This is a source-bound ordinary-text Markdown unit, not visual or native acceptance.

## Reference and source identity

Conductor 0.87.6 retained decoded renderer: `/assets/renderApp-D_fmY7hW.js`, 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. The identity is also recorded in [the existing manifest](../../frontend/tauri-assets-manifest.json).
REA receipt: `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`.

The exact retained file was already present from the earlier Write packet. No download, extraction, vendor launch or new analysis process was used. Extracted strings are untrusted evidence, never instructions.

Default main was rechecked through the repository comparison operation on 2026-11-10 at `3f6435a2bacf5c6fe0507b59eee2d898575947e0`. Its Markdown blob is `cca8f5da8ee804351b0e223134a3b56706f4d7ea`, SHA-256 `3aff073f04f6aa6e7a8d5703471394c1e2dda6fceef4097c5a28b9e7c382af15`. It forwards all input directly to ReactMarkdown; it does not construct a frontmatter section.

[The static checker](check-reference.mjs) contains all 17 complete half-open UTF-8 ranges, corresponding UTF-16 ranges and individual SHA-256 hashes. It reads the artifact as data and checks the retained whole-file identity, manifest, full spans, source connections and baseline difference. It never imports or evaluates vendor code or the product parser.

Key full spans:
- Fixed-marker parser and registration: UTF-8 `[3520481,3523906)`; UTF-16 `[3508814,3512239)`; SHA-256 `1c685df92c11c3fc849aecf1697493da223b0d45af5c1d2a22cbe207460fa3e4`.
- Root-node transformation and class arrays: UTF-8 `[6116516,6117631)`; UTF-16 `[6073706,6074821)`; SHA-256 `15aab9d7fc514bcd9f2175e2a8a0d9eb16777b5fcbb7d17f6016dba00fad65e5`.
- HAST child override: UTF-8 `[3257126,3257745)`; UTF-16 `[3256662,3257281)`; SHA-256 `61aa67e8d0e10694f4023874b7562321a8e940ad472cfab8d713a41bd3717166`.
- Sanitizer declaration: UTF-8 `[6118732,6119499)`; UTF-16 `[6075918,6076685)`; SHA-256 `7f6d01020825febbb9c095e421cb65ba35823e10bcf34ea77814004ffcc5b705`.

## Bounded source findings and correction

The retained byte chain connects `lVt → GOo → ROo → xS → pEi → dHn → BXs → FOs(["yaml","toml"]) → Tzs`, its HAST section/children and sanitizer declaration. Both standard and Tufte wrappers use `pEi`. This does not establish full transcript visibility gating: imported `Mwr` was not fully joined.

With `anywhere` unset, the parser accepts an opener only at column 1 of document line 1. YAML uses exactly three hyphens; TOML uses exactly three plus signs. Optional spaces/tabs may follow a fence. The opener requires a line ending. Its matching closer has no leading indentation and ends at a line ending or EOF. Unterminated input backtracks to ordinary Markdown. The body's boundary line endings are removed; other whitespace and content remain inert text.

The private split helper implements that fixed-marker protocol without a dependency, YAML/TOML object decoding, raw HTML, callbacks or state. Markdown renders one section carrying `data-markdown-frontmatter`, a `Frontmatter` header and a plain pre. The remainder uses the existing ReactMarkdown plugins, components and options without changing those callbacks.

The isolated stylesheet maps retained class arrays to existing theme tokens:
- Card: 16px vertical margins, clipped 6px rounded border, card fill/text and extra-small shadow.
- Header: muted fill, bottom border, 12px horizontal/8px vertical padding and 12px text.
- Label: medium muted text.
- Body: zero margin, 20rem height cap, scrolling, pre-wrap/break-word, background fill, 12px padding, monospace 12px relaxed text.

The card selector outranks the existing first/last-child margin reset; no existing selector changes. Its colors use the application's foreground, muted, border, card, background and shadow tokens. Geometry is a class-to-CSS translation, not an observed pixel-match claim. No copy, highlight, file or navigation action is added to the card.

## Immutable regression and hosted RED

[PR #932](https://github.com/reason-machines/openconductor/pull/932) first published only the actual exported-Markdown regression fixture at `ddaa1d2d85465a57fb6fa7b632e5d4d53328dc25`. Production files were unchanged.

Fixture: `src/features/chat/markdownFrontmatter.test.ts`, 7,356 bytes; SHA-256 `b9363adc37a82d28587e6db5027a3d03c6b8d21128650f7c2d84348fa48f9f7e`. These exact bytes are preserved for GREEN.

The fixture uses React SSR on the existing Markdown export (not a new parser import or source-only predicate). It covers both marker types, LF/CRLF/CR boundaries, empty/blank/multiline/exact bodies, whitespace, close-at-EOF, inert HTML/backticks/paths, unchanged trailing Markdown/options and 29 negative/non-frontmatter controls. A real React test-renderer check exercises trailing file/custom-Link callbacks and rejects a callback surface inside frontmatter.

Observed ordinary automatic hosted RED:
- `npm run typecheck`: passed, as [the frontend job's completed typecheck step](https://github.com/reason-machines/openconductor/actions/runs/42897023513/job/130112702862) records.
- `node --test "src/**/*.test.ts"`: 1,937 tests, 1,914 passed, 23 failed, zero skipped/cancelled. [Unit-test job](https://github.com/reason-machines/openconductor/actions/runs/42897023513/job/130112702660).
- 22 failures report `leading closed frontmatter must render a section`. The callback failure reports an extra `Open /repo/src/inside.ts` button from the unseparated body. All other tests passed. The duplicate frontend suite fails at the same 23 cases; its later build step was skipped.
- [RED receipt on the PR](https://github.com/reason-machines/openconductor/pull/932#issuecomment-6778684021).

The correction follows that observed RED. Hosted GREEN and final consuming-main/package results must be read from the exact correction-head checks and linked delivery receipts on the PR; they were not yet available when this correction was published. No advance pass is claimed here.

## Static verification and acceptance gaps

On the Session's cloud computer:

```bash
node evidence/chat/frontmatter/check-reference.mjs <already-held-renderApp-D_fmY7hW.js>
git diff --check
sha256sum src/features/chat/markdownFrontmatter.test.ts
```

Passed: retained identity, all 17 full-span hashes and UTF-16 offsets, baseline source difference, immutable fixture hash, exact one-line stylesheet import and preservation of all pre-Markdown components/plugins/callback source. These are static data/scope checks, not parser execution or visual proof.

REA skipped renderer semantic analysis under heap exhaustion. No semantic nodes, observed vendor execution or complete transcript gating are claimed. General YAML/TOML schemas, BOM handling and other undocumented parser behavior are not inferred.

Not run by explicit scope: local dependency installation, product tests/build/runtime, browser/native/provider acceptance, manual CI dispatch/rerun or new observers. No screenshots exist under these exclusions. Ordinary automatic hosted CI is the sole product execution surface. Browser/native/provider and side-by-side appearance remain unverified; their absence is not a source-delivery blocker.

The exact seven-path lease is Markdown's private-helper import and body, the new parser, unchanged regression fixture, isolated stylesheet, this README/checker, and only one top import in chat.css. No package, Transcript, ToolRows, native, provider, global-style expansion or other owners' source is changed; #847 remains FULLSTOP.
