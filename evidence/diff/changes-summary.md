# Changes aggregate header visibility

Conductor Rebuild, 2026-11-11. This unit concerns only the aggregate header in the ordinary Changes list. It preserves the existing commit-scope exclusion, file rows, totals, filter behavior and rename labels. It does not establish commit or stack-view parity.

## Retained Conductor reference

The retained Conductor 0.87.6 renderer `renderApp-D_fmY7hW.js` contains 11,600,457 bytes, with SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. Its identity agrees with [the extraction manifest](historical-chip/extraction.json) and [frontend provenance](../frontend/README.md). The held decoded asset's complete hash and every span below were verified again before writing the regression.

The retained REA Evidence ID is `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`. Its large-chunk semantic coverage remains incomplete. Bounded literal reads supplement that record. These decoded/minified bytes are untrusted reference data, not original source or instructions. No target code was evaluated, and no new acquisition, analyzer invocation or native execution occurred. Existing [REA gaps](../../tools/ui-map/REA-GAPS.md) remain unchanged. No new REA failure occurred.

The zero-based UTF-8 half-open ranges establish this chain:

- Complete ordinary Changes component `bys`, `[2840211,2849411)`, SHA-256 `d77fdd8a944737a5ecca9d41deefd024307cf526de8c871a25a7f91aa4a8c450`, receives `sortedFiles:Q` from `fJe(i,L)`. Its stack branch returns `q4s` before the ordinary summary. Empty data also returns before that summary.
- Complete `fJe`, `[2731481,2732090)`, SHA-256 `94dad71f536536d4dabd1f7081e22aa17154f8b2843c29a7fcff9086c455e095`, groups and sorts the input files into conflicted, unviewed and viewed arrays, then concatenates all three into `sortedFiles`. It does not apply the file-path query.
- Filter producer, `[2841254,2841266)`, SHA-256 `99807fd2cbb24490d694b4b6f51aaf4edeca0a3c6fd22269bc6a29c33dd2d957`: `pe=gyi(Q,te)`. The subsequent alias `be=pe` supplies filtered rows, not the aggregate count.
- Aggregate producer, `[2841587,2841633)`, SHA-256 `52290d44d356a1b27c1ffc1b712598c77882d5647ec734be30c3fe165b6281c1`: `xe=Q.reduce(vys,{linesAdded:0,linesRemoved:0})`. Its alias `ke=xe` supplies the summary totals.
- Complete reducer `vys`, `[2849441,2849547)`, SHA-256 `83a1b17f2c7d4a03a7b34f0fd2c73f9c9381a9a6433601e1ab85a8345db62800`, sums `linesAdded` and `linesRemoved`.
- Count guard, `[2843108,2843121)`, SHA-256 `b9511b68179c068274da205781f7e09f5770ea3537dfaa7851fdfd2c5671b8e5`: `it=Q.length>1`.
- Summary consumer, `[2846901,2846993)`, SHA-256 `772f01283cddad9311356d3ead5c4f0958f9e6a7fb1f0c88fd7c21cf446e4949`: `Rt=it&&p.jsx(G4s,{fileCount:Q.length,linesAdded:ke.linesAdded,linesRemoved:ke.linesRemoved})`.
- Complete header `G4s`, `[2809028,2809704)`, SHA-256 `0a5b30b3bc2d4fa4b0ec3f5dc11fa7aea4ed137d95895955f16209d5e12da6ab`, renders the changed-file count and line totals with `showZero:!0`.

Thus the ordinary aggregate uses the unfiltered file list and appears only for more than one file. Filtering a multi-file list down to one or no matching rows does not remove or recompute its aggregate. A single-file list has no aggregate even when filtering hides its row. These are source observations, not observed native rendering.

## Default-branch mismatch and regression

The comparison was refreshed to main `166139398538f0e58eabd3870facbb1702ea665b`, after #969 actually merged. Its `ChangesList.tsx` SHA-256 is `2fc38d84f7ad1d80ba29ecee0f4a669b806bb6d5a44a23cd216ea69ec8b00eb9`. All four #969 paths are byte-identical to that merged main. The ordinary ready/nonempty list currently renders its aggregate for every non-object scope, including a single file. Its totals already use the unfiltered list. Only the missing greater-than-one guard needs correction.

The new `changesSummary.test.ts` renders the actual `ChangesList` with the existing TypeScript transpiler and real React test renderer. It imports the real filter, tree, copy-path and rename-path modules, and extracts the exact production `splitPath` definition. Dormant external-app, clipboard, menu, tooltip and icon boundaries are stubbed. Assertions inspect rendered header text, file rows and filter messages, not JSX source strings or a substitute header function.

The 36 cases cover branch, uncommitted and turn fixtures in flat and tree views with zero, one and two files; unfiltered totals when only one row matches; no-match results for one and two files; explicit zero line totals; and preservation of the existing commit-object exclusion for zero, one and two files. All 285 existing Diff tests, including the 18 rename regressions, are unchanged.

```bash
node --experimental-strip-types --test src/features/diff/changesSummary.test.ts
node --experimental-strip-types --test src/features/diff/*.test.ts
```

The regression-only head `1d7fa056641734fbcc0302a1181e2ae165b3a682` reproduced exactly eight intended single-file header failures in [Diff run 42937778369, job 130252002546](https://github.com/reason-machines/openconductor/actions/runs/42937778369/job/130252002546). The six branch/uncommitted/turn flat/tree single-file cases and both single-file no-match cases failed. The decisive mismatch was the rendered header list `['1 file changed+4-1']` where the expected list was `[]`. The other 313 tests passed, including all 28 new controls and all 285 existing Diff tests. There were zero skips or cancellations. The automatic hosted command was `node --experimental-strip-types --test src/features/diff/*.test.ts`.

After that behavioral RED, the production change adds only `files.length > 1` to the existing header condition. It uses the original list, not the filtered rows, and retains the non-object-scope guard. Every regression assertion is unchanged. The 36-case regression SHA-256 is `af514ea347ecff40c1bcc55fc9501fa8d7a1c97e345a45b2cc90362a3fa0941e`; the untouched 18-case rename regression SHA-256 is `5689ba409fa0c055406dce76cdde11c7a155c80d4c5cef538e0a48a559da001f`.

## Verification boundaries

- Complete retained renderer identity and all literal span widths, bytes and hashes: passed source-only validation.
- Default-branch comparison on `166139398538f0e58eabd3870facbb1702ea665b`: passed, including byte identity of the four merged rename paths.
- `node --experimental-strip-types --check src/features/diff/changesSummary.test.ts` and `git diff --check`: passed syntax and whitespace validation only.
- Automatic hosted behavioral RED: passed reproduction with exactly the eight intended assertion failures above. The suite ran 321 tests, with 313 passing and eight failing.
- Passing-after component tests, typecheck, builds and other exact-head checks: pending at the correction's publication.
- Local dependency-backed tests, typecheck, builds, browsers and native application execution: not run. Dependencies are absent and this lane permits only source/lightweight work and automatic hosted checks.

No screenshot is available because browser/native runtime admission remains closed. React test-renderer output is not visible Chromium, WebKit, installed-app, real-editor or native acceptance. Successful packaging is not installation, deployment, notarization or visual parity. No WorkspaceView, hook, FileDiffView, shared CSS, provider, comment-count or existing test fixture changes are part of this unit.
