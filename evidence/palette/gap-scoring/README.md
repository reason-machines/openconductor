# Palette gap penalties

Conductor Rebuild owns this repair. It changes only the command scorer and adds a focused regression fixture. Workspace matching, result grouping, keyboard navigation, and the built-app E2E driver are unchanged.

## Defect

The old scorer averages per-character contributions. A complete ordered subsequence has a minimum average of 0.3, and the length adjustment is at least 0.9. Such matches therefore score at least 0.27, above the palette's 0.2 cutoff, even when unrelated letters are scattered across long aliases.

The Cairo regression covers Create section and Codex tool approvals, both with their normal aliases. Its result-model case requires the Cairo workspace without those unrelated command and settings rows. A control preserves contiguous aliases, word-start initials, exact matches, and missing-query rejection. This is not a snapshot of the failing job's entire result list.

## Reference evidence

The [retained custom-filter packet](../create-section/source/custom-filter-spans.json) binds the palette's explicit filter to its complete scorer closure. The original renderer is 11,600,457 bytes with SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.

The custom `hRt` closure occupies half-open UTF-8 bytes `[8457894, 8458998)`, SHA-256 `7af03a8d22411decca30dfa14f8abe37b74900ac2e5b0664e9b01478925270a2`. It multiplies penalties for scattered matches, distinguishes punctuation and word boundaries, normalizes case and whitespace, and handles adjacent transpositions. The palette's `wUi` filter at `[10872078, 10872171)` keeps only scores strictly above 0.2.

These are inert original compiled-JavaScript observations from retained REA evidence `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`. The earlier REA JavaScript worker exhausted its heap and skipped parsing. The packet is not a generated call graph or reference execution. No reference JavaScript was evaluated for this repair.

The replacement expresses that recurrence as a memoized search over candidate and query indices. It retains the existing ordered, trimmed value-plus-alias input and the empty-query score of 1.

## Failure witness and limits

[Home PR #1026](https://github.com/reason-machines/openconductor/pull/1026) failed the workspace-highlight guard in [Reason E2E job 130463619471](https://github.com/reason-machines/openconductor/actions/runs/43003046474/job/130463619471). The Home and E2E owners inspected its artifact and reported Cairo at index 39 of 40 results, with Add projects without GitHub active at index 21 after 21 Down events. Enter and the navigation round trip had not run. Later failures occurred with the palette overlay still open and were not independently diagnosed here.

The preceding successful main run used Santiago, not the same Cairo input. Identical source blobs do not establish a controlled same-Cairo baseline app failure.

No E2E assertion, iteration cap, timeout, query, or driver changes belong to this repair. A focused scorer and result-model check does not prove native input, visual parity, complete application behavior, or live agent operation. No screenshot is provided by this source-only unit; the existing serialized executor owns runtime admission.

## Frozen source check

Baseline `f2fd6e19316a4cb57dbb412340638cb83193ab5c` and checked default-main `5555ec597fa5d3af0311ae0094eb3134d87fbb08` have identical bytes for all 11 files in the fixture's import closure and nearby tests. The original renderer, all ten retained source spans, frozen fixture, and candidate hashes passed byte and digest checks. See [the manifest](source/manifest.json) and [the current-main check](source/current-main-source-check.json).

The four-case fixture SHA-256 is `5137ef699747c1e3b88bb6b702ee38fcafe022de99b0906d004ce961fcb298ef`. The candidate scorer SHA-256 is `6919f4b3e6806687da56fa4ed13ca4c52bebcc2dd077586b80a6130520ef2e38`.

## Behavioral validation

The existing serialized executor ran the frozen source-only packet on Reason Cloud with Node 22.23.4. [The unmodified receipt](source/actual-red-green-nearby-receipt.json) includes complete TAP, commands, source pins, exit codes, and timestamps. Its SHA-256 is `a82f2bd3d8b9af92a087a0aea6490489156f0a5644d121ece129d69365165934`.

The same literal command ran against the baseline and then the candidate in separate private directories:

```bash
timeout --kill-after=5s 90s node --test --test-concurrency=1 src/palette/search/scoreGap.test.ts
```

- Baseline failed as intended at 10:51:22Z on 2026-11-11. Three assertions failed and one control passed. Create section scored `0.36487804878048785`, and Codex tool approvals scored `0.5615632183908046`. Both unrelated rows preceded `workspace:cairo` in the result-model case. Exit code 1, no setup failure.
- After replacing only the private scorer with the pinned candidate, all four unchanged cases passed at 10:52:16Z. Exit code 0.
- The unchanged nearby command passed all 19 cases at 10:52:17Z. Exit code 0:

```bash
timeout --kill-after=5s 90s node --test --test-concurrency=1 src/palette/search.test.ts src/palette/search/score.test.ts
```

All three processes terminated without a resource-limit hit. The fixture and existing assertions were rehashed after execution. No install, retry, typecheck, build, browser, native app, provider call, or reference-JavaScript evaluation ran in this unit. The production repair was applied only after this receipt arrived.

Full application checks belong to ordinary exact-head hosted CI. These focused passes are not Home's same-Cairo built-app acceptance or native visual parity.
