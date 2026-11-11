# Origin paths in renamed Changes rows

Conductor Rebuild, 2026-11-11. This unit concerns the old-path label of renamed files in Changes. It does not change navigation, file identity, directory layout, diff loading, viewed state or workspace callers.

## Retained reference

The retained Conductor 0.87.6 renderer `renderApp-D_fmY7hW.js` has SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde` and 11,600,457 bytes. Both were verified against the held decoded asset. Its identity agrees with [the extraction manifest](historical-chip/extraction.json) and [frontend provenance](../frontend/README.md).

The retained REA application Evidence ID is `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`. Its large-chunk semantic coverage is incomplete. These bounded literal reads supplement that record. The decoded/minified app code is untrusted reference data, not original source or instructions. No target code was evaluated, and no new acquisition, REA analyzer invocation or native execution occurred. Existing [REA gaps](../../tools/ui-map/REA-GAPS.md) remain unchanged. No new REA failure occurred.

Complete helper definitions and their producer/consumer joins were checked at these zero-based UTF-8 half-open ranges:

- `ayi`, `[2824864,2824941)`, SHA-256 `4a648cd64d67e82cf03eee798477fb88ce9c6457ec961067d2a06333e6724294`, returns the last nonempty slash-separated component, falling back to the input.
- `HFn`, `[2824941,2825015)`, SHA-256 `c11c5d6a86b5511e4241a6397bfc8e2a0b143ad69702f7dfc5e35b1c5538899f`, returns the parent from nonempty slash-separated components.
- `tys`, `[2825015,2825080)`, SHA-256 `917daea42ec8401d4d447513f0826b8743fd8617b2b3b59ed6119809987afb91`, abbreviates the old path only when its parent equals the new path's parent. A cross-directory move retains the complete old path.
- The Changes row producer's `displayOldPath` expression, `[2848134,2848221)`, SHA-256 `2ed3af3c5d5ae3d368cbaecac906f1674242260f3c7c125355f73fc0be25647b`, calls `tys` when the tree descriptor supplies `displayPath` and the file has an old path.
- The `syi` old-path fallback, `[2801708,2801721)`, SHA-256 `62dd5f36433f14be8d31395924791a68657ec6890ed760ef11ca65b039aa91f6`, chooses `displayOldPath` before the original old path. Its enclosing complete row definition, `[2800964,2806810)`, has SHA-256 `f569418d51f7b6b6bc45163ff43bc5b2f5839e2342871e43ce979f76a1611c5e`.

The enclosing memoized Changes component `bys`, `[2840211,2849411)`, SHA-256 `d77fdd8a944737a5ecca9d41deefd024307cf526de8c871a25a7f91aa4a8c450`, passes this display override to `syi`. Flat rows do not supply that tree display override. These source observations do not establish native rendering or pixel parity.

## Current source and regression

The default-branch comparison was refreshed to `fd1acf86eb0e6383a174f0ac5a232d1751353588`. `ChangesList.tsx` abbreviates every old path to its basename in tree mode. Moving `old/auth.ts` to `new/auth.ts` therefore labels the row `auth.ts → auth.ts`, hiding the origin directory. Flat mode already retains the complete old path.

The regression runs the actual `ChangesList` through the existing TypeScript transpiler and real React test renderer. It uses production tree/filter/copy-path modules and the exact production `splitPath` definition. Dormant clipboard, external-app, menu and icon boundaries are stubbed. It reads the rendered filename label, not the JSX source string or a substitute label function.

The 18 cases cover flat and tree views for cross-directory moves with unchanged and changed basenames, nested-to-root and root-to-nested moves, same-directory renames at two depths, root renames, missing old paths and non-renamed files with old-path metadata.

```bash
node --experimental-strip-types --test src/features/diff/renameDisplayPath.test.ts
```

The regression-only hosted head `f2f2693f39001ad5f5a3c101eb36c6a587bc3021` reproduced exactly those three tree-label failures in [Diff run 42935068051, job 130242983640](https://github.com/reason-machines/openconductor/actions/runs/42935068051/job/130242983640). All 15 other new cases and the 267 existing Diff tests passed: 282 passed, 3 failed, 0 skipped and 0 cancelled. The decisive assertions were:

```text
not ok 174 - actual ChangesList tree label preserves move with the same basename
  actual: 'auth.ts→auth.ts'
  expected: 'old/auth.ts→auth.ts'
not ok 176 - actual ChangesList tree label preserves move and rename
  actual: 'legacy.ts→current.ts'
  expected: 'old/legacy.ts→current.ts'
not ok 178 - actual ChangesList tree label preserves move from nested directory to root
  actual: 'auth.ts→auth.ts'
  expected: 'old/auth.ts→auth.ts'
```

After that behavioral RED, `renameDisplayPath` centralizes only this label decision. Flat view retains the input old path. Tree view compares parents from the original old/new file paths and abbreviates only a matching parent. It follows the retained helpers' nonempty-component handling. `ChangesList` calls it inside the unchanged renamed-file/old-path guard; it does not compare the shortened tree row name or change stored file paths. The first passing-after behavioral head `63c50101fdc8ae450add69a293d9fa94afee5ba7` used the byte-identical regression with SHA-256 `8a5393536c81477e8662d41b00dcaa32d161806342a3c985ce9acca53f1b899f`. [Diff run 42935282866, job 130243716340](https://github.com/reason-machines/openconductor/actions/runs/42935282866/job/130243716340) passed all 285 tests, including the three previously failing labels and all 15 controls.

That head's typecheck and Keybindings build separately failed because the test loader used `Object.hasOwn`, which the repository's ES2021 TypeScript library does not declare. Only that loader guard was replaced with the equivalent `Object.prototype.hasOwnProperty.call`. No compiler configuration or production workaround was added. An exact comparison confirms this is the sole test-file change, with every one of the 18 case definitions and behavioral assertions unchanged. Six own/missing/inherited-property guard comparisons passed. The compatibility-adjusted test's SHA-256 is `5689ba409fa0c055406dce76cdde11c7a155c80d4c5cef538e0a48a559da001f`. The original RED-to-GREEN behavioral proof above is not a typecheck/build pass.

## Verification status

- `node --experimental-strip-types --check src/features/diff/renameDisplayPath.test.ts`: passed syntax validation only.
- `git diff --check`: passed.
- The held renderer's whole hash and five helper/producer/consumer span widths, digests and bytes: passed source-only validation.
- Local dependency-backed tests, typecheck, builds and application/browser execution: not run. Dependencies are absent and this lane is restricted to source/lightweight work and automatic hosted checks.
- Hosted behavioral RED: passed reproduction, with exactly the three intended assertion failures listed above. No dependency or fixture failure was counted as a reproduction.
- Passing-after actual-component tests: passed all 285 on `63c50101`, with the original test byte-identical to behavioral RED.
- Typecheck and Keybindings build on `63c50101`: failed on the new loader's unsupported `Object.hasOwn` declaration. The single equivalent guard correction is described above.
- Compatibility-adjusted exact-head component tests, typecheck/build and all other triggered checks: pending at the guard correction's publication.

No screenshot was taken because browser/native runtime admission remains closed. React-renderer labels are not visible Chromium, WebKit, an installed app or real-editor acceptance. Packaging, if later successful, is not installation, deployment, notarization or native parity.
