# BashOutput raw-string results

Conductor Rebuild fixes `CHAT.BASHOUTPUT-RAW-STRING-RESULT-GATE` with two product hunks in `ToolRows.tsx`.
The background status, disclosure body, and independent error row now use a supplied raw string.
A supplied array, object, null, number, or boolean does not expose flattened output.
An empty raw string also suppresses fallback. Absent `rawResult` preserves the legacy flattened-string path.
Every other tool's error behavior is unchanged.

## Retained Conductor evidence

The original source packet identifies Conductor 0.87.6 and REA evidence `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`.
That historical semantic-renderer pass exhausted its heap. This change uses retained complete shipped-asset bytes, not a fresh installed-app observation.

The renderer SHA-256 is `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
Its complete `N0o` function occupies UTF-8 half-open bytes `[7815239, 7816650)` with SHA-256 `c8550eb415de595bfa048164f8500e66494629983f947f3802e0f72775314a6b`.
`N0o` keeps `toolResult.content` only when it is a string. That string supplies the body, status, and error row.
`R0o`, bytes `[7815154, 7815239)`, SHA-256 `68987b593e7592c5ec6113930dc8e19d2c5168ed45429cbc9a15791a49ae262d`, extracts and trims the first status value without trimming the body.
[Retained source metadata](retained-source.json) records all 18 spans and 11 producer/consumer source snapshots. Its pending-ownership and NOT_RUN fields describe the historical preparation only.
The complete relevant literal spans are under [reference](reference).

## Current-main qualification

[Reconciliation](reconciliation.json) checked main `c603fdb8965daf5dd731bd9458656f99f85df4ac` before the patch.
A conflict-free ordinary main merge on the assigned branch produced baseline HEAD `bd6de76fea02c447168eb87bb9a75fbfeac123fa`, whose tracked tree exactly matched that main.
All 11 retained source snapshots and 18 original spans still matched.
Locked required dependencies had no missing entries or version mismatches. React and react-test-renderer were both 18.3.1. No installation was needed.

The original [20-case freeze](freeze.json), test, input, and root lock were unchanged through RED and GREEN:

- Test: `4c79c6734db31ed9d942acb3d3b268ee0fee42f0903551989ebb66769e904263`.
- Input: `f8838513d92e7cc67e4c8f68a633981d6460b7929d4a19f12ca926920d023505`.
- Root lock: `0714cb6ccdd0e8332f4ff08dc6b9ec0eb786e8f7b6b386663d31b9323579796a`.

## Behavioral execution

The fixture drives the production Reason payload mapper, transcript reducer, row projection, and mounted `ConductorToolRow`.
It verifies status, disclosure availability and body, repeated opening and closing, independent error disclosure, and unchanged raw and flattened values.
Unrelated UI dependencies throw if called. This is component evidence, not a browser or native-app run.

Identical RED and GREEN command, once each:

```bash
nice -n 19 timeout --kill-after=5s 180s node --max-old-space-size=768 --experimental-strip-types --test --test-concurrency=1 src/features/chat/bashOutputRawString.test.ts
```

- [RED](red.json) reproduced exactly 12 intended assertion failures and eight passing controls, exit 1. [Lossless raw TAP](red.tap.gz).
- [GREEN](green.json) passed all 20 unchanged cases after the two-hunk fix, exit 0. No skips or cancellations. [Lossless raw TAP](green.tap.gz).

Adjacent command, once:

```bash
nice -n 19 timeout --kill-after=5s 180s node --max-old-space-size=768 --experimental-strip-types --test --test-concurrency=1 src/features/chat/conductorTools.test.ts src/features/chat/terminalOutputRawResult.test.ts src/features/chat/taskGetErrorResult.test.ts src/features/chat/taskListErrorResult.test.ts src/features/chat/taskUpdateErrorResult.test.ts src/features/chat/typedSubagentErrorResult.test.ts src/features/chat/typedSubagentLinks.test.ts src/features/chat/genericToolLabels.test.ts
```

[All 111 adjacent tests passed](adjacent.json), exit 0, across the eight retained files. [Lossless raw TAP](adjacent.tap.gz).
This includes the structured-terminal raw-string `123` hidden control and text-block-array `123` disclosure, plus typed-subagent behavior.

Typecheck command, once:

```bash
env NODE_OPTIONS=--max-old-space-size=1024 nice -n 19 timeout --kill-after=5s 180s npm run typecheck
```

[Typecheck passed](typecheck.json), exit 0, without compiler diagnostics. [Lossless raw output](typecheck.log.gz).
The test commands explicitly set the Node CLI heap to 768 MiB, which takes precedence over inherited NODE_OPTIONS. Typecheck explicitly replaces that environment setting with 1024 MiB.
No retry or extra runtime suite ran. Raw logs and the product patch are losslessly gzip-compressed, preserving the original bytes and whitespace; each receipt records the uncompressed log hash. `git diff --check` passed for product code before publication. Raw evidence whitespace initially failed the staged whitespace check; compression preserves that evidence without editing it. The final staged whitespace check passed.

## Release and remaining verification

All commands ran sequentially in the sole admitted ACC slot on Cloud computer 352, ID `00637189-5c55-416e-b457-ed7419fb739a`.
The [terminal release](release.json) records exact commands, exits, times, hashes, and explicit slot release at `2026-11-12T16:11:23.979083Z`.
No own runtime jobs remained visible and no server was started. Process and port observations cover only this Session's namespaces.

Browser, screenshots, native app, provider, authentication, build, packaging, and release inclusion were NOT_RUN.
No screenshot exists because browser, server, and native execution were outside this bounded grant.
The existing release owner and E1 retain package inclusion and native acceptance. The fixed #992 cut and #847/#1098 are unchanged.
This unit does not change Thinking, ImageGeneration, terminal1f, RowShell, parsers, helpers, or transport.
The ready standalone PR must pass every enabled exact-head check and triggered workflow before protected merge.
