# Explicit Claude result-error preview qualification

Author: Conductor Rebuild. Follow-on to #1404, source-only scope.

## Outcome and boundary

At refreshed main `91de35a7e10199675bc43d9b29516cd8ec18f4a0`, a constructed
Claude `result {is_error:true,result:"Synthetic result failure."}` with
`stopping=false` preserved the preceding ordinary text as a preview. The
retained original source instead selects the terminal error result, so the
preceding ordinary text must not be the preview. This is a source-derived
preview-emphasis repair, not a live/native/package parity verdict.

The frozen baseline boundary regression is **2 pass / 1 intended fail / 0
skip**, exit 1. It preserved success and normalized cancellation controls.
`baseline/red.tap.gz` preserves the actual output losslessly. The failing error case was:

- Expected `previewTexts: []`, status `failed`, exact synthetic error text.
- Actual `previewTexts: ["Work in progress."]`, status `failed`, same error.

The status/error policy was already correct. A status-only repair would
incorrectly change generic failures, transport errors, cancellation, and the
other agents. The repair adds an explicit provenance marker only when the
Claude mapper observes `is_error=true` and Stop is not requested. The existing
failure outcome/message stay unchanged. That marker passes through the real
wire serializer, frontend event adapter, reducer, row view, and save/restore;
only the ordinary preview candidate is suppressed. Plan/question protection
stays intact. An absent marker retains existing behavior, including old saved
transcripts whose result provenance cannot be recovered.

## Original-source proof, without vendor execution

Both retained full parents were byte-verified (not evaluated):

- `index-BGEQ8YjU.js`: 3,493,297 bytes, SHA-256
  `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.
- `renderApp-D_fmY7hW.js`: 11,600,457 bytes, SHA-256
  `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.

The retained REA lineage and its acquisition gaps/limitations are in
`reference/renderer-binding-recovery/manifest.json`. No new REA acquisition
was made in this lane. Every source string is treated as untrusted data.

The constructed common case follows the retained source chain:

`TB → yB → Hie → MB → addAssistantMessage → LA → Mb/AB → rF/DA/zd → aiMessages → wB → hie/Ett/Att → _jt`.

`MB` leaves this raw result intact. The strict result-error predicate in `die`
is `is_error===true`; the selector uses the result ID rather than promoting
older ordinary text. The renderer imports `my as Zwr`, and the full index
exports `_jt as my`. The presentation join is
`selector → MDo → lVt → GOo → ROo`, with `muted=!isPreviewMessage`.
One prior ordinary message alone does not qualify a summary collapse.

The independently retained complete `QOo` error renderer has no preview or
collapse input. Its auth/model, diagnostic-only and multi-error presentation
branches are not normalized `turn_end` failures and are not newly claimed as
implemented here. Likewise no claim equates nested tool errors, standalone API
messages, top-level errors, cancellation, or all failed turns.

The source packet has 37 index extension records plus SAME15's 36 binding
records; duplicate source spans are retained with their original manifests.
Recheck all 73 literal records without evaluating vendor code:

```bash
python3 evidence/chat/result-error-preview/verify-source.py \
  --index /path/to/retained/index-BGEQ8YjU.js \
  --renderer /path/to/retained/renderApp-D_fmY7hW.js
```

## Reproduction and repair checks

Original baseline command, executed at the main commit above before product
changes (files remain frozen under `baseline/`; only their directory changed):

```bash
node --experimental-strip-types --test .ara-state/tmp/chat-error-mapping/red.mjs
```

For a clean checkout of that baseline, copy the preserved files to the same
three-level scratch location (the script's relative imports stay unchanged):

```bash
mkdir -p .ara-state/tmp/chat-error-mapping
cp evidence/chat/result-error-preview/baseline/{red.mjs,cases.json} .ara-state/tmp/chat-error-mapping/
node --experimental-strip-types --test .ara-state/tmp/chat-error-mapping/red.mjs
```

That baseline script consumes the OLD producer-normalized boundary, not the
new marker. It is intentionally retained as failing evidence, not described
as a green post-repair test. The raw result and success/stopping input values
are unchanged in `raw.json`; `wire.json` records the new serializer output.
The current source-linked Rust test asserts those exact raw-to-wire mappings,
and the frontend tests consume that same wire fixture to assert preview,
status, error, restart behavior and preservation controls. No vendor selector
implementation is duplicated or evaluated as a test oracle.

Commands:

```bash
python3 evidence/chat/result-error-preview/test-mapper.py
node --test src/features/chat/{resultErrorPreview,reason,reducer,persist,toolGroups,protectedMessagePreview,transcriptAgentSummary,finalMessageCopy,turnInterruption}.test.ts
npm run typecheck
npm run build
rustfmt --check --edition 2021 src-tauri/src/claude_chat/{map.rs,map_tests.rs} src-tauri/src/reason_acp/{provider.rs,wire.rs}
```

The pure Rust harness copies current production data declarations verbatim
with source hashes and includes actual parser/mapper/wire implementations and
existing tests by path. It links no runner, RPC provider, Tauri command, app,
CLI subprocess, or native window. Cargo itself is the compilation command;
no Claude/Reason/Codex process or API is started. Full-app Rust compilation is
not asserted by this isolated harness.

Latest decisive logs are in `validation/`: **152 adjacent frontend tests pass,
0 fail, 0 skip** (including all 12 new focused tests); **18 pure Rust tests
pass, 0 fail, 0 ignored**; typecheck, production build, rustfmt and whitespace
checks pass. Build emits only the existing advisory chunk-size warnings.
All **73 retained literal records pass** full-parent byte verification.

Focused controls cover explicit
result error, success, Stop, subtype-only generic failure, absent-marker
Reason/Codex failures, prompt transport failure, standalone API error, nested
tool failure, protected plan/question messages, invalid metadata on nonfailed
outcomes, subsequent turn isolation, and save/restore of new and legacy turns.

## Deliberately unverified

No browser, mounted transcript, provider execution, native acquisition,
installed app, package inclusion, or side-by-side visual acceptance was run.
There is no screenshot because runtime/native acquisition was excluded from
this lane. Home271/E1 retain existing package/native acceptance; no duplicate
runtime or watcher was started, and the E1 provider usage-limit failure was
not retried.

The historical local suite remains **4,754 pass / 2 navigation failures**,
with cause unverified. This lane neither reclassifies those failures nor uses
these focused passing tests to erase them. #1404's hosted 4,767/0 result is
historical and separate from this follow-on's exact-head CI.
