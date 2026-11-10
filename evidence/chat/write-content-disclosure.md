# Write body disclosure

Conductor Rebuild, BE7-06 replacement owner `029f9db7-a5bb-49eb-b01a-8f660c2b4251`.

## Scope and source identity

This change adds initial Write **body** disclosure only. Write badge hover remains outside this unit. No cloud UI is added.

- Assigned branch: `reason/openconductor-write-cont-029f9db7`, delivery base `main`.
- Fresh clean binding and re-fetched main: `efec2e09d08e3f36484a29f72a8b4132e056d07d`.
- Re-read baseline `src/features/chat/ToolRows.tsx` git blob: `be6c1acb23f8c3492b4bdc8e50b6cb589d0dfa4b`.
- The retained audit's earlier `a82efd74f08012b0b1cb47be0085e26c536141ce` baseline is historical. The same ToolRows blob was independently re-read at the main commit above before production edits.
- Exclusive replacement transfer: ledger `BE7-06-T2-r680`. The old owner relinquished its lease without tracked changes. No additional source writer was created.
- [PR #927](https://github.com/reason-machines/openconductor/pull/927) is a fresh-main replacement, not reuse of #847 or #925.

Tracked changes are limited to the Write switch case and private WriteRow in ToolRows.tsx, new writeRows.test.ts, and this note.

## Retained real-Conductor evidence

Reference: Conductor 0.87.6, REA receipt `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`.

The supplied archive is 4,416,726 bytes with SHA-256 `a6bf38db90720609aca1f3e3c941ab145818836c10127467538a084e0c679726`. Inspection accepted exactly 11 regular data files. Absolute paths, parent traversal, backslash names, symlinks and hardlinks were rejected before extraction into ignored scratch. Revalidation compared every member with the retained bytes. The original receipt is saved separately from the current-main audit's generated receipt.

Whole decoded assets, SHA-256:

- Renderer: `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- Index: `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.

Complete renderer spans use half-open UTF-8 byte offsets:

- O1o `[7587305,7588525)`: `9f3ff5dc1b79f4690ad7b89b8911acbd083c2b97a4b3268f14f18cd964972184`.
- L1o `[7588525,7588936)`: `38f9343e156728f1decb69430d406c3c1ff29482da74e69e24b6d5c538834f25`.
- Qpo registry `[7877182,7877770)`: `94305b7588c4a5551656594289bc17ddb6934ed298cb76fc48181a2731105310`.
- hIt `[7877770,7878325)`: `8c45bb6e5892cce46330f820a54460ee896d1c14c19ad134dab20b9f20b75340`.
- hpo `[7845824,7847626)`: `439808b9941142548d2132720d96712eac341450ea87d9e9ccccdd5f5256ff3b`.
- sV `[7775444,7776600)`: `8b38333809c09e26d0d90ecf0ae88eae19cf9694747952170a37cea38edbf1e6`.
- Mu `[7795403,7798463)`: `2a88a2516341f7a98563d2f4b2a602ac9c0acc584282cd01cf54a011e3e4231d`.

The reviewed Python audit reads assets as bytes and text. It never imports or executes target JavaScript. Whole asset and seven-span identity checks passed. Its static mismatch check was rerun against current main before the correction:

```bash
python3 e2e-artifacts/write-body-retained-029f9db7/write-content-disclosure/audit.py origin/main
```

REA gap: renderer analysis exhausted its heap. These retained decoded bytes establish static shipped-artifact evidence, not original source or observed runtime behavior. No new native or browser observation was admitted to close that gap.

## Reference contract and correction

The complete spans establish the mapping and callback chain through O1o's D1o mapping, L1o, O1o with Qpo, hIt, and hpo. hpo reads `file_path` and `content`. Its row-local state starts false. `long` is `content.length > 2000`, and the initial body is `content.substring(0, 2000)` only when long and not expanded. JavaScript measures UTF-16 code units, not Unicode code points.

For long input, the body footer says `Showing first 2,000 characters` with `Show more`. Expansion renders all raw content, says `Showing full content`, and offers `Show less`. Collapsing disclosure restores the exact prefix. At 2,000 units or fewer, including empty input, no disclosure controls render. The header counts the full original `content.split("\n").length`, including hidden and trailing lines.

WriteRow owns the state above RowShell's conditional body, so closing the shell does not discard expansion. Each mounted WriteRow has separate state. The existing FileBadge navigation and separate error row remain in place. Write content never goes through stripMarkers. The shared DiffBlock renders the chosen raw string without replacement. Existing classes and local inline token styles are used; no CSS or shared helper changed.

The reference also uses the chosen string for its separate badge hover. That reference behavior is deliberately not implemented here. Existing generic Write no-hover controls are unchanged.

## Hosted behavioral RED before production correction

The first publication changed only writeRows.test.ts. Published head:
`4ea5d71bd1cd8e36e456af5dec45a7b8fed616e1`.

- [Automatic CI run 42885396192](https://github.com/reason-machines/openconductor/actions/runs/42885396192).
- [Frontend unit-test job 130072262519](https://github.com/reason-machines/openconductor/actions/runs/42885396192/job/130072262519).
- Command: `node --test "src/**/*.test.ts"`.
- Result: **failed as intended**, 1,870 tests, 1,863 passed, seven failed.
- `npm run typecheck` **passed** in [job 130072262667](https://github.com/reason-machines/openconductor/actions/runs/42885396192/job/130072262667). That job later failed at the same behavioral tests, not typechecking.

The seven failing production-row tests were the 2,001-unit initial cap, full/prefix disclosure roundtrip, hidden-line body prefix with full line count, astral boundary, independent expansion with shell collapse, initially collapsed reopening cap, and error-row independence with disclosure. Assertions showed overlong actual content or absent Show more controls. Representative hosted output:

```text
not ok 645 - Write 2001 UTF-16 units initially shows at most 2000, with controls only above the limit
failureType: 'testCodeFailure'
initial body is the exact 2000-unit prefix
not ok 650 - Write expansion is row-local and survives closing and reopening its outer shell
one production control exists
0 !== 1
# tests 1870
# pass 1863
# fail 7
```

The fixture mounts production ToolRows with real React hooks and the existing react-test-renderer dependency. Only unrelated Markdown is excluded. It covers empty, 1,999, 2,000 and 2,001 units, raw plus/minus and literal markup, the split surrogate at unit 2,000, full original line count, both toggle directions, row-local state, shell collapse, badge navigation, separate errors, Read, Edit, MultiEdit and no Write hover activation. Existing MultiEdit tests are untouched. No snapshots or source-regex claims substitute for mounted behavior.

The fixture must remain byte-identical for GREEN:

- SHA-256: `be7fdd26cb689ee518a05115997339cc76ce6ac7b783984babf256f2218306d9`.
- Git blob: `f63b529d523f73e3f9880b2b1fb5302a76b4e85d`.

## Preserved code identities

Removing only the baseline Write case, and only the replacement Write case plus private WriteRow, leaves byte-identical ToolRows content. SHA-256 of those preserved bytes:
`f11ef11ee6ecae5fcb464f3eddf37fcefac667d215243b5505b9edf088c14c12`.

Independently checked preserved hunk SHA-256 values:

- FileBadge and FileBadgeHover through the code-chip boundary: `86838bc7a5720c9367d2671adf833ddef4b15de4872ea774309cf916350619e1`.
- MultiEditRow through BashRow boundary: `46e92f62b9fde8a2fd5954a4433b9700c7803ac6f8315cebebed6dea941ea97e`.
- DiffBlock through textBlocks boundary: `a563eb1fa51a33d9c32ac8902bad3d51f4427d9eae4ee507b66e2cfa74d57418`.

Unchanged git blobs:

- multiEditHover.test.ts: `2d2069375c9a3bdf07be1f7aa154abaeec338b6a`.
- multiEditRows.test.ts: `58442d28b8a04bf220496a5db52a7a0239b707f1`.
- conductorTools.ts: `1b899339620f130ecbb2f39a1131de8a4c04ea68`.
- TurnChanges.tsx: `7dd024dfa4586face78c870ab27791b8236e58b4`.
- turnFilePreview.ts: `dc93e9bc8c0be29d95570c3858afcc022d08feac`.
- turnFilePreview.css: `1845722ad416eb9815527e181d7da5beb5d1020d`.
- markdown.ts: `cca8f5da8ee804351b0e223134a3b56706f4d7ea`.
- chat.css: `f795a1f884d768225db99e831ad0b2457983893e`.

The full preserved-byte check includes shell behavior, errors, path navigation, Read, Edit, footer and other row code. The repository diff is confined to the three leased paths. Providers and workflow files are not changed.

## Verification status at correction publication

- Retained archive, assets and complete spans: **passed**, data-only on Reason Cloud.
- Current-main static mismatch before correction: **passed**. The audit intentionally requires the old source shape and is not a post-fix behavioral test.
- Exact-hunk and preserved-blob checks: **passed**.
- Fixture unchanged from behavioral RED: **passed**.
- `git diff --check`: **passed**.
- Automatic hosted post-correction suite and all exact-head workflows: **pending**. Subsequent run receipts belong in the PR before merge.
- Local dependency installation, test, build, runtime, provider execution, server, browser and native checks: **not run**, explicitly excluded.
- Browser or native screenshots: **not captured**, explicitly excluded. Hosted mounted React checks do not establish native visual/body acceptance or any hover acceptance.
- Protected merge and exact consuming-main automatic workflow/package completion: **pending**, after all exact-head checks pass. Build/package success is not native behavior acceptance.

No manual workflow dispatch, rerun, workflow edit, new observer or protected-device activity was used.
