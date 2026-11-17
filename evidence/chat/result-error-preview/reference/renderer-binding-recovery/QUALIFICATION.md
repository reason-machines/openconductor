# Retained terminal-error preview source closure

Prepared by Conductor Rebuild. Evidence extraction only; BE7 owns comparison, RED and any chat repair. Both requested missing literals are resolved. This is not a defect verdict or mounted/native acceptance.

## Parent identity and provenance

- `index-BGEQ8YjU.js`: 3,493,297 bytes; SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.
- `renderApp-D_fmY7hW.js`: 11,600,457 bytes; SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- Both complete parent files were freshly read and hashed on Reason Cloud. The renderer handoff archive is 3,475,109 bytes, SHA-256 `ca33ccd3b7e25e947925c8f2f26c45cfe2f1eb66f05c6bc45c50f3a74b93d8d7`. Its manifest identifies the already-held `settings-result-cache-v1.tar.gz`, SHA-256 `f8e1df1ac213881feb36802439649548eeb0bc98591bbb524376feba82ab0b95`, member `settings-result-cache-v1/be7-source/cache-token-result-source-closure/originals/renderApp-D_fmY7hW.js`.
- Historical extraction lineage: `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. The historical renderer REA analysis reported heap exhaustion. No new REA invocation, capture, extraction, installed-identity read or native operation occurred.
- Settings49's `f72df80a…985e6ab` / 13,025,924-byte `conductor-runtime.js` is a distinct Bun sidecar, not this renderer. It was not used or read here.

## 1. Exact producer-to-renderer binding: resolved

The full index export declaration `[3479840,3493154)` includes `_jt as my`. The full renderer static import declaration `[52991,66495)` contains `my as Zwr` at `[61305,61314)` and ends with `from"./index-BGEQ8YjU.js";`.

This closes the literal module join for the retained asset pair, without assuming a matching symbol name:

`index _jt → export my → renderer import Zwr → MDo → lVt → GOo → ROo → xS(muted: !isPreviewMessage)`.

The prior 22 index/renderer records all match exact ranges of the now-held complete parent files. `MDo` calls `Zwr(turn)` once. `_jt` marks whole messages by selected message ID, not a part index; the assistant path passes that flag to each text block.

This proves the static retained-source binding, not installed-app/package containment or the visual outcome of any particular mounted transcript.

## 2. Complete result-error renderer: resolved

`QOo` is exactly `[8901673,8903362)`, 1,689 bytes, SHA-256 `85fde3e15d77b5eaecdc69c8c054ef18f560d9f07e5b2c002d1d0c8f9fd945ad`. Its complete body is retained, followed immediately by complete `XOo`, then `JOo`.

`JOo` routes a top-level `content.type === "result"` with truthy `is_error` to `QOo`. This truthy presentation condition differs from index selector `die`, which requires `is_error === true`. No inference equates malformed/non-boolean representations.

The complete component:

1. Reads session and current-workspace context. It uses session `agentType` or `gu(model)` to label errors `Codex`, `Cursor`, otherwise `Claude Code`.
2. Uses `errors ?? []`, filters out only entries starting with `[ede_diagnostic]`, and normalizes the first surviving error or `result` through `dDi`.
3. For Claude, authentication-result or unsupported-model/host predicates delegate to `hDi`. This branch precedes diagnostic-only suppression.
4. Otherwise, when the original error list is nonempty but no entries survive that filter, returns `null`.
5. Otherwise sends the provider-prefixed error text to `EHe`; more than one surviving error adds an `All errors:` tooltip.

Complete direct helpers `XOo`, `dDi`, `lDi`, `oVt`, `fDi`, `dOo`, `Fp` and `EHe` are retained. The previously retained complete `hDi` matches the raw parent. Index exports and direct `fs`/`Ht` bodies qualify the imported provider-name/host-accessor identities, without expanding their model predicates, baseline configuration or policy.

`QOo` has no `isPreviewMessage`, prior-message update or collapse decision. `EHe` passes its own error string to `xS` without a `muted` prop; UI-library defaults are not established by this packet. Interaction handlers in the retained complete components are inert source, not executed or independently qualified.

## 3. What a terminal error does — and does not — establish

Within the retained original selector pipeline, a top-level error or result with `is_error === true` is selected. If encountered before any already-selected message in the reverse scan, it inhibits selection of older ordinary assistant text. Segment boundaries and ordering matter. The newly resolved module binding now connects that selected-ID result to the renderer's per-message preview flag.

Earlier ordinary messages therefore may receive `isPreviewMessage: false`; ordinary text is passed `muted: true`. Unselected messages can become summary-eligible when the existing count/filter gates allow it. Actual visible collapse additionally depends on completion, expansion and settings gates. The result-error display component does not independently recalculate prior-message preview selection.

These statements are static source conclusions, not executed behavior examples, a differential RED or a screenshot/native result.

## Residual gaps — no repair inference

- Original top-level `content.type = error` and top-level result errors are not the same representation as original nested `tool_result.is_error`, normalized OpenConductor `tool_result.isError`, or normalized `turn_status` / `turn_end`.
- The original-to-normalized producer/event mapping remains unqualified. This packet does not show which original content, if any, corresponds to a failing normalized turn without a top-level error message.
- Session/workspace value population, imported hook/library defaults, backend/provider behavior and actual retry interactions remain outside this bounded source task.
- No current-main differential comparison or RED ran this turn. Prior normalized snapshots remain pinned at `91de35a7`; the repository HEAD observed this turn is recorded only for provenance in the manifest, not as a newly compared production source.
- Exact installed reference build identity, containing package and mounted/native failed-turn emphasis/collapse remain unverified. No native-owner acknowledgement or runtime admission is claimed.

## Verification

**Passed:** both complete parent length/digest checks; 36 exact UTF-8 range/hash records (including all 22 previously retained records matched against full parents); complete import/export envelopes; named-function boundaries; 14 syntax-only checks using `node --check` (the export declaration is checked in its unchanged full index parent because an isolated export list cannot resolve its own local declarations). No code was evaluated.

Packet verification:

```bash
python3 verify_packet.py
python3 verify_packet.py --renderer /path/to/renderApp-D_fmY7hW.js --index /path/to/index-BGEQ8YjU.js
```

The first command verifies the portable exact literals; supplying parents also validates parent identity and exact parent ranges. The packet deliberately does not duplicate the complete raw asset.

**Not run:** vendor JS import/eval/execution; behavioral examples; product tests; typecheck/build; new source acquisition/REA/app/browser/provider/native/package operations; current-main product comparison; product/test edits; runtime dispatch; new worker or watcher.
